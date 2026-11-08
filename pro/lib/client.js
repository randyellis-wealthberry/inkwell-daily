// The only network code in this package. One GET, a bearer license, a timeout.
//
// The service on the other end holds the Composio project key and decides what
// each desk reads. Nothing here knows a toolkit slug, a tool slug, or an OAuth
// scope, so a provider change never requires a new release of inkwell-pro.

"use strict"

const TIMEOUT_MS = 20000
// A desk is a page of headlines, not a mailbox export. A service that sends
// more than this is broken or hostile; either way, do not read it into memory.
const MAX_BYTES = 512 * 1024

function tooLarge() {
  const e = new Error("The desks service sent an answer larger than " + Math.round(MAX_BYTES / 1024) + " KB.")
  e.state = "error"
  return e
}

async function readJson(res) {
  const declared = Number(res.headers.get("content-length") || 0)
  if (declared > MAX_BYTES) throw tooLarge()
  if (!res.body || typeof res.body.getReader !== "function") return res.json()

  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) {
      try { await reader.cancel() } catch (e) { /* the answer is already abandoned */ }
      throw tooLarge()
    }
    chunks.push(Buffer.from(value))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

// Turns anything the service or the network did into a desk state the paper
// already understands. Never throws: a source that throws would still be
// contained by lib/sources.js, but an honest state reads better on the page.
function stateOf(e) {
  if (!e) return "error"
  if (e.state) return e.state
  if (e.name === "TimeoutError" || e.name === "AbortError") return "offline"
  // Node's fetch reports a dead host as "fetch failed" and puts the real
  // reason in `cause`.
  const code = e.code || (e.cause && e.cause.code)
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH") return "offline"
  if (/fetch failed|network|timed? ?out/i.test(String(e.message || ""))) return "offline"
  return "error"
}

// The license travels in a header and the answer carries mail, so plain http
// is allowed only to this machine.
function isLoopback(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}

function secure(url) {
  let u
  try { u = new URL(url) } catch (e) { return false }
  if (u.protocol === "https:") return true
  return u.protocol === "http:" && isLoopback(u.hostname)
}

async function get(settings, route, query) {
  if (!secure(settings.url)) {
    const e = new Error("The desks URL must use https (http is allowed only for this machine).")
    e.state = "closed"
    throw e
  }
  const url = new URL(settings.url + route)
  for (const [k, v] of Object.entries(query || {})) if (v) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { authorization: "Bearer " + settings.license, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status === 401 || res.status === 403) {
    const e = new Error("The license key was not accepted.")
    e.state = "closed"
    throw e
  }
  if (!res.ok) {
    const e = new Error("The desks service answered " + res.status + ".")
    e.state = res.status >= 500 ? "error" : "closed"
    throw e
  }
  return readJson(res)
}

module.exports = { get, stateOf, secure, MAX_BYTES, TIMEOUT_MS }
