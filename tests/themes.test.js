const test = require("node:test")
const assert = require("node:assert/strict")
const Themes = require("../lib/themes.js")

test("milestone themes unlock with the mornings in the ledger", () => {
  assert.equal(Themes.byId("firstlight").at, 3)
  assert.equal(Themes.byId("First Light").id, "firstlight")
  assert.equal(Themes.byId("first-light").id, "firstlight")
  assert.equal(Themes.byId("nope"), null)

  const none = Themes.perks(0, "auto")
  assert.equal(none.unlocked, 0)
  assert.equal(none.next.id, "firstlight")
  assert.equal(none.next.remaining, 3)

  const three = Themes.perks(3, "auto")
  assert.equal(three.unlocked, 1)
  assert.equal(three.themes[0].unlocked, true)
  assert.equal(three.next.id, "sunday")
  assert.equal(three.next.remaining, 4)

  const all = Themes.perks(100, "century")
  assert.equal(all.unlocked, 6)
  assert.equal(all.next, null)
  assert.equal(all.themes.find(t => t.id === "century").active, true)
})

test("a chosen theme falls back to auto until it is earned", () => {
  const auto = { mode: "dark", background: "#000" }
  const locked = Themes.resolve("sunday", 3, auto)
  assert.equal(locked.id, "auto")
  assert.equal(locked.palette, auto)
  assert.equal(locked.locked.id, "sunday")
  assert.equal(locked.locked.remaining, 4)

  const earned = Themes.resolve("sunday", 7, auto)
  assert.equal(earned.id, "sunday")
  assert.equal(earned.name, "Sunday Paper")
  assert.equal(earned.palette.mode, "light")
  assert.equal(earned.locked, null)

  assert.equal(Themes.resolve("auto", 50, auto).id, "auto")
  assert.equal(Themes.resolve("nonsense", 50, auto).id, "auto")
})
