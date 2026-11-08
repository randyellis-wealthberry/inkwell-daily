// Licenses, and the Composio user each one maps to.
//
// There is no user database. A license key is the user: it is hashed, and the
// hash is the stable Composio user_id. The raw key is never stored, logged, or
// sent to Composio.
//
// Two sources, merged:
//   INKWELL_LICENSES      comma-separated, fixed for the life of the process
//   INKWELL_LICENSE_FILE  a JSON array (or { "licenses": [...] }), re-read
//                         whenever its mtime or size changes
//
// The file is what makes revocation real. Remove a key from it and the very
// next request is refused, on every instance, without a restart. The service
// also drops that license's cached Composio session when it refuses a key
// (see index.js), so the window is one request rather than the session TTL.

"use strict"

import fs from "node:fs"
import { createHash } from "node:crypto"

function hash(key) { return createHash("sha256").update(key).digest("hex") }

// A license is the paywall, so a copyable default must never work. Anything
// short or obviously an example is ignored rather than accepted: copying
// .env.example verbatim leaves the service with no valid keys, which is a
// louder failure than a free Pro account.
const MIN_LENGTH = 16
const PLACEHOLDER = /^(dev|test|example|placeholder|change|your|sample|demo|lic-?key)\b/i

function isStrong(key) {
  return typeof key === "string" && key.length >= MIN_LENGTH && !PLACEHOLDER.test(key)
}

// "ink_" + 24 hex characters: under Composio's 256-character user id limit,
// opaque, and stable for the same license.
function userId(key) { return "ink_" + hash(key).slice(0, 24) }

function isKey(v) { return typeof v === "string" && v.length > 0 }

function create(opts) {
  opts = opts || {}
  const env = opts.env || process.env
  const file = opts.file || env.INKWELL_LICENSE_FILE || ""

  let hashes = null
  let stamp = ""
  let fromFile = []
  let weakCount = 0
  let refused = 0

  function refresh() {
    let stat = null
    if (file) {
      try { stat = fs.statSync(file) } catch (e) { stat = null }
    }
    const next = stat ? stat.mtimeMs + ":" + stat.size : ""
    if (hashes && next === stamp) return hashes
    stamp = next
    if (stat) {
      try {
        const body = JSON.parse(fs.readFileSync(file, "utf8"))
        const list = Array.isArray(body) ? body : Array.isArray(body && body.licenses) ? body.licenses : []
        fromFile = list.filter(isKey)
      } catch (e) {
        // A half-written file must not take every license down with it; keep
        // the last good list until the file parses again.
      }
    } else {
      fromFile = []
    }
    const fromEnv = String(env.INKWELL_LICENSES || "").split(",").map(s => s.trim()).filter(Boolean)
    const all = fromEnv.concat(fromFile)
    // A placeholder may be convenient locally, but must never be a working
    // credential in production. Outside production it is kept and warned
    // about; with NODE_ENV=production it is dropped, so a copied example
    // leaves the service with no valid keys rather than a free account.
    const production = String(env.NODE_ENV || "") === "production"
    const weak = all.filter(k => !isStrong(k))
    const accepted = production ? all.filter(isStrong) : all
    weakCount = weak.length
    refused = production ? weak.length : 0
    hashes = new Set(accepted.map(hash))
    return hashes
  }

  return {
    check(given) {
      if (typeof given !== "string" || !given) return { ok: false }
      const known = refresh()
      // O(1). A constant-time compare here protected nothing: the key space is
      // 256 bits, so the only fact timing could reveal is whether a hash is
      // present — which the response already says. It did make every request
      // cost one compare per customer, before authentication.
      const ok = known.has(hash(given))
      return ok ? { ok: true, userId: userId(given) } : { ok: false }
    },
    userId,
    // Tests and operators: how many keys are currently accepted.
    count() { refresh(); return hashes.size },
    // How many keys look like a placeholder or are too short. The values are
    // never returned, so they cannot end up in a log line.
    weak() { refresh(); return weakCount },
    // How many of those were actually dropped (only in production).
    refused() { refresh(); return refused }
  }
}

function fromEnv(env) { return create({ env: env || process.env }) }

export { create, fromEnv, hash, userId, isStrong, MIN_LENGTH }
