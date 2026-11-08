"use strict"

const test = require("node:test")
const assert = require("node:assert")
const http = require("node:http")

const { sources } = require("../index")
const { secure } = require("../lib/client")

// A stand-in for the desks service. Real desks are shaped server-side, so the
// plugin's whole job is: send the right request, and turn every answer into a
// state the paper understands.
function stub(handler) {
  return new Promise(resolve => {
    const seen = []
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://stub")
      seen.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization })
      handler(req, res, url)
    })
    server.listen(0, "127.0.0.1", () => {
      const base = "http://127.0.0.1:" + server.address().port
      resolve({ base, seen, close: () => new Promise(r => server.close(r)) })
    })
  })
}

const ctx = (over) => Object.assign({ key: "2026-11-07", from: "2026-11-01", to: "2026-11-07", net: true, config: {}, dataDir: "/nonexistent/inkwell" }, over || {})

test("a desk returns what the service shaped", async () => {
  const s = await stub((req, res) => {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ state: "open", sections: [{ kicker: "Mail", headline: "4 still unread", items: [] }], meter: [{ label: "Unread", value: "4" }] }))
  })
  process.env.INKWELL_PRO_API = s.base
  process.env.INKWELL_PRO_LICENSE = "test-key"
  try {
    const out = await sources[0].collect(ctx())
    assert.equal(out.state, "open")
    assert.equal(out.sections[0].headline, "4 still unread")
    assert.equal(s.seen[0].path, "/desk/gmail")
    assert.equal(s.seen[0].auth, "Bearer test-key")
    assert.equal(s.seen[0].query.date, "2026-11-07")
    assert.equal(s.seen[0].query.to, "2026-11-07")
    assert.ok(s.seen[0].query.tz, "the reader's zone is sent so times print locally")
  } finally { await s.close() }
})

test("a rejected license closes the desk instead of failing the paper", async () => {
  const s = await stub((req, res) => { res.statusCode = 401; res.end("{}") })
  process.env.INKWELL_PRO_API = s.base
  process.env.INKWELL_PRO_LICENSE = "wrong"
  try {
    const out = await sources[0].collect(ctx())
    assert.equal(out.state, "closed")
    assert.match(out.note, /license/i)
  } finally { await s.close() }
})

test("offline editions make no request at all", async () => {
  const s = await stub((req, res) => res.end("{}"))
  process.env.INKWELL_PRO_API = s.base
  process.env.INKWELL_PRO_LICENSE = "test-key"
  try {
    const out = await sources[0].collect(ctx({ net: false }))
    assert.equal(out.state, "offline")
    assert.equal(s.seen.length, 0)
  } finally { await s.close() }
})

test("an unactivated install says how to activate", async () => {
  delete process.env.INKWELL_PRO_API
  delete process.env.INKWELL_PRO_LICENSE
  const out = await sources[0].collect(ctx())
  assert.equal(out.state, "closed")
  assert.match(out.note, /activate/i)
})

test("a dead service is offline, not an error", async () => {
  process.env.INKWELL_PRO_API = "http://127.0.0.1:1"
  process.env.INKWELL_PRO_LICENSE = "test-key"
  const out = await sources[0].collect(ctx())
  assert.equal(out.state, "offline")
})

test("plain http is refused except to this machine", () => {
  assert.equal(secure("https://desks.example.com"), true)
  assert.equal(secure("https://desks.example.com:8443/x"), true)
  assert.equal(secure("http://127.0.0.1:8787"), true)
  assert.equal(secure("http://localhost:8787"), true)
  assert.equal(secure("http://[::1]:8787"), true)
  assert.equal(secure("http://desks.example.com"), false)
  assert.equal(secure("ftp://desks.example.com"), false)
  assert.equal(secure("not a url"), false)
})

test("a remote http service is refused before the license is sent", async () => {
  process.env.INKWELL_PRO_API = "http://desks.example.com"
  process.env.INKWELL_PRO_LICENSE = "test-key"
  const out = await sources[0].collect(ctx())
  assert.equal(out.state, "closed")
  assert.match(out.note, /https/)
})

test("a huge answer is refused instead of read into memory", async () => {
  const s = await stub((req, res) => {
    res.setHeader("content-type", "application/json")
    res.end('"' + "a".repeat(600 * 1024) + '"')
  })
  process.env.INKWELL_PRO_API = s.base
  process.env.INKWELL_PRO_LICENSE = "test-key"
  try {
    const out = await sources[0].collect(ctx())
    assert.equal(out.state, "error")
    assert.match(out.note, /larger than/i)
  } finally { await s.close() }
})

test("the menu bar app's proxyUrl is accepted as the service url", async () => {
  const s = await stub((req, res) => {
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ state: "open", sections: [] }))
  })
  delete process.env.INKWELL_PRO_API
  delete process.env.INKWELL_PRO_LICENSE
  try {
    const out = await sources[0].collect(ctx({ config: { proxyUrl: s.base, license: "cab-key" } }))
    assert.equal(out.state, "open")
    assert.equal(s.seen[0].auth, "Bearer cab-key")
  } finally { await s.close() }
})

test("all five desks are declared with the paper's own desk names", () => {
  const byId = Object.fromEntries(sources.map(s => [s.id, s.desk]))
  assert.deepEqual(byId, { gmail: "mail", slack: "city", notion: "notebook", calendar: "daybook", basecamp: "project" })
})
