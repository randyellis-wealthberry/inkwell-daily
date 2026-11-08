const test = require("node:test")
const assert = require("node:assert/strict")

const { settings, secure } = require("../lib/integrations.js")

test("the library settings come from whichever source has them", () => {
  assert.deepEqual(
    settings({ sources: { gmail: { proxyUrl: "http://127.0.0.1:8787", license: "dev-license" } } }),
    { url: "http://127.0.0.1:8787", license: "dev-license" }
  )
  assert.deepEqual(
    settings({ sources: { slack: { url: "https://desks.example/", license: "k" } } }),
    { url: "https://desks.example", license: "k" }
  )
  assert.equal(settings({ sources: { gmail: { proxyUrl: "http://127.0.0.1:8787" } } }), null, "no license, no page")
})

test("only https, or http to this machine", () => {
  assert.equal(secure("https://desks.example"), true)
  assert.equal(secure("http://127.0.0.1:8787"), true)
  assert.equal(secure("http://localhost:8787"), true)
  assert.equal(secure("http://desks.example"), false)
  assert.equal(secure("ftp://desks.example"), false)
})
