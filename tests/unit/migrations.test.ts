import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { MIGRATIONS, getSchemaVersion, migrate } from "../../src/db/migrations"

function createTempDbPath(): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "opencode-usage-stats-migrations-"))
  return { dir, dbPath: join(dir, "usage-stats.db") }
}

describe("migrations", () => {
  const cleanupDirs: string[] = []

  afterEach(() => {
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  test("migrate creates schema and sets user_version", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const db = new Database(dbPath)

    migrate(db)

    const version = db.prepare("PRAGMA user_version").get() as { user_version: number }
    expect(version.user_version).toBe(getSchemaVersion())

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    const names = new Set(tables.map((t) => t.name))
    expect(names.has("sessions")).toBe(true)
    expect(names.has("messages")).toBe(true)
    expect(names.has("tool_calls")).toBe(true)
    expect(names.has("daily_usage")).toBe(true)

    db.close()
  })

  test("migrate is idempotent", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const db = new Database(dbPath)

    migrate(db)
    migrate(db)

    const version = db.prepare("PRAGMA user_version").get() as { user_version: number }
    expect(version.user_version).toBe(getSchemaVersion())
    db.close()
  })

  test("migration failure rolls back and keeps previous user_version", () => {
    const { dir, dbPath } = createTempDbPath()
    cleanupDirs.push(dir)
    const db = new Database(dbPath)

    migrate(db)
    const before = db.prepare("PRAGMA user_version").get() as { user_version: number }

    MIGRATIONS.push((d) => {
      d.run("CREATE TABLE broken_sql (")
    })

    try {
      expect(() => migrate(db)).toThrow()
      const after = db.prepare("PRAGMA user_version").get() as { user_version: number }
      expect(after.user_version).toBe(before.user_version)
    } finally {
      MIGRATIONS.pop()
      db.close()
    }
  })
})
