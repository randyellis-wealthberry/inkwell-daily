// The Pace box: four signals from yesterday's prompt and commit times that
// tell a solo builder to take a break or to push on. No charts; each is a
// number and a sentence, and a healthy day prints one line. Pure.

"use strict"

const BREAK_GAP = 15 * 60000 // a gap this long ends a stretch
const LONG_STRETCH = 90 * 60000 // focus fades past this
const FOCUS_BLOCK = 45 * 60000 // a stretch this long that ships is a block
const SPINNING = 30 // prompts since a commit, inside one stretch
const LATE_HOUR = 23 // a last prompt from here, or before LATE_UNTIL
const LATE_UNTIL = 4

function duration(ms) {
  const m = Math.round(ms / 60000)
  return m < 60 ? m + "m" : Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "")
}

function clock(ms) {
  const d = new Date(ms)
  const h = d.getHours(), m = d.getMinutes()
  return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + (h < 12 ? "am" : "pm")
}

// Runs of prompts with no gap longer than BREAK_GAP.
function stretches(times) {
  const out = []
  for (const t of times) {
    const last = out[out.length - 1]
    if (last && t - last.end <= BREAK_GAP) { last.end = t; last.prompts++ } else out.push({ start: t, end: t, prompts: 1 })
  }
  return out
}

// day: { prompts: [ms], commits: [ms] } for one date.
function pace(day) {
  const times = (day.prompts || []).slice().sort((a, b) => a - b)
  if (!times.length) return null
  const commits = (day.commits || []).slice().sort((a, b) => a - b)
  const runs = stretches(times)

  const longest = runs.reduce((m, r) => r.end - r.start > m.end - m.start ? r : m, runs[0])
  const long = longest.end - longest.start

  // The most prompts in a row with no commit between them, within a stretch.
  let spin = 0, spinAt = 0
  for (const r of runs) {
    let n = 0, prev = -Infinity
    for (const t of times.filter(t => t >= r.start && t <= r.end)) {
      if (commits.some(c => c > prev && c <= t)) n = 0
      n++
      prev = t
      if (n > spin) { spin = n; spinAt = t }
    }
  }

  const last = times[times.length - 1]
  const lastHour = new Date(last).getHours()
  const late = lastHour >= LATE_HOUR || lastHour < LATE_UNTIL

  const blocks = runs.filter(r => r.end - r.start >= FOCUS_BLOCK && commits.some(c => c >= r.start && c <= r.end + BREAK_GAP))

  const rows = [
    { id: "stretch", label: "Longest stretch", value: duration(long), flag: long > LONG_STRETCH,
      note: long > LONG_STRETCH ? "Without a 15-minute break, from " + clock(longest.start) + ". Focus fades past 90 minutes; step away sooner." : "" },
    { id: "spinning", label: "Prompts without a commit", value: String(spin), flag: spin >= SPINNING,
      note: spin >= SPINNING ? spin + " prompts in a row by " + clock(spinAt) + " with nothing committed. When it's spinning, a walk beats another prompt." : "" },
    { id: "late", label: "Last prompt", value: clock(last), flag: late,
      note: late ? "A late finish. Tomorrow's first hour pays for it." : "" },
    { id: "focus", label: "Focus blocks", value: String(blocks.length), flag: false,
      note: blocks.length ? "" : commits.length
        ? commits.length + " commit" + (commits.length === 1 ? "" : "s") + " landed, but outside your prompting stretches. Fine when an agent shipped on its own."
        : "No stretch of 45 minutes ended in a commit. Pick one small thing to ship first." }
  ]
  const flagged = rows.filter(r => r.flag)
  const verdict = flagged.length
    ? (flagged.length === 1 ? "One sign to ease off." : flagged.length + " signs to ease off.")
    : blocks.length ? "Good pace: " + blocks.length + " focus block" + (blocks.length === 1 ? "" : "s") + ", nothing past 90 minutes."
      : commits.length ? "An even pace; the shipping happened between stretches."
        : "An even pace, but nothing shipped from a long stretch."
  return { verdict: verdict, rows: rows, healthy: !flagged.length && blocks.length > 0 }
}

module.exports = { pace, stretches, duration }
