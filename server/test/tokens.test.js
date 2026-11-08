import test from "node:test"
import assert from "node:assert"

import { mint, read } from "../lib/tokens.js"

test("a connect token round-trips", () => {
  const t = mint("secret", "ink_abc", "github", 60000, 1000)
  assert.deepEqual(read("secret", t, 2000), { userId: "ink_abc", slug: "github" })
})

test("a tampered token, another secret, or an expired one is refused", () => {
  const t = mint("secret", "ink_abc", "github", 1000, 0)
  const [payload, sig] = t.split(".")
  const bad = payload + "." + (sig[0] === "A" ? "B" : "A") + sig.slice(1)
  assert.equal(read("secret", bad, 0), null, "tampered")
  assert.equal(read("other", t, 0), null, "signed with another secret")
  assert.equal(read("secret", t, 5000), null, "expired")
  assert.equal(read("secret", "", 0), null, "empty")
  assert.equal(read("secret", "not-a-token", 0), null, "garbage")
})
