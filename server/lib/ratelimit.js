// A token bucket per license, and a cap on how many desk calls one license can
// have in flight at once.
//
// In-memory on purpose: the service is expected to run as one small instance
// (or a few behind a load balancer), and a per-license budget of a few dozen
// calls an hour does not need Redis. If it ever scales past that, the buckets
// become approximate rather than wrong: a license could get one budget per
// instance. Move them to a shared store before that matters.
//
// `now` is injectable so the tests can move time without sleeping.

"use strict"

function createLimiter(opts) {
  opts = opts || {}
  const limit = Math.max(1, Number(opts.limit) || 60)
  const windowMs = Math.max(1000, Number(opts.windowMs) || 60 * 60 * 1000)
  const maxInFlight = Math.max(1, Number(opts.maxInFlight) || 2)
  const now = opts.now || Date.now
  const rate = limit / windowMs // tokens per millisecond

  const buckets = new Map()
  let ops = 0

  function bucketFor(key) {
    const t = now()
    let b = buckets.get(key)
    if (!b) {
      b = { tokens: limit, at: t, inFlight: 0 }
      buckets.set(key, b)
    } else if (t > b.at) {
      b.tokens = Math.min(limit, b.tokens + (t - b.at) * rate)
      b.at = t
    }
    return b
  }

  function sweep(maxIdleMs) {
    const t = now()
    for (const [key, b] of buckets) {
      if (b.inFlight === 0 && t - b.at > maxIdleMs) buckets.delete(key)
    }
    return buckets.size
  }

  return {
    // take() before doing the work, release() in a finally. A refusal is a 429.
    take(key) {
      const b = bucketFor(key)
      if (b.inFlight >= maxInFlight) return { ok: false, reason: "busy", retryAfter: 1 }
      if (b.tokens < 1) {
        const waitMs = (1 - b.tokens) / rate
        return { ok: false, reason: "rate", retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) }
      }
      b.tokens -= 1
      b.inFlight += 1
      if (++ops % 500 === 0) sweep(2 * windowMs)
      return { ok: true }
    },
    release(key) {
      const b = buckets.get(key)
      if (b) b.inFlight = Math.max(0, b.inFlight - 1)
    },
    sweep,
    size() { return buckets.size }
  }
}

// A cap on failed authentication per address, on its own clock. Brute force is
// impractical against a 256-bit key, but the attempts still cost CPU, and the
// budget for a valid license should not be the thing an attacker spends.
function createAuthGuard(opts) {
  opts = opts || {}
  const limit = Math.max(1, Number(opts.limit) || 20)
  const windowMs = Math.max(1000, Number(opts.windowMs) || 10 * 60 * 1000)
  const now = opts.now || Date.now
  const state = new Map()

  return {
    // 0 when allowed, otherwise the seconds to wait.
    blocked(ip) {
      const s = state.get(ip)
      if (!s) return 0
      const left = windowMs - (now() - s.at)
      if (left <= 0) { state.delete(ip); return 0 }
      return s.count >= limit ? Math.max(1, Math.ceil(left / 1000)) : 0
    },
    fail(ip) {
      const t = now()
      let s = state.get(ip)
      if (!s || t - s.at >= windowMs) { s = { count: 0, at: t }; state.set(ip, s) }
      s.count += 1
      return s.count
    },
    clear(ip) { state.delete(ip) },
    size() { return state.size }
  }
}

export { createLimiter, createAuthGuard }
