import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { nanoid } from "nanoid";
import {
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";
import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { serverPost, serverGet } from "./server";
import { layout } from "./layout";
import { extractAuditSignals, type ProofEvent } from "./audit";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const PROOF_SECRET = process.env.PROOF_SECRET;
if (!PROOF_SECRET) {
  throw new Error("PROOF_SECRET environment variable is required");
}

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const turnstileEnabled = !!(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    },
  );
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

const PORT = parseInt(process.env.PORT || "3000", 10);

function deriveKey(id: string): Buffer {
  return createHmac("sha256", PROOF_SECRET!).update(id).digest();
}

function encrypt(
  plaintext: Buffer,
  key: Buffer,
): { iv: string; tag: string; data: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decrypt(iv: string, tag: string, data: string, key: Buffer): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);
}

async function view(name: string) {
  return Bun.file(`views/${name}.html`).text();
}

function getIP(
  req: Request,
  server: { requestIP(req: Request): { address: string } | null } | null,
): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    server?.requestIP(req)?.address ??
    "unknown"
  );
}

function generateSlug(): string {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "-",
    style: "lowerCase",
  });
  const number = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${name}-${number}`;
}

const mainNav = [{ href: "/about", text: "How it works" }];

const app = new Elysia()
  // Pages
  .get("/", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout(
      "Prove the effort behind your writing - Typestamp",
      mainNav,
      (await view("home"))
        .replace("__TURNSTILE_SITE_KEY__", TURNSTILE_SITE_KEY ?? "")
        .replace("__TURNSTILE_ENABLED__", String(turnstileEnabled)),
      false,
    );
  })
  .get("/proofs/:id", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout("Proofs - Typestamp", mainNav, await view("proof"));
  })
  .get("/proofs/:id/keystrokes", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout(
      "Keystroke audit - Typestamp",
      mainNav,
      await view("keystrokes"),
    );
  })
  .get("/ref", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout(
      "Create a reference - Typestamp",
      [{ href: "/about", text: "How it works" }],
      await view("ref"),
      true,
      false,
    );
  })
  .get("/about", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout("How it works - Typestamp", [], await view("about"));
  })
  .get("/use-cases", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout("Use cases - Typestamp", [], await view("use-cases"));
  })
  .get("/proofs/interpret", async ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return layout(
      "How to interpret a proof - Typestamp",
      [],
      await view("interpret"),
    );
  })
  // API
  .use(
    new Elysia()
      .use(
        rateLimit({
          duration: 3600000,
          max: 2,
          generator: getIP,
          scoping: "scoped",
        }),
      )
      .post(
        "/api/refs",
        async ({ body }) => {
          const { label } = body;
          const id = nanoid(10);
          const now = Date.now();
          const res = await serverPost("/refs", { id, label, created_at: now });
          if (res.status !== 201) {
            throw new Error(`server error: ${res.status}`);
          }
          return { id, label };
        },
        {
          body: t.Object({
            label: t.String({ minLength: 1 }),
          }),
        },
      ),
  )
  .use(
    new Elysia()
      .use(
        rateLimit({
          duration: 60000,
          max: 30,
          generator: getIP,
          scoping: "scoped",
        }),
      )
      .get("/api/refs/:id", async ({ params, set }) => {
        const { id } = params;
        const res = await serverGet(`/refs/${id}`);
        if (res.status === 404) {
          set.status = 404;
          return { error: "Not found" };
        }
        return res.json();
      }),
  )
  .use(
    new Elysia()
      .use(
        rateLimit({
          duration: 3600000,
          max: 3,
          generator: getIP,
          scoping: "scoped",
        }),
      )
      .onBeforeHandle(({ set }) => {
        set.headers["Access-Control-Allow-Origin"] = "*";
        set.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
        set.headers["Access-Control-Allow-Headers"] = "Content-Type";
      })
      .options("/api/proofs", ({ set }) => {
        set.headers["Access-Control-Allow-Origin"] = "*";
        set.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
        set.headers["Access-Control-Allow-Headers"] = "Content-Type";
        set.status = 204;
        return "";
      })
      .post(
        "/api/proofs",
        async ({ body, set, request }) => {
          const { content, events, ref_id, turnstile_token, source_host } = body;

          const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
          if (turnstileEnabled) {
            const valid = await verifyTurnstile(turnstile_token!, ip);
            if (!valid) {
              set.status = 403;
              return { error: "Verification failed" };
            }
          }

          const id = nanoid(10);
          const slug = generateSlug();
          const now = Date.now();
          const expires_at = now + 72 * 60 * 60 * 1000;

          const keystroke_count = events.filter(
            (e: { type: string }) => e.type === "key",
          ).length;
          const event_count = events.length;

          let active_duration = 0;
          let lastStart: number | null = null;
          for (const e of events as { type: string; timestamp: number }[]) {
            if (e.type === "start" || e.type === "resume" || e.type === "restore")
              lastStart = e.timestamp;
            if (
              (e.type === "pause" || e.type === "suspend" || e.type === "finish") &&
              lastStart !== null
            ) {
              active_duration += e.timestamp - lastStart;
              lastStart = null;
            }
          }
          active_duration = Math.round(active_duration / 1000);

          const finishEvent = (
            events as {
              type: string;
              timestamp: number;
              length: number;
              typed: number;
            }[]
          ).findLast((e) => e.type === "finish");
          const char_count = finishEvent?.length ?? 0;
          const typed_char_count = finishEvent?.typed ?? 0;
          const ended_at = finishEvent?.timestamp ?? now;

          const auditSignals = extractAuditSignals(events).map((s) => ({
            id: nanoid(10),
            proof_id: id,
            type: s.type,
            timestamp: s.timestamp,
            char_count: s.length,
            typed_char_count: s.typed,
            ...(s.key !== undefined ? { key: s.key } : {}),
            ...(s.pastedLength !== undefined
              ? { pasted_length: s.pastedLength }
              : {}),
          }));

          const payload = JSON.stringify({ content, events });
          const compressed = await gzipAsync(Buffer.from(payload, "utf8"));

          const key = deriveKey(id);
          const { iv, tag, data } = encrypt(compressed, key);

          const res = await serverPost("/proofs", {
            id,
            slug,
            iv,
            tag,
            data,
            ref_id: ref_id ?? null,
            source_host: source_host ?? null,
            created_at: now,
            ended_at,
            expires_at,
            event_count,
            keystroke_count,
            active_duration,
            char_count,
            typed_char_count,
            audit_signals: auditSignals,
          });

          if (res.status === 422) {
            set.status = 422;
            return {
              error:
                "The system rejected your submission. Reason: low human effort. Discard this session and start again.",
            };
          }
          if (res.status !== 201) {
            throw new Error(`server error: ${res.status}`);
          }

          return { id, slug, expires_at };
        },
        {
          body: t.Object({
            content: t.String(),
            events: t.Array(
              t.Object({
                type: t.String(),
                timestamp: t.Number(),
                length: t.Number(),
                typed: t.Number(),
                key: t.Optional(t.String()),
                pastedLength: t.Optional(t.Number()),
              }),
            ),
            ref_id: t.Optional(t.Union([t.String(), t.Null()])),
            turnstile_token: t.Optional(t.String()),
            source_host: t.Optional(t.String()),
          }),
        },
      ),
  )
  .use(
    new Elysia()
      .use(
        rateLimit({
          duration: 60000,
          max: 30,
          generator: getIP,
          scoping: "scoped",
        }),
      )
      .get("/api/proofs/:id", async ({ params, set }) => {
        const { id } = params;

        const res = await serverGet(`/proofs/${id}`);

        if (res.status === 404) {
          set.status = 404;
          return { error: "Not found" };
        }
        if (res.status === 410) {
          set.status = 410;
          return { error: "Proof has expired" };
        }

        const proof = (await res.json()) as {
          id: string;
          iv: string;
          tag: string;
          data: string;
          ref_id: string | null;
          source_host: string | null;
          created_at: number;
          expires_at: number;
        };

        const key = deriveKey(proof.id);
        const decrypted = decrypt(proof.iv, proof.tag, proof.data, key);
        const decompressed = await gunzipAsync(decrypted);
        const { content, events } = JSON.parse(decompressed.toString("utf8"));

        return {
          content,
          events,
          ref_id: proof.ref_id ?? null,
          source_host: proof.source_host ?? null,
          created_at: proof.created_at,
          expires_at: proof.expires_at,
        };
      }),
  )
  .listen(PORT);

console.log(`Typestamp running at http://localhost:${PORT}`);
