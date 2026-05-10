#!/usr/bin/env bun
/**
 * Test script to verify GC actually deletes old data
 * Inserts test data that is 100 days old, then runs GC
 */
import { Database } from "bun:sqlite"
import { join } from "path"
import { initDB, gcOldData } from "./src/plugin"

const DB_PATH = join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")

console.log("Testing GC with old test data...")
console.log("DB Path:", DB_PATH)
console.log()

const db = initDB()

// Insert test data that is 100 days old
const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
const testSessionId = "test-gc-session-" + Date.now()

console.log("Inserting test data (100 days old)...")
db.prepare(`
  INSERT INTO sessions (session_id, project_id, first_seen, last_seen)
  VALUES (?, 'test-project', ?, ?)
`).run(testSessionId, oldDate, oldDate)

db.prepare(`
  INSERT INTO messages (session_id, message_id, role, timestamp)
  VALUES (?, 'test-msg-1', 'assistant', ?)
`).run(testSessionId, oldDate)

db.prepare(`
  INSERT INTO tool_calls (session_id, call_id, tool_name, timestamp)
  VALUES (?, 'test-call-1', 'test-tool', ?)
`).run(testSessionId, oldDate)

console.log("✓ Test data inserted")
console.log()

// Verify insertion
const beforeCount = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM messages WHERE session_id = ?) AS messages,
    (SELECT COUNT(*) FROM tool_calls WHERE session_id = ?) AS tool_calls,
    (SELECT COUNT(*) FROM sessions WHERE session_id = ?) AS sessions
`).get(testSessionId, testSessionId, testSessionId) as any

console.log(`Before GC: ${beforeCount.messages} messages, ${beforeCount.tool_calls} tool_calls, ${beforeCount.sessions} sessions`)
console.log()

// Run GC
console.log("Running GC (90 days retention)...")
gcOldData(db, 90)
console.log()

// Verify deletion
const afterCount = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM messages WHERE session_id = ?) AS messages,
    (SELECT COUNT(*) FROM tool_calls WHERE session_id = ?) AS tool_calls,
    (SELECT COUNT(*) FROM sessions WHERE session_id = ?) AS sessions
`).get(testSessionId, testSessionId, testSessionId) as any

console.log(`After GC: ${afterCount.messages} messages, ${afterCount.tool_calls} tool_calls, ${afterCount.sessions} sessions`)
console.log()

if (afterCount.messages === 0 && afterCount.tool_calls === 0 && afterCount.sessions === 0) {
  console.log("✓ GC test PASSED! Old test data was successfully deleted.")
} else {
  console.log("✗ GC test FAILED! Old data was not deleted.")
  process.exit(1)
}

db.close()
