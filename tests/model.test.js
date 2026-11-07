const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

test("dates are named for the day they report on", () => {
  assert.equal(Model.dateKeyFromDate(new Date(2026, 9, 14, 23, 59)), "2026-10-14")
  assert.equal(Model.shiftDateKey("2026-10-31", 1), "2026-11-01")
  assert.equal(Model.shiftDateKey("2026-03-01", -1), "2026-02-28")
  assert.equal(Model.longDate("2026-10-14"), "Wednesday, 14 October 2026")
  assert.equal(Model.shortDate("2026-10-14"), "Wed 14 Oct")
  assert.equal(Model.parseDateKey("20261014"), null)
})

test("the edition number matches the other daily widgets' day number", () => {
  assert.equal(Model.dayNumber("2026-10-14"), 20740)
  assert.equal(Model.editionNumber("2026-10-14"), "No. 20,740")
})

test("the masthead carries your first name, and Sunday's paper is the magazine", () => {
  assert.equal(Model.firstName("Ada Lovelace,,,", "ada"), "Ada")
  assert.equal(Model.firstName("", "ada"), "ada")
  assert.equal(Model.mastheadTitle("Ada", false), "Ada's Quattro Daily")
  assert.equal(Model.mastheadTitle("James", true), "James' Quattro Sunday")
  assert.equal(Model.mastheadTitle("", false), "Quattro Daily")
  assert.equal(Model.isWeekendEdition("2026-10-17"), true, "Saturday's news arrives on Sunday")
  assert.equal(Model.isWeekendEdition("2026-10-18"), false)
})

test("yesterday's edition is due once the morning starts, and only once", () => {
  const early = new Date(2026, 9, 15, 4, 30)
  const later = new Date(2026, 9, 15, 7, 0)
  assert.equal(Model.dueEdition(early, 5, ""), "")
  assert.equal(Model.dueEdition(later, 5, "2026-10-13"), "2026-10-14")
  assert.equal(Model.dueEdition(later, 5, "2026-10-14"), "")
  assert.equal(Model.dueEdition(later, 5, "2026-10-15"), "", "a newer edition, set by hand, counts")
  assert.equal(Model.dueEdition(new Date(2026, 10, 1, 9), 5, ""), "2026-10-31")
})

test("the index reads newest first and skips anything malformed", () => {
  const text = JSON.stringify({ editions: [
    { date: "2026-10-13", headline: "B", minutes: 2 },
    { date: "nope" },
    { date: "2026-10-14", headline: "A", minutes: 0, late: true }
  ] })
  const idx = Model.parseIndex(text)
  assert.deepEqual(idx.map(e => e.date), ["2026-10-14", "2026-10-13"])
  assert.equal(idx[0].minutes, 1)
  assert.equal(idx[0].late, true)
  assert.deepEqual(Model.parseIndex("not json"), [])
})

test("streaks count unbroken mornings, and unread follows the newest edition", () => {
  const idx = [{ date: "2026-10-14" }, { date: "2026-10-13" }, { date: "2026-10-12" }, { date: "2026-10-09" }]
  assert.equal(Model.streak(idx, "2026-10-14"), 3)
  assert.equal(Model.streak(idx, "2026-10-11"), 0)
  assert.equal(Model.streakLine(12, 4), "Your 12th edition · 4 mornings running")
  assert.equal(Model.streakLine(1, 1), "Your 1st edition")
  assert.equal(Model.ordinal(22), "22nd")
  assert.equal(Model.ordinal(13), "13th")
  assert.equal(Model.unread(idx, "2026-10-13"), true)
  assert.equal(Model.unread(idx, "2026-10-14"), false)
  assert.equal(Model.unread([], ""), false)
})

test("reading time is at an unhurried pace and never zero", () => {
  assert.equal(Model.readingMinutes(0), 1)
  assert.equal(Model.readingMinutes(700), 3)
  assert.equal(Model.countWords("<p>three <b>small</b> words</p>"), 3)
})

test("your own work leads, then the live wire, then the daily picks", () => {
  const desk = { id: "desk", kind: "made", events: 4, outcomes: 2, headline: "desk" }
  const goals = { id: "kickoff", kind: "live", events: 6 }
  const pick = { id: "elevation", kind: "pick", events: 1 }
  let p = Model.placeStories([pick, goals, desk], desk)
  assert.equal(p.lead.id, "desk")
  assert.equal(p.desk, null, "the desk isn't printed twice")
  assert.equal(p.sidebarLead.id, "kickoff", "the sidebar opens with the next best story")
  const quietDesk = { id: "desk", kind: "made", events: 0, outcomes: 0 }
  p = Model.placeStories([pick, goals, quietDesk], quietDesk)
  assert.equal(p.lead.id, "kickoff")
  assert.equal(p.desk.id, "desk", "the desk stays above the fold even on a quiet day")
  p = Model.placeStories([pick, quietDesk], quietDesk)
  assert.equal(p.lead.id, "elevation", "a pick only leads when nothing happened")
})

test("a followed club's goals outrank a busier neutral match", () => {
  const ranked = Model.rankStories([
    { id: "a", kind: "live", events: 7 },
    { id: "b", kind: "live", events: 2, followed: true }
  ])
  assert.equal(ranked[0].id, "b")
})

test("the jumble scrambles the same way all day, with exactly the answer's letters", () => {
  const words = [{ word: "Aalto", clue: "a" }, { word: "Dürer", clue: "b" }, { word: "Munger", clue: "c" }, { word: "Strata", clue: "d" }, { word: "Isobar", clue: "e" }]
  const a = Model.jumble(words, 20740, 4)
  const b = Model.jumble(words, 20740, 4)
  assert.deepEqual(a, b)
  assert.equal(a.length, 4)
  assert.equal(a[1].answer, "DURER")
  for (const r of a) {
    assert.ok(Model.sameLetters(r.answer, r.scramble), r.answer)
    assert.notEqual(r.answer, r.scramble)
  }
  assert.equal(Model.jumble([{ word: "Gaudí" }, { word: "Le" }, { word: "AAAA" }], 1).length, 1)
})

test("keybind of the day skips the ones everyone knows and changes daily", () => {
  const text = "SUPER + RETURN   → Terminal\nSUPER + O   → Pop window out\nSUPER SHIFT + F   → File manager\nnonsense"
  const binds = Model.parseKeybindings(text)
  assert.equal(binds.length, 3)
  assert.deepEqual(binds[1].keys, ["Super", "O"])
  const picks = new Set([0, 1, 2, 3].map(d => Model.keybindOfDay(binds, d).action))
  assert.ok(!picks.has("Terminal"))
  assert.equal(picks.size, 2)
})

const RAW = JSON.stringify({
  daily: {
    time: ["2026-10-14", "2026-10-15"],
    weather_code: [3, 63],
    temperature_2m_max: [16, 14], temperature_2m_min: [12, 11],
    precipitation_sum: [0, 11.2], precipitation_probability_max: [5, 90],
    sunrise: ["2026-10-14T07:04", "2026-10-15T07:05"], sunset: ["2026-10-14T18:10", "2026-10-15T18:08"]
  },
  hourly: { time: ["2026-10-14T00:00", "2026-10-14T01:00", "2026-10-15T00:00"], temperature_2m: [16, 15, 14], wind_speed_10m: [10, 19, 5] }
})

test("a day's weather is read from Open-Meteo and put in a headline", () => {
  const d = Model.weatherDay(RAW, "2026-10-14")
  assert.equal(d.hours.length, 2)
  assert.equal(d.windMax, 19)
  assert.equal(Model.tempText(d.max, true), "61°")
  assert.equal(Model.weatherHeadline(d), "Grey all day, and dry")
  assert.equal(Model.earIcon(d), "cloud")
  const wet = Model.weatherDay(RAW, "2026-10-15")
  assert.equal(Model.earIcon(wet), "umbrella")
  assert.equal(Model.precipText(wet.precip, true), "0.44 in")
  assert.equal(Model.weatherDay(RAW, "2026-10-20"), null)
  assert.equal(Model.clockText("2026-10-14T18:10"), "6:10 pm")
})

test("meanwhile, somewhere you keep an eye on", () => {
  assert.equal(Model.meanwhileLine("Tokyo", { temperature_2m: 20.3, weather_code: 0, is_day: 1 }, true), "Meanwhile in Tokyo: 69° and sunny")
  assert.equal(Model.meanwhileLine("Oslo", { temperature_2m: 2, weather_code: 71, is_day: 0 }, false), "Meanwhile in Oslo: 2° and light snow")
  assert.equal(Model.meanwhileLine("Nowhere", null, false), "")
})

test("corrections hold yesterday's forecast against what happened", () => {
  assert.deepEqual(Model.corrections({ max: 16, min: 12, precip: 0 }, { max: 14.2, min: 11, precip: 0 }, true),
    ["We forecast a high of 61°; it reached 58°."])
  assert.deepEqual(Model.corrections({ max: 16, min: 12, precip: 5 }, { max: 16, min: 12, precip: 0 }, false), ["We said rain. It stayed dry."])
  assert.deepEqual(Model.corrections({ max: 16, min: 12, precip: 0 }, { max: 16.4, min: 12, precip: 0 }, true), [])
  assert.deepEqual(Model.corrections(null, { max: 1 }, true), [])
})

test("Claude's prose is kept only where it adds no facts", () => {
  const facts = "17 commits landed across seven plugins\nIsobar: places"
  const out = Model.cleanProse('Sure! {"leadHeadline": "Seven plugins took 17 commits", "deskHeadline": "Isobar gained 3 features", "deskDeck": "<b>Places</b> arrived", "other": "x"}', facts)
  assert.equal(out.leadHeadline, "Seven plugins took 17 commits")
  assert.equal(out.deskHeadline, undefined, "3 isn't in the facts")
  assert.equal(out.deskDeck, "Places arrived")
  assert.equal(out.other, undefined)
  assert.deepEqual(Model.cleanProse("no json here", facts), {})
  assert.equal(Model.cleanProse({ leadHeadline: "x".repeat(200) }, facts).leadHeadline, undefined)
  assert.equal(Model.cleanProse({ leadHeadline: "1 commit landed" }, "17 commits landed").leadHeadline, undefined, "a number inside another isn't in the facts")
  assert.equal(Model.cleanProse({ leadHeadline: "17 commits, by 3:41 pm." }, "17 commits; last at 3:41 pm").leadHeadline, "17 commits, by 3:41 pm.")
})

test("commands go through argv, never a shell", () => {
  assert.deepEqual(Model.buildCommand("/p/bin/quattro-daily-build", "2026-10-14", true), ["/p/bin/quattro-daily-build", "--date", "2026-10-14", "--prose"])
  assert.deepEqual(Model.openCommand("/x/a b.html"), ["xdg-open", "/x/a b.html"])
  assert.equal(Model.toastCommand("Your paper is here", "x")[0], "omarchy-notification-send")
})

test("Claude runs without tools, with the prompt on stdin and a time limit", () => {
  const cmd = Model.proseCommand()
  assert.equal(cmd[0], "claude")
  assert.ok(cmd.includes("-p"))
  assert.ok(cmd.includes("--strict-mcp-config"))
  assert.deepEqual(cmd.slice(-2), ["--tools", ""], "an empty tool list, last so it can't swallow anything")
  assert.ok(Model.PROSE_TIMEOUT_MS > 0 && Model.PROSE_TIMEOUT_MS <= 300000)
})

test("the build asks for prose only when the setting is on", () => {
  assert.deepEqual(Model.buildCommand("/b", "2026-10-14", false), ["/b", "--date", "2026-10-14"])
  assert.deepEqual(Model.buildCommand("/b", "2026-10-14", true), ["/b", "--date", "2026-10-14", "--prose"])
})

test("a failed press waits before it tries the same edition again", () => {
  const t = 1e12
  assert.equal(Model.retryDue("", 0, "2026-10-14", t), true)
  assert.equal(Model.retryDue("2026-10-14", t, "2026-10-14", t + 60000), false)
  assert.equal(Model.retryDue("2026-10-14", t, "2026-10-14", t + Model.RETRY_MS), true)
  assert.equal(Model.retryDue("2026-10-13", t, "2026-10-14", t + 60000), true, "a new day's edition doesn't wait")
})
