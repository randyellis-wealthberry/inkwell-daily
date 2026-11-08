import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { randomBytes } from "node:crypto"
import { create, hash, userId, isStrong } from "../lib/licenses.js"

test("keys from the environment are accepted and nothing else is", () => {
  const l = create({ env: { INKWELL_LICENSES: "key-one, key-two" } })
  assert.equal(l.check("key-one").ok, true)
  assert.equal(l.check("key-two").ok, true)
  assert.equal(l.check("key-three").ok, false)
  assert.equal(l.check("").ok, false)
  assert.equal(l.check(null).ok, false)
  assert.equal(l.count(), 2)
})

test("a license maps to a stable, opaque Composio user id", () => {
  const l = create({ env: { INKWELL_LICENSES: "key-one" } })
  const who = l.check("key-one")
  assert.match(who.userId, /^ink_[0-9a-f]{24}$/)
  assert.equal(who.userId, userId("key-one"))
  assert.equal(who.userId, l.userId("key-one"))
  assert.ok(!who.userId.includes("key-one"), "the key itself is never the identity")
  assert.equal(hash("key-one").length, 64)
})

test("a key in the file is accepted, and removing it via the file revokes it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-lic-"))
  const file = path.join(dir, "licenses.json")
  const write = (body, secs) => {
    fs.writeFileSync(file, JSON.stringify(body))
    const when = new Date(secs * 1000)
    fs.utimesSync(file, when, when)
  }

  try {
    write(["key-one"], 100)
    const l = create({ env: { INKWELL_LICENSE_FILE: file } })
    assert.equal(l.check("key-one").ok, true)

    // Revocation: no restart, no code change. The next request is refused.
    write([], 200)
    assert.equal(l.check("key-one").ok, false)

    write(["key-two"], 300)
    assert.equal(l.check("key-two").ok, true, "a new key works without a restart")
    assert.equal(l.check("key-one").ok, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("the file may be an object, and env keys still work alongside it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-lic-"))
  const file = path.join(dir, "licenses.json")
  try {
    fs.writeFileSync(file, JSON.stringify({ licenses: ["from-file"] }))
    const l = create({ env: { INKWELL_LICENSES: "from-env", INKWELL_LICENSE_FILE: file } })
    assert.equal(l.check("from-file").ok, true)
    assert.equal(l.check("from-env").ok, true, "the fixed list is merged, not replaced")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a half-written file does not take every license down", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-lic-"))
  const file = path.join(dir, "licenses.json")
  try {
    fs.writeFileSync(file, JSON.stringify(["key-one"]))
    const l = create({ env: { INKWELL_LICENSE_FILE: file } })
    assert.equal(l.check("key-one").ok, true)

    fs.writeFileSync(file, "{\"licenses\": [") // mid-write
    const later = new Date(400 * 1000)
    fs.utimesSync(file, later, later)
    assert.equal(l.check("key-one").ok, true, "the last good list is kept")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a missing license file is not an error", () => {
  const l = create({ env: { INKWELL_LICENSES: "env-key", INKWELL_LICENSE_FILE: "/nope/nowhere/licenses.json" } })
  assert.equal(l.check("env-key").ok, true)
  assert.equal(l.check("other").ok, false)
})

test("a generated key is strong; a placeholder or a short key is not", () => {
  assert.equal(isStrong(randomBytes(32).toString("base64url")), true)
  assert.equal(isStrong("dev-license-change-me"), false)
  assert.equal(isStrong("test-key"), false)
  assert.equal(isStrong("short"), false)
})

test("a placeholder is tolerated in development and refused in production", () => {
  const dev = create({ env: { INKWELL_LICENSES: "dev-license-change-me" } })
  assert.equal(dev.check("dev-license-change-me").ok, true, "local development still works")
  assert.equal(dev.weak(), 1)
  assert.equal(dev.refused(), 0)

  const prod = create({ env: { NODE_ENV: "production", INKWELL_LICENSES: "dev-license-change-me" } })
  assert.equal(prod.check("dev-license-change-me").ok, false, "a copied example is not a free account")
  assert.equal(prod.count(), 0)
  assert.equal(prod.refused(), 1)
})

test("a short key is refused in production", () => {
  const prod = create({ env: { NODE_ENV: "production", INKWELL_LICENSES: "abc123" } })
  assert.equal(prod.check("abc123").ok, false)
  assert.equal(prod.count(), 0)
})
