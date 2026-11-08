// What is new on the wires. The first time a connected integration appears it
// is marked, and the chip lasts a week. The record is pruned to what is
// connected now, so reconnecting an app makes it new again.

"use strict"

const fs = require("node:fs")
const path = require("node:path")

const NEW_MS = 7 * 24 * 60 * 60 * 1000

function mark(dataDir, slugs, now) {
  const at = now == null ? Date.now() : now
  const file = path.join(dataDir, "wires.json")

  let seen = {}
  try { seen = JSON.parse(fs.readFileSync(file, "utf8")) || {} } catch (e) { seen = {} }

  const state = {}
  for (const slug of slugs || []) {
    if (typeof slug !== "string" || !slug) continue
    const prev = seen[slug]
    const firstSeen = typeof prev === "number"
      ? prev
      : (prev && typeof prev.firstSeen === "number" ? prev.firstSeen : at)
    state[slug] = { firstSeen: firstSeen, isNew: at - firstSeen < NEW_MS }
  }

  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 })
  } catch (e) {
    // A read-only data folder must not fail the paper.
  }
  return state
}

module.exports = { mark, NEW_MS }
