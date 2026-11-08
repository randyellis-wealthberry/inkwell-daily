const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { mark, NEW_MS } = require("../lib/wires.js")

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-wires-"))
}

test("a newly connected tool is new, and stops being new after a week", () => {
  const dir = tempDir()
  try {
    const first = mark(dir, ["github"], 0)
    assert.equal(first.github.isNew, true)

    const week = mark(dir, ["github"], NEW_MS - 1)
    assert.equal(week.github.isNew, true)

    const after = mark(dir, ["github"], NEW_MS + 1)
    assert.equal(after.github.isNew, false)
    assert.equal(after.github.firstSeen, 0, "the first sighting is kept")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("disconnecting drops the record, so reconnecting is new again", () => {
  const dir = tempDir()
  try {
    mark(dir, ["github"], 0)
    mark(dir, [], 1000)
    const again = mark(dir, ["github"], 2000)
    assert.equal(again.github.firstSeen, 2000)
    assert.equal(again.github.isNew, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a read-only or missing folder does not fail the page", () => {
  const state = mark("/nope/nowhere/inkwell", ["github"], 0)
  assert.equal(state.github.isNew, true)
})
