import test from "node:test"
import assert from "node:assert"

import { createLimiter, createAuthGuard } from "../lib/ratelimit.js"

test("a license gets its budget, then a 429 with a retry hint", () => {
  let t = 0
  const lim = createLimiter({ limit: 3, windowMs: 60000, maxInFlight: 10, now: () => t })

  for (let i = 0; i < 3; i++) assert.equal(lim.take("a").ok, true, "call " + (i + 1))
  const no = lim.take("a")
  assert.equal(no.ok, false)
  assert.equal(no.reason, "rate")
  assert.ok(no.retryAfter >= 1, "the client is told how long to wait")

  assert.equal(lim.take("b").ok, true, "one license's budget is not another's")
})

test("the budget refills with time", () => {
  let t = 0
  const lim = createLimiter({ limit: 2, windowMs: 20000, maxInFlight: 10, now: () => t })
  assert.equal(lim.take("a").ok, true)
  assert.equal(lim.take("a").ok, true)
  assert.equal(lim.take("a").ok, false)

  t = 10000 // half a window: one token back
  assert.equal(lim.take("a").ok, true)
  assert.equal(lim.take("a").ok, false)

  t = 30000 // idle long enough to be full again
  assert.equal(lim.take("a").ok, true)
})

test("one license cannot hold every desk call open", () => {
  const lim = createLimiter({ limit: 10, windowMs: 60000, maxInFlight: 1, now: () => 0 })
  assert.equal(lim.take("a").ok, true)
  const busy = lim.take("a")
  assert.equal(busy.ok, false)
  assert.equal(busy.reason, "busy")

  lim.release("a")
  assert.equal(lim.take("a").ok, true, "a released slot is usable again")
})

test("idle buckets are swept so a long process does not grow", () => {
  let t = 0
  const lim = createLimiter({ limit: 5, windowMs: 1000, maxInFlight: 2, now: () => t })
  lim.take("a")
  lim.release("a")
  t = 10000
  assert.equal(lim.size(), 1)
  lim.sweep(2000)
  assert.equal(lim.size(), 0)
})

test("failed attempts are capped per address and cleared by a success", () => {
  let t = 0
  const guard = createAuthGuard({ limit: 2, windowMs: 60000, now: () => t })

  assert.equal(guard.blocked("1.2.3.4"), 0)
  guard.fail("1.2.3.4")
  assert.equal(guard.blocked("1.2.3.4"), 0, "one miss is allowed")
  guard.fail("1.2.3.4")
  assert.ok(guard.blocked("1.2.3.4") > 0, "the third try is blocked")
  assert.equal(guard.blocked("5.6.7.8"), 0, "another address is unaffected")

  guard.clear("1.2.3.4")
  assert.equal(guard.blocked("1.2.3.4"), 0)
})

test("the failure window expires on its own", () => {
  let t = 0
  const guard = createAuthGuard({ limit: 1, windowMs: 10000, now: () => t })
  guard.fail("a")
  assert.ok(guard.blocked("a") > 0)
  t = 10000
  assert.equal(guard.blocked("a"), 0)
})
