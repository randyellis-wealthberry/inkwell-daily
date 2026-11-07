const test = require("node:test")
const assert = require("node:assert/strict")
const Trend = require("../lib/trend.js")

function sessionWithPrompts(key, count) {
  return { prompts: Array.from({ length: count }, (_, i) => ({ key: key, at: i, text: "prompt " + i })) }
}

test("a quiet fortnight forecasts a clean page", () => {
  const t = Trend.compute([], [], "2026-11-07", 14)
  assert.equal(t.days.length, 14)
  assert.equal(t.totalPrompts, 0)
  assert.equal(t.totalTokens, 0)
  assert.equal(t.forecast.prompts, 0)
  assert.equal(t.forecast.direction, "flat")
  assert.equal(t.headline, "A clean page")
  assert.match(t.blurb, /clean page/)
  assert.equal(t.peak, null)
})

test("prompts and tokens are summed per day and across the line", () => {
  const sessions = [
    sessionWithPrompts("2026-11-06", 2),
    sessionWithPrompts("2026-11-07", 3)
  ]
  const usage = [
    { key: "2026-11-06", input: 100, output: 40, cacheRead: 10, cacheWrite: 5 },
    { key: "2026-11-07", input: 200, output: 50, cacheRead: 0, cacheWrite: 0 }
  ]
  const t = Trend.compute(sessions, usage, "2026-11-07", 14)
  assert.equal(t.days.at(-1).prompts, 3)
  assert.equal(t.days.at(-2).prompts, 2)
  assert.equal(t.totalPrompts, 5)
  assert.equal(t.days.at(-1).tokens, 250)
  assert.equal(t.totalTokens, 405)
  assert.equal(t.activeDays, 2)
  assert.equal(t.peak.date, "2026-11-07")
  assert.match(t.blurb, /5 prompts/)
  assert.match(t.blurb, /405 tokens|405/)
})

test("a rising week leans up and forecasts a number", () => {
  const sessions = []
  for (const key of ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]) {
    sessions.push(sessionWithPrompts(key, 1))
  }
  for (const key of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]) {
    sessions.push(sessionWithPrompts(key, 4))
  }
  const t = Trend.compute(sessions, [], "2026-11-07", 14)
  assert.equal(t.forecast.direction, "up")
  assert.ok(t.forecast.prompts >= 3)
  assert.ok(t.forecast.deltaPercent > 0)
  assert.match(t.headline, /leaning up/)
  assert.match(t.teaser, /Up /)
})

test("a falling week eases", () => {
  const sessions = []
  for (const key of ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]) {
    sessions.push(sessionWithPrompts(key, 5))
  }
  for (const key of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]) {
    sessions.push(sessionWithPrompts(key, 1))
  }
  const t = Trend.compute(sessions, [], "2026-11-07", 14)
  assert.equal(t.forecast.direction, "down")
  assert.match(t.headline, /easing/)
})

test("token counts are compact in the blurb", () => {
  const usage = [{ key: "2026-11-07", input: 1_400_000, output: 200_000 }]
  const t = Trend.compute([sessionWithPrompts("2026-11-07", 2)], usage, "2026-11-07", 14)
  assert.equal(t.totalTokens, 1_600_000)
  assert.match(t.blurb, /1\.6M tokens/)
})
