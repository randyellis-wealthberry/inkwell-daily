const test = require("node:test")
const assert = require("node:assert/strict")
const Fonts = require("../lib/fonts.js")

test("font pairings are free Google Fonts with fallbacks", () => {
  assert.equal(Fonts.FONTS.length, 7)
  assert.equal(Fonts.get("nope").id, "inkwell")
  assert.equal(Fonts.get(undefined).id, "inkwell")
  assert.equal(Fonts.byId("Broadsheet").id, "broadsheet")
  assert.equal(Fonts.byId("Bodoni").url.includes("Bodoni+Moda"), true)
  assert.equal(Fonts.byId("nonsense"), null)
  for (const f of Fonts.FONTS) {
    assert.match(f.url, /^https:\/\/fonts\.googleapis\.com\/css2\?/)
    assert.ok(f.name && f.blurb)
    assert.ok(f.plate && f.serif && f.mono)
    assert.equal(Fonts.get(f.id).id, f.id)
  }
})
