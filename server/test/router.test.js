import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { createServer, classify, toolkitSlug, clientIp } from "../index.js"
import { create as createLicenses, fromEnv } from "../lib/licenses.js"
import { createLimiter, createAuthGuard } from "../lib/ratelimit.js"

const LICENSES = fromEnv({ INKWELL_LICENSES: "key-one,key-two" })

function fake(over) {
  return Object.assign({
    connected: async () => new Set(["gmail"]),
    connectLink: async () => "https://connect.example/abc",
    execute: async () => ({ successful: true, data: { messages: [] } }),
    integrations: async () => ([
      { slug: "gmail", name: "Gmail", category: "email", description: "Mail.", connected: true },
      { slug: "slack", name: "Slack", category: "chat", description: "Chat.", connected: false }
    ]),
    sections: async () => ([
      { id: "code", title: "The Code Desk", apps: ["GitHub"], headline: "2 things waiting", items: [{ time: "9:12 AM", app: "GitHub", title: "org/repo", detail: "Fix the ledger", tag: "Review" }], meter: [] }
    ]),
    forget: () => {}
  }, over || {})
}

async function up(composio, opts) {
  opts = opts || {}
  const entries = []
  const server = createServer({
    composio,
    licenses: opts.licenses || LICENSES,
    limiter: opts.limiter,
    authGuard: opts.authGuard,
    audit: opts.audit || { write: (e) => entries.push(e) },
    signing: opts.signing || "test-signing-secret",
    env: opts.env || {}
  })
  await new Promise(r => server.listen(0, "127.0.0.1", r))
  const base = "http://127.0.0.1:" + server.address().port
  return { base, entries, close: () => new Promise(r => server.close(r)) }
}

const get = (base, path, license) => fetch(base + path, {
  headers: license ? { authorization: "Bearer " + license } : {}
})

const post = (base, path, license, body) => fetch(base + path, {
  method: "POST",
  headers: Object.assign({ "content-type": "application/json" }, license ? { authorization: "Bearer " + license } : {}),
  body: JSON.stringify(body || {})
})

test("health needs no license; everything else does", async () => {
  const s = await up(fake())
  try {
    assert.equal((await get(s.base, "/health")).status, 200)
    assert.equal((await get(s.base, "/status")).status, 401)
    assert.equal((await get(s.base, "/desk/gmail")).status, 401)
    assert.equal((await post(s.base, "/connect", "", { toolkit: "gmail" })).status, 401)
    assert.equal((await get(s.base, "/status", "not-on-the-list")).status, 401)
  } finally { await s.close() }
})

// These two mirror menubar/Tests/InkwellCoreTests/InkwellCoreTests.swift, so a
// change here that breaks the Pro sheet fails in both places.
test("/status says ACTIVE when the toolkit is connected", async () => {
  const s = await up(fake())
  try {
    const body = await (await get(s.base, "/status", "key-one")).json()
    assert.deepEqual(body, { ok: true, connected: true, status: "ACTIVE" })
  } finally { await s.close() }
})

test("/status says missing when it is not", async () => {
  const s = await up(fake({ connected: async () => new Set() }))
  try {
    const body = await (await get(s.base, "/status", "key-one")).json()
    assert.deepEqual(body, { ok: true, connected: false, status: "missing" })
  } finally { await s.close() }
})

test("/status reports a broken proxy in the sheet, not as a 500", async () => {
  const s = await up(fake({ connected: async () => { throw new Error("No Composio API key provided") } }))
  try {
    const res = await get(s.base, "/status", "key-one")
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.status, "error")
    assert.match(body.error, /api key/i)
    assert.equal(body.connected, false)
  } finally { await s.close() }
})

test("/connect returns a Connect Link", async () => {
  const s = await up(fake())
  try {
    const res = await post(s.base, "/connect", "key-one", { toolkit: "gmail" })
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.url, "https://connect.example/abc")
  } finally { await s.close() }
})

test("/connect refuses an unknown toolkit, a bad token, and a POST to the token route", async () => {
  let calls = 0
  const s = await up(fake({ connectLink: async () => { calls++; return "" } }))
  try {
    assert.equal((await post(s.base, "/connect", "key-one", { toolkit: "myspace" })).status, 400)
    assert.equal((await get(s.base, "/connect", "key-one")).status, 400, "no token")
    await fetch(s.base + "/connect?t=nope", { redirect: "manual" }).then(r => assert.equal(r.status, 400))
    assert.equal(calls, 0)
  } finally { await s.close() }
})

test("a connected desk comes back shaped, with no provider detail", async () => {
  const s = await up(fake())
  try {
    const res = await get(s.base, "/desk/gmail?to=2026-11-07&tz=UTC", "key-one")
    const body = await res.json()
    assert.equal(body.state, "empty")
    assert.equal(body.sections[0].kicker, "Mail")
    assert.equal(res.headers.get("cache-control"), "no-store")
    assert.ok(!JSON.stringify(body).includes("composio"), "no provider names reach the client")
  } finally { await s.close() }
})

test("an unconnected desk offers the Connect Link instead of calling the tool", async () => {
  let called = 0
  const s = await up(fake({ execute: async () => { called++; return {} } }))
  try {
    const body = await (await get(s.base, "/desk/slack", "key-one")).json()
    assert.equal(body.state, "closed")
    assert.equal(body.action.label, "Connect Slack")
    assert.match(body.action.href, /^https:\/\//)
    assert.equal(called, 0, "an unconnected toolkit is never executed")
  } finally { await s.close() }
})

test("a provider 401 is an expired desk with a Reconnect action", async () => {
  const s = await up(fake({ execute: async () => { throw new Error("401 invalid_grant") } }))
  try {
    const body = await (await get(s.base, "/desk/gmail", "key-one")).json()
    assert.equal(body.state, "expired")
    assert.equal(body.action.label, "Reconnect Gmail")
  } finally { await s.close() }
})

test("a misconfigured project key is an error, not an unconnected desk", async () => {
  const s = await up(fake({ connected: async () => { throw new Error("No Composio API key provided") } }))
  try {
    const body = await (await get(s.base, "/desk/gmail", "key-one")).json()
    assert.equal(body.state, "error")
    assert.match(body.note, /api key/i)
    assert.equal(body.action, undefined)
  } finally { await s.close() }
})

test("an unknown desk is a 404, not a 500", async () => {
  const s = await up(fake())
  try {
    assert.equal((await get(s.base, "/desk/twitter", "key-one")).status, 404)
    assert.equal((await get(s.base, "/nope", "key-one")).status, 404)
  } finally { await s.close() }
})

test("desk names and toolkit slugs mean the same app", () => {
  assert.equal(toolkitSlug("mail"), "gmail")
  assert.equal(toolkitSlug("calendar"), "googlecalendar")
  assert.equal(toolkitSlug("daybook"), "googlecalendar")
  assert.equal(toolkitSlug("project"), "basecamp")
  assert.equal(toolkitSlug("myspace"), "")
  assert.equal(toolkitSlug(undefined), "gmail", "the sheet only ever connects Gmail today")
})

test("/integrations lists the library with connection state", async () => {
  const s = await up(fake())
  try {
    const body = await (await get(s.base, "/integrations", "key-one")).json()
    assert.equal(body.ok, true)
    assert.equal(body.total, 2)
    assert.equal(body.connected, 1)
    assert.equal(body.integrations[0].slug, "gmail")
    assert.equal(body.integrations[1].connected, false)
    assert.match(body.state, /\/integrations\?t=/, "a token so the page can refresh itself")
  } finally { await s.close() }
})

test("the library can refresh itself with its signed token", async () => {
  const s = await up(fake())
  try {
    const body = await (await get(s.base, "/integrations", "key-one")).json()
    const res = await fetch(body.state)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("access-control-allow-origin"), "*")
    const j = await res.json()
    assert.equal(j.ok, true)
    assert.equal(j.connected, 1)
    assert.equal(j.integrations.find(i => i.slug === "slack").connected, false)
  } finally { await s.close() }
})

test("a bad library token is refused", async () => {
  const s = await up(fake())
  try {
    const res = await fetch(s.base + "/integrations?t=nope")
    assert.equal(res.status, 403)
  } finally { await s.close() }
})

test("a card's Connect link redirects to Composio", async () => {
  const s = await up(fake())
  try {
    const body = await (await get(s.base, "/integrations", "key-one")).json()
    const slack = body.integrations.find(i => i.slug === "slack")
    assert.ok(slack.connect && slack.connect.startsWith(s.base + "/connect?t="), "signed link back to the service")
    assert.equal(body.integrations.find(i => i.slug === "gmail").connect, "", "connected cards need no link")

    const res = await fetch(slack.connect, { redirect: "manual" })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get("location"), "https://connect.example/abc")
  } finally { await s.close() }
})

test("a bad or expired connect token is refused", async () => {
  const s = await up(fake())
  try {
    const res = await fetch(s.base + "/connect?t=nope", { redirect: "manual" })
    assert.equal(res.status, 400)
  } finally { await s.close() }
})

test("/sections returns the folds the readers filled", async () => {
  const s = await up(fake())
  try {
    const body = await (await get(s.base, "/sections?date=2026-11-07&tz=UTC", "key-one")).json()
    assert.equal(body.ok, true)
    assert.equal(body.sections[0].title, "The Code Desk")
    assert.equal(body.sections[0].items[0].tag, "Review")
  } finally { await s.close() }
})

test("/integrations fails softly so the paper still builds", async () => {
  const s = await up(fake({ integrations: async () => { throw new Error("catalogue down") } }))
  try {
    const res = await get(s.base, "/integrations", "key-one")
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.ok, false)
    assert.match(body.error, /catalogue/)
  } finally { await s.close() }
})

test("a license is rate limited, with a retry-after header", async () => {
  const limiter = createLimiter({ limit: 2, windowMs: 60000, maxInFlight: 10, now: () => 0 })
  const s = await up(fake(), { limiter })
  try {
    assert.equal((await get(s.base, "/status", "key-one")).status, 200)
    assert.equal((await get(s.base, "/status", "key-one")).status, 200)

    const res = await get(s.base, "/status", "key-one")
    assert.equal(res.status, 429)
    assert.equal((await res.json()).error, "rate limited")
    assert.ok(Number(res.headers.get("retry-after")) >= 1)

    assert.equal((await get(s.base, "/status", "key-two")).status, 200, "another license is unaffected")
  } finally { await s.close() }
})

test("a revoked license is refused and its session dropped at once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-rev-"))
  const file = path.join(dir, "licenses.json")
  const write = (body, secs) => {
    fs.writeFileSync(file, JSON.stringify(body))
    const when = new Date(secs * 1000)
    fs.utimesSync(file, when, when)
  }

  write(["key-one"], 100)
  const licenses = createLicenses({ env: { INKWELL_LICENSE_FILE: file } })
  const forgotten = []
  const s = await up(fake({ forget: (u) => forgotten.push(u) }), { licenses })

  try {
    assert.equal((await get(s.base, "/desk/gmail", "key-one")).status, 200)

    write([], 200) // revoke, no restart
    assert.equal((await get(s.base, "/desk/gmail", "key-one")).status, 401)
    assert.equal(forgotten.length, 1, "the cached Composio session is dropped immediately")
    assert.match(forgotten[0], /^ink_[0-9a-f]{24}$/)
  } finally {
    await s.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a guessed license is refused, and repeated guesses are blocked", async () => {
  const authGuard = createAuthGuard({ limit: 2, windowMs: 600000, now: () => 0 })
  const s = await up(fake(), { authGuard })
  try {
    assert.equal((await get(s.base, "/status", "bad-1")).status, 401)
    assert.equal((await get(s.base, "/status", "bad-2")).status, 401)

    const blocked = await get(s.base, "/status", "bad-3")
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1)

    assert.equal((await get(s.base, "/status", "key-one")).status, 429,
      "even a real key waits out the block")
  } finally { await s.close() }
})

test("a name from Object.prototype is not a desk or a toolkit", async () => {
  const s = await up(fake())
  try {
    assert.equal((await get(s.base, "/desk/constructor", "key-one")).status, 404)
    assert.equal((await get(s.base, "/desk/tostring", "key-one")).status, 404)
    assert.equal((await post(s.base, "/connect", "key-one", { toolkit: "constructor" })).status, 400)
  } finally { await s.close() }
})

test("the audit line names the reader and the desk, never the license", async () => {
  const s = await up(fake())
  try {
    await get(s.base, "/desk/gmail?to=2026-11-07", "key-one")
    await new Promise(r => setTimeout(r, 20))

    const line = s.entries.find(e => e.path === "/desk/gmail")
    assert.ok(line, "a line was written")
    assert.equal(line.status, 200)
    assert.equal(line.outcome, "desk:empty")
    assert.match(line.user, /^ink_[0-9a-f]{24}$/)
    assert.ok(!JSON.stringify(line).includes("key-one"), "the raw key is never logged")
  } finally { await s.close() }
})

test("a declared proxy uses the hop it added, not the client's", () => {
  const req = { headers: { "x-forwarded-for": "1.1.1.1, 9.9.9.9" }, socket: { remoteAddress: "10.0.0.1" } }
  assert.equal(clientIp(req, {}), "10.0.0.1")
  assert.equal(clientIp(req, { INKWELL_TRUST_PROXY: "1" }), "9.9.9.9")
})

test("network failures read as offline, not broken", () => {
  assert.equal(classify(new Error("fetch failed")), "offline")
  assert.equal(classify(new Error("connect ECONNREFUSED")), "offline")
  assert.equal(classify(new Error("the tool failed")), "error")
})
