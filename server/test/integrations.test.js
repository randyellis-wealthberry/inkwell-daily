import test from "node:test"
import assert from "node:assert"

import { normalize, withState, MAX } from "../lib/integrations.js"

const catalog = (n) => Array.from({ length: n }, (_, i) => ({
  slug: "app" + i,
  name: "App " + i,
  meta: { categories: [{ slug: "cat", name: "Category" }], description: "Does a thing." }
}))

test("Composio's own and local toolkits are dropped", () => {
  const out = normalize([
    { slug: "composio", name: "Composio" },
    { slug: "composio_search", name: "Composio Search" },
    { slug: "local_tool", name: "Local", isLocalToolkit: true },
    { slug: "gmail", name: "Gmail", meta: { categories: [{ name: "email" }], description: "Mail", logo: "https://x/y.png" } }
  ])
  assert.deepEqual(out.map(x => x.slug), ["gmail"])
  assert.equal(out[0].category, "email")
  assert.equal(out[0].logo, "https://x/y.png")
})

test("the library is capped at 25", () => {
  assert.equal(MAX, 25)
  assert.equal(withState(normalize(catalog(40)), new Set()).length, 25)
})

test("connection state is marked per slug", () => {
  const out = withState(normalize(catalog(3)), new Set(["app1"]))
  assert.deepEqual(out.map(x => x.connected), [false, true, false])
})
