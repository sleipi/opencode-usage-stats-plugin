#!/usr/bin/env bun
/**
 * Test script for GC (garbage collection) of old data
 */
import { Database } from "bun:sqlite"
import { join } from "path"
import { initDB, gcOldData } from "./src/plugin"

const DB_PATH = join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")

console.log("Testing GC (garbage collection)...")
console.log("DB Path:", DB_PATH)
console.log()

// Initialize DB
const db = initDB()
console.log("✓ DB initialized")
console.log()

// Check current data distribution
const stats = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM messages) AS total_messages,
    (SELECT COUNT(*) FROM messages WHERE date(timestamp) < date('now', '-90 days')) AS old_messages,
    (SELECT COUNT(*) FROM tool_calls) AS total_tool_calls,
    (SELECT COUNT(*) FROM tool_calls WHERE date(timestamp) < date('now', '-90 days')) AS old_tool_calls,
    (SELECT COUNT(*) FROM sessions) AS total_sessions,
    (SELECT COUNT(*) FROM sessions WHERE date(last_seen) < date('now', '-90 days')) AS old_sessions
`).get() as any

console.log("Before GC:")
console.log(`  Messages:    ${stats.total_messages} total, ${stats.old_messages} older than 90 days`)
console.log(`  Tool calls:  ${stats.total_tool_calls} total, ${stats.old_tool_calls} older than 90 days`)
console.log(`  Sessions:    ${stats.total_sessions} total, ${stats.old_sessions} older than 90 days`)
console.log()

// Run GC
console.log("Running GC (retention: 90 days)...")
gcOldData(db, 90)
console.log()

// Check after GC
const statsAfter = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM messages) AS total_messages,
    (SELECT COUNT(*) FROM messages WHERE date(timestamp) < date('now', '-90 days')) AS old_messages,
    (SELECT COUNT(*) FROM tool_calls) AS total_tool_calls,
    (SELECT COUNT(*) FROM tool_calls WHERE date(timestamp) < date('now', '-90 days')) AS old_tool_calls,
    (SELECT COUNT(*) FROM sessions) AS total_sessions,
    (SELECT COUNT(*) FROM sessions WHERE date(last_seen) < date('now', '-90 days')) AS old_sessions
`).get() as any

console.log("After GC:")
console.log(`  Messages:    ${statsAfter.total_messages} total, ${statsAfter.old_messages} older than 90 days`)
console.log(`  Tool calls:  ${statsAfter.total_tool_calls} total, ${statsAfter.old_tool_calls} older than 90 days`)
console.log(`  Sessions:    ${statsAfter.total_sessions} total, ${statsAfter.old_sessions} older than 90 days`)
console.log()

if (statsAfter.old_messages === 0 && statsAfter.old_tool_calls === 0) {
  console.log("✓ GC successful! All old data removed.")
} else {
  console.log("⚠ Some old data still remains (might be expected if no old data existed).")
}

db.close()
