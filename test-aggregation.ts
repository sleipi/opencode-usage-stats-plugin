#!/usr/bin/env bun
/**
 * Test script for daily_usage aggregation
 */
import { Database } from "bun:sqlite"
import { join } from "path"
import { initDB, recomputeDailyUsage } from "./src/plugin"

const DB_PATH = join(process.env.HOME || "~", ".config", "opencode", "usage-stats.db")

console.log("Testing daily_usage aggregation...")
console.log("DB Path:", DB_PATH)
console.log()

// Initialize DB (creates tables if needed)
const db = initDB()
console.log("✓ DB initialized")
console.log()

// Compute last 7 days
const today = new Date().toISOString().slice(0, 10)
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

console.log(`Recomputing from ${sevenDaysAgo} to ${today}...`)
recomputeDailyUsage(db, sevenDaysAgo, today)
console.log("✓ Aggregation complete")
console.log()

// Show results
const rows = db.prepare(`
  SELECT day, tokens_total, cost_total, sessions_count, messages_count, tool_calls_count
  FROM daily_usage
  WHERE day >= ?
  ORDER BY day DESC
`).all(sevenDaysAgo) as any[]

console.log("Daily usage (last 7 days):")
console.log("─".repeat(80))
for (const r of rows) {
  console.log(`${r.day}  tokens:${String(r.tokens_total).padStart(8)}  cost:$${r.cost_total.toFixed(4)}  sessions:${r.sessions_count}  msgs:${r.messages_count}  tools:${r.tool_calls_count}`)
}
console.log("─".repeat(80))
console.log()

// Verify against raw data for today
const todayRaw = db.prepare(`
  SELECT COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens + reasoning_tokens), 0) AS tokens_total,
         COALESCE(SUM(cost), 0) AS cost_total,
         COUNT(*) AS messages_count
  FROM messages
  WHERE date(timestamp) = ?
`).get(today) as any

const todayAgg = rows.find(r => r.day === today)

console.log("Verification (today):")
console.log(`Raw data:        tokens=${todayRaw.tokens_total}, cost=$${todayRaw.cost_total.toFixed(4)}, msgs=${todayRaw.messages_count}`)
console.log(`Aggregated data: tokens=${todayAgg?.tokens_total ?? 0}, cost=$${(todayAgg?.cost_total ?? 0).toFixed(4)}, msgs=${todayAgg?.messages_count ?? 0}`)

if (todayAgg && todayAgg.tokens_total === todayRaw.tokens_total && todayAgg.messages_count === todayRaw.messages_count) {
  console.log("✓ Match! Aggregation is correct.")
} else {
  console.log("⚠ Mismatch detected.")
}

db.close()
