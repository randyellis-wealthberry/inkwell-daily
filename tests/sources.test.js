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

test("a source's answer carries its desk, state, last-set line and safe action", () => {
  const r = S.cleanResult({
    state: "expired",
    lastSet: "Thursday, 6:12 am",
    action: { label: "Reconnect Slack", href: "inkwell-daily://desk?desk=slack" },
    sections: [{ headline: "The connection has lapsed", note: "Slack stopped answering." }]
  }, { id: "slack", name: "Slack", desk: "city" })
  assert.equal(r.desk, "city")
  assert.equal(r.state, "expired")
  assert.equal(r.lastSet, "Thursday, 6:12 am")
  assert.equal(r.action.label, "Reconnect Slack")
  assert.equal(r.sections[0].desk, "city")
})

test("a source cannot choose a javascript action or a slot it did not declare", () => {
  const r = S.cleanResult({
    state: "open",
    action: { label: "Click", href: "javascript:alert(1)" },
    sections: [{ headline: "x" }]
  }, { id: "gmail", name: "Gmail" })
  assert.equal(r.desk, "mail", "the id maps to the mail desk")
  assert.equal(r.action.href, "", "the unsafe scheme is dropped")
})

test("every source leaves a desk record, even when it is closed or throws", async () => {
  const out = await S.collectAll([
    { id: "gmail", name: "Gmail", desk: "mail", collect: () => ({ state: "open", sections: [{ headline: "29 emails" }] }) },
    { id: "slack", name: "Slack", desk: "city", collect: () => null },
    { id: "notion", name: "Notion", desk: "notebook", collect: () => { throw new Error("no auth") } },
    { id: "calendar", name: "Calendar", desk: "daybook", collect: () => ({ state: "closed" }) }
  ], {}, { sources: { calendar: { enabled: false } } })
  assert.equal(out.desks.length, 4)
  assert.equal(out.desks[0].state, "open")
  assert.equal(out.desks[1].state, "closed")
  assert.equal(out.desks[2].state, "error")
  assert.match(out.desks[2].action.label, /Retry Notion/)
  assert.equal(out.desks[3].state, "closed")
  assert.equal(out.desks[3].disabled, true)
  assert.ok(out.sections.some(s => /Notion didn't report/.test(s.headline)))
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
