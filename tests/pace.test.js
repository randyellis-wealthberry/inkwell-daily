const test = require("node:test")
const assert = require("node:assert/strict")
const { pace, stretches, duration } = require("../lib/pace.js")

const at = (h, m) => new Date(2026, 10, 6, h, m || 0).getTime()
const every = (h, m, count, gapMin) => Array.from({ length: count }, (_, i) => at(h, m + i * gapMin))
const row = (p, id) => p.rows.find(r => r.id === id)

test("a gap over 15 minutes ends a stretch", () => {
  const s = stretches([at(9), at(9, 10), at(9, 24), at(10), at(10, 5)])
  assert.equal(s.length, 2)
  assert.equal(s[0].prompts, 3)
  assert.equal(duration(100 * 60000), "1h 40m")
  assert.equal(duration(30 * 60000), "30m")
})

test("no prompts, no Pace box", () => {
  assert.equal(pace({ prompts: [], commits: [] }), null)
})

test("a healthy day is one line: focus blocks and nothing too long", () => {
  const p = pace({ prompts: every(9, 0, 7, 10), commits: [at(10, 0)] }) // 9:00–10:00, ships at 10
  assert.equal(p.healthy, true)
  assert.match(p.verdict, /Good pace: 1 focus block/)
  assert.deepEqual(p.rows.filter(r => r.note), [], "nothing else to say")
})

test("a long stretch with no commits flags the break and the spinning", () => {
  const p = pace({ prompts: every(13, 0, 40, 5), commits: [] }) // 13:00–16:15, 40 prompts
  assert.equal(row(p, "stretch").flag, true)
  assert.equal(row(p, "stretch").value, "3h 15m")
  assert.equal(row(p, "spinning").flag, true)
  assert.equal(row(p, "spinning").value, "40")
  assert.match(row(p, "focus").note, /Pick one small thing/)
  assert.match(p.verdict, /2 signs to ease off/)
})

test("a commit resets the run of prompts", () => {
  const prompts = every(13, 0, 40, 5)
  const p = pace({ prompts: prompts, commits: [prompts[19] + 60000] })
  assert.equal(row(p, "spinning").value, "20")
  assert.equal(row(p, "spinning").flag, false)
})

test("a last prompt after 11pm is a late finish", () => {
  const p = pace({ prompts: [at(22, 50), at(23, 10)], commits: [] })
  assert.equal(row(p, "late").flag, true)
  assert.equal(row(p, "late").value, "11:10pm")
  assert.equal(row(pace({ prompts: [at(20)], commits: [] }), "late").flag, false)
})

test("commits outside the stretches aren't called a day without shipping", () => {
  const p = pace({ prompts: every(16, 40, 18, 5), commits: [at(12, 30), at(13, 10)] })
  assert.equal(row(p, "focus").value, "0")
  assert.match(row(p, "focus").note, /2 commits landed, but outside your prompting stretches/)
  assert.match(p.verdict, /shipping happened between stretches/)
})
