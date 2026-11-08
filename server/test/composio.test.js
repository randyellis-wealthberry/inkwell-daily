import test from "node:test"
import assert from "node:assert"

import { create, sessionConfig, missingAuthConfigs, TTL_MS } from "../lib/composio.js"

// Stands in for the SDK: records how often a session is really created, and
// what policy it was created with.
function sdk() {
  const creates = []
  const configs = []
  const session = {
    execute: async () => ({ successful: true, data: {} }),
    toolkits: async () => ({ items: [] }),
    authorize: async () => ({ redirectUrl: "https://connect.example/x" })
  }
  return {
    creates,
    configs,
    sessions: {
      create: async (userId, config) => {
        creates.push(userId)
        configs.push(config)
        return session
      }
    }
  }
}

test("the session lifetime is ten minutes", () => {
  assert.equal(TTL_MS, 10 * 60 * 1000)
})

test("a session is reused inside the TTL and recreated after it", async () => {
  let t = 0
  const fake = sdk()
  const c = create({ composio: fake, now: () => t, sessionTtlMs: 1000 })

  await c.sessionFor("ink_a")
  await c.sessionFor("ink_a")
  assert.equal(fake.creates.length, 1, "the second call reuses it")

  t = 999
  await c.sessionFor("ink_a")
  assert.equal(fake.creates.length, 1, "still inside the window")

  t = 1000
  await c.sessionFor("ink_a")
  assert.equal(fake.creates.length, 2, "expired, so a fresh session is made")
})

test("forget drops the session, which is how a revoked license is cut off", async () => {
  const fake = sdk()
  const c = create({ composio: fake })

  await c.sessionFor("ink_a")
  assert.equal(fake.creates.length, 1)

  c.forget("ink_a")
  await c.sessionFor("ink_a")
  assert.equal(fake.creates.length, 2)
})

test("two services in one process do not share a session cache", async () => {
  const fake = sdk()
  const one = create({ composio: fake })
  const two = create({ composio: fake })

  await one.sessionFor("ink_a")
  await two.sessionFor("ink_a")
  assert.equal(fake.creates.length, 2)
})

test("execute and connectLink go through the session, not a raw user id", async () => {
  const fake = sdk()
  const c = create({ composio: fake })
  const out = await c.execute("ink_a", "GMAIL_FETCH_EMAILS", {})
  assert.equal(out.successful, true)
  assert.equal(await c.connectLink("ink_a", "gmail"), "https://connect.example/x")
})

test("read-only auth configs are passed to the session", () => {
  const cfg = sessionConfig({
    COMPOSIO_AUTH_CONFIG_GMAIL: "ac_gmail",
    COMPOSIO_AUTH_CONFIG_SLACK: " ac_slack "
  })
  assert.deepEqual(cfg.authConfigs, { gmail: "ac_gmail", slack: "ac_slack" })
  assert.equal(cfg.sandbox.enable, false)
  assert.deepEqual(cfg.toolkits.enable.slice().sort(), ["basecamp", "github", "gmail", "googlecalendar", "googledrive", "linear", "notion", "slack"])
})

test("with no auth configs the session sends none, and every toolkit is missing one", () => {
  const cfg = sessionConfig({})
  assert.equal(cfg.authConfigs, undefined)
  assert.deepEqual(missingAuthConfigs({}).sort(), ["basecamp", "github", "gmail", "googlecalendar", "googledrive", "linear", "notion", "slack"])
})

test("strict mode refuses to create a session that would use managed scopes", async () => {
  const fake = sdk()
  const c = create({
    composio: fake,
    requireCustomAuth: true,
    env: { COMPOSIO_AUTH_CONFIG_GMAIL: "ac_gmail" }
  })
  await assert.rejects(() => c.sessionFor("ink_a"), /read-only auth config/i)
  assert.equal(fake.creates.length, 0, "no session is created at all")
})

test("strict mode passes when every toolkit has a read-only config", async () => {
  const fake = sdk()
  const env = {
    COMPOSIO_AUTH_CONFIG_GMAIL: "a",
    COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR: "b",
    COMPOSIO_AUTH_CONFIG_SLACK: "c",
    COMPOSIO_AUTH_CONFIG_NOTION: "d",
    COMPOSIO_AUTH_CONFIG_BASECAMP: "e",
    COMPOSIO_AUTH_CONFIG_GITHUB: "f",
    COMPOSIO_AUTH_CONFIG_LINEAR: "g",
    COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE: "h"
  }
  const c = create({ composio: fake, requireCustomAuth: true, env })
  await c.sessionFor("ink_a")
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.configs[0].authConfigs.gmail, "a")
})
