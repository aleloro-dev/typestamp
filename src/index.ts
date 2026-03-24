import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { nanoid } from "nanoid";
import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";
import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import sql from "./db";
import { layout } from "./layout";
import { extractAuditSignals, type ProofEvent } from "./audit";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const PROOF_SECRET = process.env.PROOF_SECRET;
if (!PROOF_SECRET) {
  throw new Error("PROOF_SECRET environment variable is required");
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
  const number = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
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
      await view("home"),
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
    return layout("How to interpret a proof - Typestamp", [], await view("interpret"));
  })
  // API
  .use(
    new Elysia()
      .use(rateLimit({ duration: 3600000, max: 2, generator: getIP, scoping: 'scoped' }))
      .post(
        "/api/refs",
        async ({ body }) => {
          const { label } = body;
          const id = nanoid(10);
          const now = Date.now();
          await sql`INSERT INTO refs (id, label, created_at) VALUES (${id}, ${label}, ${now})`;
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
      .use(rateLimit({ duration: 60000, max: 30, generator: getIP, scoping: 'scoped' }))
      .get("/api/refs/:id", async ({ params, set }) => {
        const { id } = params;
        const rows = await sql`SELECT id, label FROM refs WHERE id = ${id}`;
        if (rows.length === 0) {
          set.status = 404;
          return { error: "Not found" };
        }
        return { id: rows[0].id, label: rows[0].label };
      }),
  )
  .use(
    new Elysia()
      .use(rateLimit({ duration: 3600000, max: 3, generator: getIP, scoping: 'scoped' }))
      .post(
        "/api/proofs",
        async ({ body, set }) => {
          const { content, events, ref_id } = body;

          if (ref_id) {
            const refs = await sql`SELECT id FROM refs WHERE id = ${ref_id}`;
            if (refs.length === 0) {
              set.status = 400;
              return { error: "Invalid ref_id" };
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
            if (e.type === "start" || e.type === "resume")
              lastStart = e.timestamp;
            if (
              (e.type === "pause" || e.type === "finish") &&
              lastStart !== null
            ) {
              active_duration += e.timestamp - lastStart;
              lastStart = null;
            }
          }
          active_duration = Math.round(active_duration / 1000);

          const auditSignals = extractAuditSignals(events);

          const payload = JSON.stringify({ content, events });
          const compressed = await gzipAsync(Buffer.from(payload, "utf8"));

          const key = deriveKey(id);
          const { iv, tag, data } = encrypt(compressed, key);

          await sql`
            INSERT INTO proofs (id, slug, iv, tag, data, ref_id, created_at, expires_at, event_count, keystroke_count, active_duration)
            VALUES (${id}, ${slug}, ${iv}, ${tag}, ${data}, ${ref_id ?? null}, ${now}, ${expires_at}, ${event_count}, ${keystroke_count}, ${active_duration})
          `;

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
          }),
        },
      ),
  )
  .use(
    new Elysia()
      .use(rateLimit({ duration: 60000, max: 30, generator: getIP, scoping: 'scoped' }))
      .get("/api/proofs/:id", async ({ params, set }) => {
        const { id } = params;

        const rows = await sql`
          SELECT id, slug, iv, tag, data, ref_id, created_at, expires_at
          FROM proofs
          WHERE slug = ${id} OR id = ${id}
        `;

        if (rows.length === 0) {
          set.status = 404;
          return { error: "Not found" };
        }

        const proof = rows[0];
        const now = Date.now();

        if (now > Number(proof.expires_at)) {
          set.status = 410;
          return { error: "Proof has expired" };
        }

        const key = deriveKey(proof.id);
        const decrypted = decrypt(proof.iv, proof.tag, proof.data, key);
        const decompressed = await gunzipAsync(decrypted);
        const { content, events } = JSON.parse(decompressed.toString("utf8"));

        return {
          content,
          events,
          ref_id: proof.ref_id ?? null,
          created_at: Number(proof.created_at),
          expires_at: Number(proof.expires_at),
        };
      }),
  )
  .listen(PORT);

console.log(`Typestamp running at http://localhost:${PORT}`);
