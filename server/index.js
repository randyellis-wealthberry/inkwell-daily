// The desks service.
//
//   GET  /health                   no license, for a load balancer
//   GET  /status?toolkit=gmail     { ok, connected, status }   — the Pro sheet
//   POST /connect { toolkit }      { ok, url }                 — the Pro sheet
//   GET  /desk/:id?to=&from=&tz=   one shaped desk             — inkwell-pro
//
// The first two are the contract menubar/Sources/InkwellCore/HostedDeskClient.swift
// already speaks; keep them in step with it. The third is new, for the plugin.
//
// It holds COMPOSIO_API_KEY and never sends it, or anything derived from a
// provider token, to the client. What goes back is only what the paper prints.

import http from "node:http"
import { randomBytes } from "node:crypto"
import { pathToFileURL } from "node:url"

import * as Desks from "./lib/desks.js"
import * as J from "./lib/json.js"
import { create as createComposio } from "./lib/composio.js"
import { fromEnv, userId as licenseUserId } from "./lib/licenses.js"
import { mint, read } from "./lib/tokens.js"
import { createLimiter, createAuthGuard } from "./lib/ratelimit.js"
import { createAudit, silent } from "./lib/audit.js"

function today() { return new Date().toISOString().slice(0, 10) }

function bearer(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ""
}

function send(res, status, body, headers) {
  const text = JSON.stringify(body)
  res.writeHead(status, Object.assign({
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }, headers || {}))
  res.end(text)
}

// A desk name, a desk id or a toolkit slug all mean the same app here.
// Null prototype: a body like {"toolkit":"constructor"} must not reach
// Object.prototype and come back as a function.
const ALIASES = Object.assign(Object.create(null), {
  mail: "gmail", gmail: "gmail",
  city: "slack", slack: "slack",
  notebook: "notion", notion: "notion",
  daybook: "googlecalendar", calendar: "googlecalendar", googlecalendar: "googlecalendar",
  project: "basecamp", basecamp: "basecamp"
})

function toolkitSlug(v) {
  const key = String(v || "gmail").toLowerCase()
  return Object.hasOwn(ALIASES, key) ? ALIASES[key] : ""
}

// The socket address, unless a proxy is declared. With one, take the last
// X-Forwarded-For hop — the address the proxy itself saw — not the first, which
// a client can invent.
function clientIp(req, env) {
  if (String(env.INKWELL_TRUST_PROXY || "") === "1") {
    const hops = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean)
    if (hops.length) return hops[hops.length - 1]
  }
  return req.socket.remoteAddress || "unknown"
}

// A connect link in a static page cannot carry the license, so it carries a
// signed token and lands here. No auth header; the token is the proof.
function sendHtml(res, status, message) {
  const text = "<!doctype html><meta charset=\"utf-8\"><title>Inkwell</title>" +
    "<body style=\"font:16px -apple-system,system-ui,sans-serif;padding:40px;max-width:38em;line-height:1.5\">" +
    "<p>" + message + "</p><p><a href=\"javascript:history.back()\">Back</a></p>"
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store" })
  res.end(text)
}

// The library page refreshes itself from a file:// origin, so this one answer
// is readable cross-origin. It is token-gated and carries no content.
function corsJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff"
  })
  res.end(text)
}

// The absolute base for links the page will use. Fixed in production; derived
// from the request locally so a file:// page can still reach the service.
function publicBase(req, env) {
  const fixed = String(env.INKWELL_PRO_PUBLIC_URL || "").replace(/\/+$/, "")
  if (fixed) return fixed
  const host = String(req.headers.host || "127.0.0.1:8787")
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim()
  return proto + "://" + host
}

// A provider 401 and a dead network mean different things to the reader: one
// needs a Reconnect button, the other just needs to know the run was offline.
function classify(e) {
  const s = String(e && (e.message || e)).toLowerCase()
  if (/401|403|unauthor|invalid_grant|revoked|expired|token/.test(s)) return "expired"
  if (/enotfound|econnrefused|econnreset|timeout|fetch failed|network/.test(s)) return "offline"
  return "error"
}

// Read a small JSON body. Anything larger is not one of ours.
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", c => {
      size += c.length
      if (size > 4096) { reject(new Error("body too large")); req.destroy(); return }
      chunks.push(c)
    })
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")) } catch (e) { reject(new Error("bad json")) }
    })
    req.on("error", reject)
  })
}

// The Pro sheet's connection row. `status` values it knows: missing, ACTIVE,
// error, and the provider's pending states.
async function status(deps, who, toolkit) {
  const slug = toolkitSlug(toolkit)
  if (!slug) return { ok: false, error: "unknown toolkit" }
  try {
    const connected = await deps.composio.connected(who.userId)
    const isConnected = connected.has(slug)
    return { ok: true, connected: isConnected, status: isConnected ? "ACTIVE" : "missing" }
  } catch (e) {
    // The sheet shows this in red; a 500 would only read as "Proxy unreachable".
    return { ok: true, connected: false, status: "error", error: String(e && e.message || e).slice(0, 300) }
  }
}

async function connect(deps, who, toolkit) {
  const slug = toolkitSlug(toolkit)
  if (!slug) return { code: 400, body: { ok: false, error: "unknown toolkit" } }
  try {
    const url = await deps.composio.connectLink(who.userId, slug)
    if (!url) return { code: 502, body: { ok: false, error: "The Connect Link could not be made." } }
    return { code: 200, body: { ok: true, url } }
  } catch (e) {
    return { code: 502, body: { ok: false, error: String(e && e.message || e).slice(0, 300) } }
  }
}

// A Connect Link is nice to have: a desk must still print when it cannot be made.
async function linkFor(deps, who, toolkit) {
  try { return await deps.composio.connectLink(who.userId, toolkit) } catch (e) { return "" }
}

async function desk(deps, who, id, q) {
  const spec = Desks.get(id)
  if (!spec) return null

  const ctx = {
    to: Desks.day(q.get("to")) || Desks.day(q.get("date")) || today(),
    from: Desks.day(q.get("from")) || "",
    tz: String(q.get("tz") || "UTC").slice(0, 64)
  }

  // Ask the connection state first. A tool call on an unconnected toolkit is a
  // provider 401, which would read as "expired" when the truth is "never set up".
  let connected
  try {
    connected = await deps.composio.connected(who.userId)
  } catch (e) {
    // A missing or bad project key is not something the reader can fix by
    // reconnecting an account, so say so plainly.
    return { state: "error", note: String(e && e.message || e).slice(0, 300) }
  }
  if (!connected.has(spec.toolkit)) {
    const link = await linkFor(deps, who, spec.toolkit)
    return {
      state: "closed",
      note: spec.name + " is not connected yet.",
      action: link ? { label: "Connect " + spec.name, href: link } : null
    }
  }

  try {
    const raw = J.unwrap(await deps.composio.execute(who.userId, spec.tool, spec.args(ctx)))
    return spec.shape(raw, ctx)
  } catch (e) {
    const state = classify(e)
    const link = state === "expired" ? await linkFor(deps, who, spec.toolkit) : ""
    return {
      state,
      note: String(e && e.message || e).slice(0, 300),
      action: link ? { label: "Reconnect " + spec.name, href: link } : null
    }
  }
}

async function handle(req, res, deps) {
  const url = new URL(req.url || "/", "http://desks.local")
  const path = url.pathname
  const ip = clientIp(req, deps.env)

  // One line per request, written when the response is done. Never a body.
  const started = Date.now()
  const entry = { at: new Date().toISOString(), ip, method: req.method, path }
  let logged = false
  const flush = () => {
    if (logged) return
    logged = true
    deps.audit.write(Object.assign({}, entry, { status: res.statusCode, ms: Date.now() - started }))
  }
  res.on("finish", flush)
  res.on("close", flush)

  if (path === "/health" && req.method === "GET") return send(res, 200, { ok: true })

  // Public: the library page refreshing itself, and a card's Connect button.
  if (path === "/integrations" && req.method === "GET" && url.searchParams.get("t")) {
    const claim = read(deps.secret, url.searchParams.get("t"))
    if (!claim) return corsJson(res, 403, { ok: false, error: "expired" })
    entry.user = claim.userId
    entry.outcome = "integrations-state"
    try {
      const items = await deps.composio.integrations(claim.userId)
      const base = publicBase(req, deps.env)
      const integrations = items.map(i => Object.assign({}, i, {
        connect: i.connected ? "" : base + "/connect?t=" + mint(deps.secret, claim.userId, i.slug, 30 * 24 * 60 * 60 * 1000)
      }))
      return corsJson(res, 200, {
        ok: true,
        integrations,
        total: integrations.length,
        connected: integrations.filter(i => i.connected).length
      })
    } catch (e) {
      return corsJson(res, 200, { ok: false, error: String(e && e.message || e).slice(0, 200) })
    }
  }

  if (path === "/connect" && req.method === "GET") {
    const claim = read(deps.secret, url.searchParams.get("t") || "")
    if (!claim) return sendHtml(res, 400, "This connect link has expired. Open the paper and try again.")
    entry.user = claim.userId
    entry.outcome = "connect-link"
    try {
      const link = await deps.composio.connectLink(claim.userId, claim.slug)
      if (!link) return sendHtml(res, 502, "The connection could not be started. Try again from the integrations page.")
      res.writeHead(302, { location: link, "cache-control": "no-store" })
      return res.end()
    } catch (e) {
      return sendHtml(res, 502, "The connection could not be started.")
    }
  }

  // Refuse a repeated guess before spending anything on it.
  const wait = deps.authGuard.blocked(ip)
  if (wait) {
    entry.outcome = "auth-blocked"
    return send(res, 429, { ok: false, error: "too many attempts" }, { "retry-after": String(wait) })
  }

  const given = bearer(req)
  const who = deps.licenses.check(given)
  if (!who.ok) {
    deps.authGuard.fail(ip)
    // A refused key drops its cached Composio session straight away, so a
    // revoked license stops reading on this instance before its TTL is up.
    // Other instances are covered by the ten-minute session lifetime.
    if (given) deps.composio.forget(licenseUserId(given))
    entry.outcome = "denied"
    return send(res, 401, { ok: false, error: "license" })
  }
  deps.authGuard.clear(ip)
  entry.user = who.userId

  // One budget per license, covering every route. A desk call costs Composio
  // credits and provider quota, so it is the thing worth limiting.
  const gate = deps.limiter.take(who.userId)
  if (!gate.ok) {
    entry.outcome = "rate-limited"
    return send(res, 429, { ok: false, error: gate.reason === "busy" ? "busy" : "rate limited" },
      { "retry-after": String(gate.retryAfter) })
  }

  try {
    if (path === "/integrations") {
      if (req.method !== "GET") return send(res, 405, { ok: false, error: "method not allowed" })
      try {
        const items = await deps.composio.integrations(who.userId)
        // Disconnected cards get a signed link back to this service, which
        // mints the Composio link on click. Connected ones need nothing.
        const base = publicBase(req, deps.env)
        const integrations = items.map(i => Object.assign({}, i, {
          connect: i.connected ? "" : base + "/connect?t=" + mint(deps.secret, who.userId, i.slug, 30 * 24 * 60 * 60 * 1000)
        }))
        entry.outcome = "integrations"
        return send(res, 200, {
          ok: true,
          integrations,
          total: integrations.length,
          connected: integrations.filter(i => i.connected).length,
          // The page polls this with its own signed token, so a card can flip
          // to Enabled the moment the provider finishes, without a rebuild.
          state: base + "/integrations?t=" + mint(deps.secret, who.userId, "__library__", 30 * 24 * 60 * 60 * 1000)
        })
      } catch (e) {
        // The paper renders without the library rather than failing a build.
        entry.outcome = "integrations-failed"
        return send(res, 200, { ok: false, error: String(e && e.message || e).slice(0, 300) })
      }
    }

    if (path === "/sections") {
      if (req.method !== "GET") return send(res, 405, { ok: false, error: "method not allowed" })
      const date = Desks.day(url.searchParams.get("date")) || today()
      const tz = String(url.searchParams.get("tz") || "UTC").slice(0, 64)
      try {
        const sections = await deps.composio.sections(who.userId, {
          date,
          until: Desks.shift(date, 1),
          since: date + "T00:00:00Z",
          tz
        })
        entry.outcome = "sections"
        return send(res, 200, { ok: true, sections })
      } catch (e) {
        entry.outcome = "sections-failed"
        return send(res, 200, { ok: false, error: String(e && e.message || e).slice(0, 300) })
      }
    }

    if (path === "/status") {
      if (req.method !== "GET") return send(res, 405, { ok: false, error: "method not allowed" })
      entry.outcome = "status"
      return send(res, 200, await status(deps, who, url.searchParams.get("toolkit")))
    }

    if (path === "/connect") {
      if (req.method !== "POST") return send(res, 405, { ok: false, error: "method not allowed" })
      let body
      try { body = await readJson(req) } catch (e) { return send(res, 400, { ok: false, error: "bad request" }) }
      const out = await connect(deps, who, body.toolkit)
      entry.outcome = out.code === 200 ? "connect" : "connect-failed"
      return send(res, out.code, out.body)
    }

    const m = path.match(/^\/desk\/([a-z]+)$/)
    if (m) {
      if (req.method !== "GET") return send(res, 405, { ok: false, error: "method not allowed" })
      const payload = await desk(deps, who, m[1], url.searchParams)
      if (!payload) return send(res, 404, { ok: false, error: "not found" })
      entry.outcome = "desk:" + payload.state
      return send(res, 200, payload)
    }

    return send(res, 404, { ok: false, error: "not found" })
  } finally {
    deps.limiter.release(who.userId)
  }
}

function createServer(opts) {
  opts = opts || {}
  const env = opts.env || process.env
  const licenses = opts.licenses || fromEnv(env)
  const signing = opts.signing || String(env.INKWELL_SIGNING_SECRET || "")
  if (!signing && !opts.licenses) {
    if (String(env.NODE_ENV || "") === "production") throw new Error("INKWELL_SIGNING_SECRET is required in production")
    process.stderr.write("inkwell-desks: INKWELL_SIGNING_SECRET is not set; connect links will stop working on restart.\n")
  }
  const secret = signing || randomBytes(32).toString("base64url")

  // Say it once, at startup, rather than leaving an operator to discover it
  // from a 401 later. Only when this process built its own list.
  if (!opts.licenses) {
    if (licenses.count() === 0) {
      process.stderr.write("inkwell-desks: no licenses configured; every request will be refused. Generate one with `node scripts/new-license.mjs`.\n")
    }
    if (licenses.weak() > 0) {
      process.stderr.write("inkwell-desks: " + licenses.weak() + " placeholder or short license(s); " +
        (licenses.refused() > 0 ? "refused because NODE_ENV=production" : "accepted for development, refused when NODE_ENV=production") +
        ". Generate one with `node scripts/new-license.mjs`.\n")
    }
  }

  const deps = {
    env,
    secret,
    audit: opts.audit || (String(env.INKWELL_AUDIT || "") === "0" ? silent : createAudit({ file: env.INKWELL_AUDIT_FILE })),
    composio: opts.composio || createComposio({ env }),
    licenses,
    limiter: opts.limiter || createLimiter({
      limit: Number(env.INKWELL_RATE_LIMIT) || 60,
      maxInFlight: Number(env.INKWELL_MAX_IN_FLIGHT) || 2
    }),
    authGuard: opts.authGuard || createAuthGuard({
      limit: Number(env.INKWELL_AUTH_FAILURES) || 20
    })
  }

  const server = http.createServer((req, res) => {
    handle(req, res, deps).catch(() => {
      if (!res.headersSent) send(res, 500, { ok: false, error: "internal" })
      else res.end()
    })
  })

  // Bound the cheap things a client controls. The handler itself is bounded by
  // the plugin's 20-second abort; this stops a slow or idle socket lingering.
  server.headersTimeout = 15000
  server.requestTimeout = 30000
  server.keepAliveTimeout = 5000
  server.timeout = 30000

  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787)
  createServer().listen(port, () => {
    process.stdout.write("inkwell desks listening on :" + port + "\n")
  })
}

export { createServer, classify, desk, status, connect, toolkitSlug, clientIp }
