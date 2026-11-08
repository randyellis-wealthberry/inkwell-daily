const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const S = require("../lib/sources.js")

test("a source's answer is cut to size and kept to plain strings", () => {
  const r = S.cleanResult({
    sections: [{ headline: "x".repeat(500), items: [{ title: { evil: 1 }, detail: "d" }, null, "str"] }, { headline: "" }],
    meter: [{ label: "Mail", value: 3 }, { label: "", value: "1" }],
    classifieds: [{ kind: "SCAM", text: "t" }]
  }, { name: "Mail" })
  assert.equal(r.sections.length, 1)
  assert.equal(r.sections[0].headline.length, 140)
  assert.deepEqual(r.sections[0].items, [{ time: "", title: "", detail: "d", tag: "" }])
  assert.deepEqual(r.meter, [{ label: "Mail", value: "3" }])
  assert.equal(r.classifieds[0].kind, "NOTICE")
})

test("a source that throws becomes a note, and a disabled one is skipped", async () => {
  const out = await S.collectAll([
    { id: "a", name: "Broken", collect: () => { throw new Error("no auth") } },
    { id: "b", name: "Off", collect: () => ({ sections: [{ headline: "never" }] }) }
  ], {}, { sources: { b: { enabled: false } } })
  assert.equal(out.sections.length, 1)
  assert.equal(out.sections[0].headline, "Broken didn't report")
  assert.equal(out.sections[0].note, "no auth")
})

test("an installed Inkwell Pro is recognized among the sources", () => {
  assert.equal(S.hasPro([{ id: "gmail", plugin: S.PRO_PLUGIN }]), true)
  assert.equal(S.hasPro([{ id: "demo", plugin: "/tmp/demo.js" }]), false)
  assert.equal(S.hasPro([]), false)
})

test("plugins named in config load from an absolute path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-plugin-"))
  const file = path.join(dir, "p.js")
  fs.writeFileSync(file, "module.exports = { sources: [{ id: 'demo', name: 'Demo', collect: () => null }, { id: 3 }] }")
  const found = S.loadPlugins({ plugins: [file] }, dir)
  assert.deepEqual(found.map(s => s.id), ["demo"])
  fs.rmSync(dir, { recursive: true, force: true })
})
