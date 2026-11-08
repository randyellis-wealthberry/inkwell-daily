import test from "node:test"
import assert from "node:assert"

import { group, reasonTag, kind, READER_TOOLS, SECTIONS } from "../lib/readers.js"

const item = (app, at, title) => ({ app, at, title, detail: "detail", tag: "" })

test("two apps in one section make one fold, newest first", () => {
  const parts = [
    { section: "code", app: "GitHub", items: [item("GitHub", 1000, "one"), item("GitHub", 3000, "three")] },
    { section: "code", app: "Linear", items: [item("Linear", 2000, "two")] }
  ]
  const out = group(parts, { tz: "UTC" })
  assert.equal(out.length, 1)
  assert.equal(out[0].title, SECTIONS.code.title)
  assert.deepEqual(out[0].apps, ["GitHub", "Linear"])
  assert.deepEqual(out[0].items.map(i => i.title), ["three", "two", "one"])
  assert.equal(out[0].headline, "3 things waiting")
})

test("a section is capped at six items", () => {
  const items = Array.from({ length: 10 }, (_, i) => item("GitHub", i, "t" + i))
  const out = group([{ section: "code", app: "GitHub", items }], { tz: "UTC" })
  assert.equal(out[0].items.length, 6)
  assert.deepEqual(out[0].items.map(i => i.title), ["t9", "t8", "t7", "t6", "t5", "t4"])
})

test("empty parts are dropped rather than printed", () => {
  assert.deepEqual(group([{ section: "code", app: "GitHub", items: [] }], { tz: "UTC" }), [])
})

test("notification reasons and file kinds read like a paper", () => {
  assert.equal(reasonTag("review_requested"), "Review")
  assert.equal(reasonTag("mention"), "Mention")
  assert.equal(reasonTag("ci_activity"), "CI")
  assert.equal(reasonTag("nonsense"), "")
  assert.equal(kind("application/vnd.google-apps.spreadsheet"), "Sheet")
  assert.equal(kind("application/pdf"), "PDF")
})

test("the session enables exactly the reader tools", () => {
  assert.deepEqual(READER_TOOLS.github.enable, ["GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER"])
  assert.deepEqual(READER_TOOLS.linear.enable, ["LINEAR_GET_CURRENT_USER", "LINEAR_LIST_LINEAR_ISSUES"])
  assert.deepEqual(READER_TOOLS.googledrive.enable, ["GOOGLEDRIVE_LIST_FILES"])
})
