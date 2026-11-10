// Sets the edition: turns what collect.js gathered into stories, ranks them
// with the rules in Model.js, and lays out every section. Pure — the same
// gathering always makes the same paper — so tests can feed it fixtures.

"use strict"

const Model = require("../Model.js")
const Pace = require("./pace.js")
const Themes = require("./themes.js")
const Fonts = require("./fonts.js")
const Trend = require("./trend.js")

function clock(ms) {
  const d = new Date(ms)
  const h = d.getHours(), m = d.getMinutes()
  return ((h % 12) || 12) + ":" + Model.pad2(m) + (h < 12 ? " am" : " pm")
}

function plural(n, one, many) {
  return n + " " + (n === 1 ? one : (many || one + "s"))
}

function joinNames(names) {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list.join("")
  return list.slice(0, -1).join(", ") + " and " + list[list.length - 1]
}

function quoteSnip(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 12)).replace(/[,.;:]$/, "") + "…"
}

function shortPath(p, home) {
  return String(p || "").replace(home || "\u0000", "~") || "~"
}

// "In your home folder", "In ~/Work"
function where(cwd, home) {
  if (!cwd || cwd === home) return "In your home folder"
  return "In " + shortPath(cwd, home)
}

function surname(name) {
  const parts = String(name || "").replace(/\(.*?\)/g, "").split(/\s+(?:and|&)\s+|,/)[0].trim().split(/\s+/)
  return parts[parts.length - 1] || ""
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"]

function numberWord(n) {
  return WORDS[n] || String(n)
}

function bytesText(n) {
  if (!isFinite(n)) return "—"
  return Math.round(n / 1e9) + " GB"
}

// ---- Stories ------------------------------------------------------------------

function sessionsOn(sessions, key) {
  return (sessions || []).map(s => Object.assign({}, s, { prompts: s.prompts.filter(p => p.key === key) }))
    .filter(s => s.prompts.length)
}

function outcomesOf(s) {
  return (s.commits || 0) + (s.published || 0) + (s.installs || 0) + ((s.files || []).length ? 1 : 0)
}

function commitsOn(desk, key) {
  const out = []
  for (const p of desk || []) for (const c of p.commits) if (c.key === key) out.push(Object.assign({ plugin: p.name }, c))
  return out.sort((a, b) => a.at - b.at)
}

function deskStory(g) {
  const day = sessionsOn(g.sessions, g.key)
  const commits = commitsOn(g.desk, g.key)
  const prompts = day.reduce((n, s) => n + s.prompts.length, 0)
  const outcomes = day.reduce((n, s) => n + outcomesOf(s), 0) + commits.length
  if (!day.length && !commits.length) {
    // No work yesterday: report the most recent session, labelled with its date.
    const last = (g.sessions || []).filter(s => s.prompts.length).slice(-1)[0]
    return { id: "desk", kind: "made", events: 0, outcomes: 0, quiet: true, last: last || null, sessions: [], commits: [] }
  }
  const plugins = Array.from(new Set(commits.map(c => c.plugin)))
  const headline = commits.length
    ? plural(commits.length, "commit") + (plugins.length === 1 ? " landed" : plugins.length <= 3 ? " landed in " + joinNames(plugins) : " landed across " + numberWord(plugins.length).toLowerCase() + " repos")
    : plural(prompts, "prompt") + " across " + plural(day.length, "session")
  const busiest = day.slice().sort((a, b) => b.prompts.length - a.prompts.length)[0]
  const deck = busiest
    ? "The longest session ran " + plural(busiest.prompts.length, "prompt") + (busiest.commits ? ", with " + plural(busiest.commits, "commit") + " landed." : ".")
    : "Commits only; no agent sessions on file."
  return { id: "desk", kind: "made", events: prompts, outcomes: outcomes, headline: headline, deck: deck, sessions: day, commits: commits, plugins: plugins }
}

function kickoffStory(g) {
  const goals = (g.kickoff || []).filter(n => /\d+\s*[-–]\s*\d+/.test(n.summary + " " + n.body) || /goal/i.test(n.summary))
  if (!goals.length) return null
  return {
    id: "kickoff", kind: "live", events: goals.length, followed: goals.some(n => /★|followed/i.test(n.summary + n.body)),
    headline: plural(goals.length, "goal") + " on the Kickoff wire",
    deck: "First at " + clock(goals[0].at) + ", last at " + clock(goals[goals.length - 1].at) + ".",
    goals: goals
  }
}

function pickStory(g) {
  const e = g.elevation
  if (!e) return null
  return { id: "elevation", kind: "pick", events: 1, headline: e.name, deck: e.note || e.extract.split(". ")[0] }
}

// ---- Sections --------------------------------------------------------------------

function deskSection(story, g) {
  if (story.quiet) {
    if (!story.last) return { quiet: true, headline: "No agent work on file", paragraphs: ["Neither Claude Code nor Codex has a session on record for the week."], facts: "" }
    const s = story.last
    return {
      quiet: true,
      kicker: "Agent desk · Latest dispatch, " + Model.shortDate(Model.dateKeyFromDate(new Date(s.lastAt))),
      headline: "Nothing on " + Model.weekday(g.key) + "; the last session was " + Model.weekday(Model.dateKeyFromDate(new Date(s.lastAt))),
      paragraphs: [where(s.cwd, g.home) + " you asked " + s.agent + ":"],
      quote: { text: quoteSnip(s.prompts[0].text, 220), by: "You · " + clock(s.prompts[0].at) },
      facts: plural(s.prompts.length, "prompt") + (s.commits ? " · " + plural(s.commits, "commit") : "")
    }
  }
  const main = story.sessions
    .filter(s => s.commits || s.files.length || s.published || s.installs || s.prompts.length >= 3)
    .sort((a, b) => b.prompts.length - a.prompts.length)
  const small = story.sessions.filter(s => !main.includes(s))
  const paragraphs = []
  let quote = null
  // One repo means every session ran in the same place; naming it each time is
  // noise. With several, the path is what tells them apart.
  const manyRepos = (story.plugins || []).length > 1
  for (const s of main.slice(0, 3)) {
    const did = []
    if (s.files.length) did.push("touched " + plural(s.files.length, "file"))
    if (s.commits) did.push("committed " + plural(s.commits, "time"))
    if (s.published) did.push("published " + plural(s.published, "page"))
    if (s.installs) did.push("installed or enabled " + plural(s.installs, "thing"))
    paragraphs.push("At " + clock(s.prompts[0].at) + (manyRepos ? ", " + where(s.cwd, g.home).replace(/^In/, "in") : "") + ", you asked " + s.agent + ":")
    if (!quote) quote = { text: quoteSnip(s.prompts[0].text, 200), by: "You · " + clock(s.prompts[0].at) }
    paragraphs.push("It ran to " + plural(s.prompts.length, "prompt") + " by " + clock(s.prompts[s.prompts.length - 1].at) +
      (did.length ? " and " + joinNames(did) + "." : "."))
  }
  if (main.length > 3) paragraphs.push("And " + plural(main.length - 3, "more session") + ".")
  if (small.length) {
    const n = small.reduce((sum, s) => sum + s.prompts.length, 0)
    paragraphs.push("The rest of the day was " + plural(small.length, "shorter session") +
      (n === small.length ? ", one prompt each." : " (" + plural(n, "prompt") + ")."))
  }
  const tokens = story.sessions.reduce((n, s) => n + (s.outputTokens || 0), 0)
  const models = Array.from(new Set(story.sessions.map(s => s.model).filter(Boolean)))
  return {
    kicker: "Agent desk · " + Model.weekday(g.key),
    headline: story.headline,
    deck: story.deck,
    paragraphs: paragraphs,
    quote: quote,
    commits: story.commits.map(c => ({ time: clock(c.at), plugin: c.plugin, subject: c.subject })),
    facts: plural(story.events, "prompt") + " · " + plural(story.sessions.length, "session") + (tokens ? " · " + tokens.toLocaleString("en-US") + " output tokens" : "") + (models.length ? " · " + models.join(", ") : "")
  }
}

function wireSection(g, sidebarLead) {
  const day = sessionsOn(g.sessions, g.key)
  const byAgent = {}
  for (const s of day) byAgent[s.agent] = (byAgent[s.agent] || 0) + s.prompts.length
  const stats = []
  for (const a of ["Claude Code", "Codex"]) stats.push({ label: a + " prompts, " + Model.weekday(g.key).slice(0, 3), value: String(byAgent[a] || 0) })
  for (const u of g.usage || []) {
    const weekly = u.limits.find(l => /week/i.test(l.label)) || u.limits[0]
    if (weekly) stats.push({ label: u.name + " " + String(weekly.label).toLowerCase(), value: Math.round(weekly.percent * 100) + "%", meter: Math.max(0, Math.min(100, weekly.percent * 100)) })
  }
  const total = day.reduce((n, s) => n + s.prompts.length, 0)
  const stale = (g.usage || []).filter(u => u.needsAuth).map(u => u.name)
  const briefs = []
  if (sidebarLead) briefs.push({ kicker: "Also leading", title: sidebarLead.headline, text: sidebarLead.deck || "" })
  const recent = []
  for (const p of g.desk || []) {
    const cs = p.commits.filter(c => c.key <= g.key)
    if (cs.length) recent.push({ p: p, cs: cs })
  }
  const newest = cs => cs.reduce((m, c) => Math.max(m, c.at), 0)
  recent.sort((a, b) => newest(b.cs) - newest(a.cs))
  for (const r of recent.slice(0, 3)) {
    const latest = r.cs.reduce((m, c) => c.at > m.at ? c : m, r.cs[0])
    briefs.push({ kicker: briefs.length ? "" : "Repo desk", title: (recent.length === 1 ? "" : r.p.name + ": ") + plural(r.cs.length, "commit"), text: "Latest: “" + quoteSnip(latest.subject, 90) + "”, " + Model.shortDate(latest.key) + "." })
  }
  if (g.carrel && g.carrel.total) {
    const l = g.carrel.lists
    briefs.push({ kicker: "", title: "Carrel holds " + plural(g.carrel.total, "card"), text: (l.inbox || []).length + " in the inbox, " + (l.next || []).length + " next, " + (l.waiting || []).length + " waiting." })
  }
  return {
    kicker: "The meter",
    title: total ? plural(total, "prompt") + " typed" : "Agents took the day off",
    stats: stats,
    note: stale.length ? joinNames(stale) + " last reported from an expired sign-in, so those meters show the last known reading." : "",
    briefs: briefs
  }
}

// The masthead's corner speaks for the day you read the paper: an umbrella
// when rain is due today.
function earFor(w, key, yesterday) {
  const today = Model.weatherDay(w.raw, Model.shiftDateKey(key, 1))
  const d = today || yesterday
  const label = Model.condition(d.code).label
  return { icon: Model.earIcon(d), text: (w.place ? w.place + " " : "") + (today ? "today " : "") + Model.tempText(d.max, w.imperial) + " " + label }
}

function weatherSection(g) {
  const w = g.weather
  if (!w || !w.raw) return { missing: "No forecast: Open-Meteo didn't answer, and no place is set." }
  const day = Model.weatherDay(w.raw, g.key)
  if (!day) return { missing: "The forecast on file doesn't reach back to " + Model.weekday(g.key) + "." }
  const c = Model.condition(day.code)
  const outlook = []
  for (let i = 1; i <= 2; i++) {
    const d = Model.weatherDay(w.raw, Model.shiftDateKey(g.key, i))
    if (d) outlook.push({ day: Model.weekday(d.date).slice(0, 3), text: Model.condition(d.code).label + (d.precip >= 0.2 ? ", " + Model.precipText(d.precip, w.imperial) : ""), temps: Model.tempText(d.max, w.imperial) + " / " + Model.tempText(d.min, w.imperial) })
  }
  const temps = day.hours.map(t => Model.tempValue(t, w.imperial))
  return {
    place: w.place,
    source: w.source,
    headline: Model.weatherHeadline(day),
    high: Model.tempText(day.max, w.imperial),
    low: Model.tempText(day.min, w.imperial),
    label: c.label,
    temps: temps,
    rows: [
      { label: "Rain", value: Model.precipText(day.precip, w.imperial) },
      { label: "Wind, peak", value: day.windMax ? Model.windText(day.windMax, w.imperial) : "—" },
      { label: "Sunrise · sunset", value: Model.clockText(day.sunrise) + " · " + Model.clockText(day.sunset) }
    ],
    outlook: outlook,
    day: day,
    ear: earFor(w, g.key, day),
    meanwhile: (w.places || []).filter(p => p.current).map(p => Model.meanwhileLine(p.name, p.current, w.imperial))
  }
}

function weekSection(g) {
  const days = []
  let busiest = null
  for (let i = 6; i >= 0; i--) {
    const k = Model.shiftDateKey(g.key, -i)
    const n = (g.sessions || []).reduce((sum, s) => sum + s.prompts.filter(p => p.key === k).length, 0)
    const d = { key: k, label: Model.weekday(k).slice(0, 2), date: Number(k.slice(8, 10)), count: n }
    if (n && (!busiest || n > busiest.count)) busiest = d
    days.push(d)
  }
  const total = days.reduce((n, d) => n + d.count, 0)
  const ids = new Set()
  for (const s of g.sessions || []) if (s.prompts.some(p => p.key >= days[0].key && p.key <= g.key)) ids.add(s.agent + s.id)
  const active = days.filter(d => d.count).length
  return {
    headline: total ? (active === 1 ? "One day of work in seven" : active + " working days in seven") : "A quiet week",
    days: days,
    rows: [
      { label: "Prompts typed", value: String(total) },
      { label: "Sessions", value: String(ids.size) },
      { label: "Busiest day", value: busiest ? Model.shortDate(busiest.key) : "—" }
    ]
  }
}

function backPage(g, picks) {
  const words = []
  if (picks.elevation) words.push({ word: surname(picks.elevation.architect), clue: "Drew " + picks.elevation.name })
  if (picks.easel && picks.easel.artist) words.push({ word: surname(picks.easel.artist), clue: "Made " + (picks.easel.title || "the day's picture") })
  if (picks.munger) words.push({ word: "MUNGER", clue: "He blinks on your bar" })
  for (const p of g.desk || []) if (p.commits.some(c => c.key === g.key)) words.push({ word: p.name, clue: "Took a commit on " + Model.weekday(g.key) })
  if (picks.elevation) words.push({ word: picks.elevation.place.split(",")[0], clue: "Where the building stands" })
  const jumble = Model.jumble(words, Model.dayNumber(g.key), 4)
  const keybind = Model.keybindOfDay(g.almanac ? g.almanac.bindings : [], Model.dayNumber(g.key))
  const rows = []
  rows.push({ label: "Theme", value: g.theme.theme })
  if (g.theme.wallpaper) rows.push({ label: "Wallpaper", value: g.theme.wallpaper })
  if (g.almanac && isFinite(g.almanac.diskFree)) rows.push({ label: "Disk free", value: bytesText(g.almanac.diskFree) + " of " + bytesText(g.almanac.diskSize) })
  if (g.almanac && g.almanac.bindings.length) rows.push({ label: "Keybindings to learn", value: String(g.almanac.bindings.length) })
  return { jumble: jumble, keybind: keybind, almanac: rows, classifieds: g.looseEnds || [] }
}

function magazine(g) {
  if (!Model.isWeekendEdition(g.key)) return null
  // With one repo, prefixing every commit with its name is the same word 17
  // times; the commit subject is the story.
  const oneRepo = (g.desk || []).length === 1
  const days = []
  for (let i = 6; i >= 0; i--) {
    const k = Model.shiftDateKey(g.key, -i)
    const s = sessionsOn(g.sessions, k)
    const commits = commitsOn(g.desk, k)
    const pick = (g.week || {})[k] || {}
    days.push({
      key: k, day: Model.shortDate(k),
      prompts: s.reduce((n, x) => n + x.prompts.length, 0),
      commits: commits.map(c => (oneRepo ? "" : c.plugin + ": ") + c.subject),
      building: pick.elevation ? pick.elevation.name + " · " + pick.elevation.architect : "",
      quote: pick.munger ? pick.munger.text : "",
      art: pick.easel && pick.easel.title ? pick.easel.title + (pick.easel.artist ? " · " + pick.easel.artist : "") : ""
    })
  }
  const goals = (g.kickoffWeek || []).map(n => ({ when: Model.shortDate(n.key) + " " + clock(n.at), text: (n.summary + (n.body ? " · " + n.body : "")).trim() }))
  return { days: days, goals: goals }
}

// The Pro preview: a free paper carries one standing feature for the desks it
// can't yet print. No sample inbox, no live dot, no fake status; it describes
// what each desk would print and keeps the CTA inactive until the key desk opens.
function proSection(g) {
  if (g.proInstalled) return null
  return {
    installed: false,
    kicker: "Inkwell Pro",
    headline: "Your other desks, set in type",
    deck: "Gmail, Slack, Notion, Google Calendar and Basecamp, read through your own connection and set beside your agent work. Read-only; nothing is posted.",
    cta: "Open the desks with Pro",
    note: "The key desk opens soon. A key for Inkwell Pro adds all five desks.",
    status: "Coming soon",
    desks: [
      { persona: "The Mail Bag", product: "Gmail", line: "The day's mail, sorted: who is waiting on you, and what can wait." },
      { persona: "The City Desk", product: "Slack", line: "The channels you choose, set as the day's threads." },
      { persona: "The Notebook", product: "Notion", line: "The pages that changed, and the one line that matters." },
      { persona: "The Day Book", product: "Google Calendar", line: "The day ahead, set beside the weather." },
      { persona: "The Project Desk", product: "Basecamp", line: "What moved on each project, and what is due." }
    ]
  }
}

// What the plugin sources add to the classifieds. Their meter rows stay off
// the wire: a desk's numbers belong in the desk's own slot, not in a pile.
function withClassifieds(back, extras) {
  if (extras && extras.classifieds && extras.classifieds.length) back.classifieds = back.classifieds.concat(extras.classifieds)
  return back
}

// ---- The edition ------------------------------------------------------------------------

function compose(g) {
  // The cover is dated the morning it is read; the content is the day before.
  // Older callers pass only `key`, in which case both are the same day.
  const editionKey = g.editionKey || g.key
  // A "weekend edition" is the one built on Sunday morning, so it is decided
  // by the content day (Saturday), not the cover date.
  const weekend = Model.isWeekendEdition(g.key)
  const desk = deskStory(g)
  const kick = kickoffStory(g)
  const pick = pickStory(g)
  const placed = Model.placeStories([desk, kick, pick].filter(Boolean), desk)
  const prose = g.prose || {}
  const wx = weatherSection(g)

  let lead
  const L = placed.lead || pick
  if (L && L.id === "desk") {
    const ds = deskSection(desk, g)
    lead = { kind: "desk", kicker: ds.kicker, headline: prose.leadHeadline || ds.headline, deck: prose.leadDeck || ds.deck, paragraphs: prose.deskSummary ? [prose.deskSummary] : ds.paragraphs, quote: ds.quote, commits: ds.commits, facts: ds.facts, byline: "From the agent logs and git" }
  } else if (L && L.id === "kickoff") {
    lead = { kind: "kickoff", kicker: "Kickoff · the wire", headline: prose.leadHeadline || L.headline, deck: prose.leadDeck || L.deck, byline: "From Kickoff's goal toasts", log: L.goals.map(n => ({ time: clock(n.at), text: n.summary, detail: n.body })) }
  } else if (L) {
    const e = g.elevation
    const sentences = e && e.extract ? e.extract.split(/(?<=\.)\s+/) : []
    lead = { kind: "pick", kicker: "Elevation · a quiet day's lead", headline: L.headline, deck: L.deck, byline: "Nothing else happened, so the building leads", paragraphs: sentences.length ? [sentences.slice(0, 3).join(" "), sentences.slice(3, 6).join(" ")].filter(Boolean) : [], facts: e ? e.architect + " · " + e.year + " · " + e.place : "" }
  } else {
    lead = { kind: "none", kicker: "", headline: "A quiet " + Model.weekday(g.key), deck: "Nothing in the agent logs or git." }
  }

  lead.portrait = g.portrait || null

  const deskBlock = placed.desk ? deskSection(desk, g) : null
  if (deskBlock && !deskBlock.quiet) {
    if (prose.deskHeadline) deskBlock.headline = prose.deskHeadline
    if (prose.deskDeck) deskBlock.deck = prose.deskDeck
    if (prose.deskSummary) deskBlock.paragraphs = [prose.deskSummary]
  }

  const picks = { elevation: g.elevation, easel: g.easel, munger: g.munger, easelInstalled: g.easelInstalled !== false }
  const corrections = []
  if (g.previous && g.previous.forecastTomorrow && wx.day)
    for (const c of Model.corrections(g.previous.forecastTomorrow, wx.day, g.weather.imperial)) corrections.push(c)
  if (g.elevation && g.elevation.problem) corrections.push(g.elevation.problem + " This edition uses the photo from Wikimedia instead.")

  const index = g.index || []
  const prev = index.find(e => e.date < editionKey) || null
  const next = index.slice().reverse().find(e => e.date > editionKey) || null
  const yearAgoKey = (Number(editionKey.slice(0, 4)) - 1) + editionKey.slice(4)
  const yearAgo = index.find(e => e.date === yearAgoKey) || null
  const count = index.filter(e => e.date !== editionKey).length + 1
  const run = Model.streak(index.concat([{ date: editionKey }]), editionKey)
  const habit = Model.habit((g.reads && g.reads.days) || {}, editionKey)
  const perks = Themes.perks(habit.total, (g.theme && g.theme.chosen) || "auto")
  const models = Model.modelDesk(g.modelUsage || [], g.prices || {}, g.key)

  return {
    key: g.key,
    editionKey: editionKey,
    integrations: Array.isArray(g.integrations && g.integrations.integrations) ? g.integrations.integrations.length : 0,
    wires: Array.isArray(g.integrations && g.integrations.integrations)
      ? g.integrations.integrations.filter(i => i.connected).map(i => Object.assign({}, i, {
        isNew: !!(g.wireState && g.wireState[i.slug] && g.wireState[i.slug].isNew)
      }))
      : [],
    sections: Array.isArray(g.sections && g.sections.sections) ? g.sections.sections : [],
    weekend: weekend,
    title: Model.mastheadTitle(g.reader.name, weekend),
    name: g.reader.name,
    editionNo: Model.editionNumber(editionKey),
    longDate: Model.longDate(editionKey),
    delivered: "Reporting " + Model.longDate(g.key).replace(/, \d{4}$/, ""),
    press: numberWord((g.desk || []).length) + " repos on the press",
    theme: g.theme,
    font: Fonts.get(g.font),
    paperStyle: g.paperStyle,
    wallpaper: g.wallpaperImage || "",
    ear: wx.ear || { icon: "cloud", text: "" },
    lead: lead,
    wire: wireSection(g, placed.sidebarLead),
    // What the share card may say: counts only, never a prompt or a message.
    share: {
      prompts: sessionsOn(g.sessions, g.key).reduce((n, x) => n + x.prompts.length, 0),
      commits: commitsOn(g.desk, g.key).length
    },
    pace: Pace.pace({ prompts: sessionsOn(g.sessions, g.key).flatMap(x => x.prompts.map(p => p.at)), commits: commitsOn(g.desk, g.key).map(c => c.at) }),
    desk: deskBlock,
    pro: proSection(g),
    picks: picks,
    weather: wx,
    tomorrow: { elevation: g.elevationTomorrow, easel: g.easelTomorrow, munger: g.mungerTomorrow, day: Model.weekday(Model.shiftDateKey(g.key, 1)) },
    week: weekSection(g),
    trend: g.trend || Trend.compute(g.sessions, g.modelUsage, g.key, 14),
    habit: Object.assign({}, habit, { headline: Model.habitLine(habit) }),
    perks: perks,
    models: models,
    magazine: magazine(g),
    corrections: corrections,
    back: withClassifieds(backPage(g, picks), g.extras),
    issues: { prev: prev, next: next, yearAgo: yearAgo, total: count },
    streak: Model.streakLine(count, run),
    extras: { sections: (g.extras && g.extras.sections) || [] },
    desks: (g.extras && g.extras.desks) || [],
    late: g.late || null,
    proseUsed: Object.keys(prose).length > 0,
    minutes: g.minutes || 1
  }
}

// Every fact the paper prints, as plain text, for checking Claude's prose
// against and for the prompt that asks for it.
function factsText(ed) {
  const bits = [ed.longDate, ed.lead.headline, ed.lead.deck].concat(ed.lead.paragraphs || [], (ed.lead.commits || []).map(c => c.time + " " + c.plugin + " " + c.subject))
  if (ed.lead.facts) bits.push(ed.lead.facts)
  if (ed.lead.quote && ed.lead.quote.text) bits.push(ed.lead.quote.text)
  if (ed.desk) bits.push(ed.desk.headline, ed.desk.deck || "", ed.desk.facts || "", ...(ed.desk.paragraphs || []), ...((ed.desk.commits || []).map(c => c.time + " " + c.plugin + " " + c.subject)))
  if (ed.desk && ed.desk.quote && ed.desk.quote.text) bits.push(ed.desk.quote.text)
  if (ed.lead.log) for (const l of ed.lead.log) bits.push(l.time + " " + l.text + " " + (l.detail || ""))
  for (const s of (ed.extras && ed.extras.sections) || []) bits.push(s.headline, s.deck, ...s.items.map(i => (i.time + " " + i.title + " " + i.detail).trim()))
  return bits.filter(Boolean).join("\n")
}

function prosePrompt(ed) {
  return [
    "You are the sub-editor of a one-reader morning newspaper about yesterday on their computer.",
    "Rewrite only these headline slots, plainly and in the past tense, stating what happened. Do not add any fact, name or number that is not in FACTS. Keep numbers exactly as written.",
    "Reply with one JSON object and nothing else, with any of these string keys: " + Model.PROSE_SLOTS.join(", ") + ".",
    "leadHeadline and deskHeadline: at most 12 words. leadDeck and deskDeck: one sentence. deskSummary: at most 120 words summarising the agent work as a short news story.",
    "",
    "FACTS",
    factsText(ed)
  ].join("\n")
}

module.exports = { compose, factsText, prosePrompt, deskStory, kickoffStory, sessionsOn, quoteSnip, surname, clock }
