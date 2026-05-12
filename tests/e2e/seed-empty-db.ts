import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "../../src/db/migrations";

const dbPath = process.env.OPENCODE_USAGE_STATS_DB;

if (!dbPath) {
  throw new Error("OPENCODE_USAGE_STATS_DB is required");
}

mkdirSync(dirname(dbPath), { recursive: true });
rmSync(dbPath, { force: true });

const db = new Database(dbPath);

migrate(db);

db.close();
