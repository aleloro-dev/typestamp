import { readdir, readFile } from "fs/promises";
import { join } from "path";
import sql from "./db";

async function migrate() {
  // Create migrations tracking table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at BIGINT NOT NULL
    )
  `;

  const migrationsDir = join(import.meta.dir, "../migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await sql`SELECT name FROM _migrations`).map((r) => r.name)
  );

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sqlText = await readFile(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx.unsafe("INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)", [file, Date.now()]);
    });

    console.log(`  ✓ ${file}`);
    count++;
  }

  if (count === 0) {
    console.log("  No new migrations.");
  } else {
    console.log(`\nApplied ${count} migration(s).`);
  }

  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
