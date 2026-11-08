#!/usr/bin/env node
// Inkwell Daily: a morning newspaper about yesterday's agent work and commits.
// The command list lives in ../lib/usage.js, so the bundled standalone build
// never has to read its own executable to print help.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { execFileSync } = require("node:child_process")

const Model = require("../Model.js")
const P = require("../lib/platform.js")
const C = require("../lib/collect.js")
const { compose, factsText, prosePrompt, clock } = require("../lib/compose.js")
const { STYLES, renderEdition, renderIndex, restyle, styleTokens, plainText } = require("../lib/render.js")
const { webCopy, fileChanges } = require("../lib/web.js")
const { LINK_MAX, CACHE_JSON_MAX } = require("../lib/fetch.js")
const { privately } = require("../lib/private.js")
const S = require("../lib/sources.js")
const PR = require("../lib/prices.js")
const Themes = require("../lib/themes.js")
const Fonts = require("../lib/fonts.js")
const Trend = require("../lib/trend.js")
const Portrait = require("../lib/portrait.js")
const Inspiration = require("../lib/inspiration.js")
const { USAGE } = require("../lib/usage.js")

// A Node SEA executable runs this file from inside the binary: there is no
// script path to give launchd or Task Scheduler, so the scheduler calls the
// executable directly.
const STANDALONE = (() => {
  try { return require("node:sea").isSea() } catch (e) { return false }
})()

const DATA = P.dataDir()
const ED_DIR = path.join(DATA, "editions")
const INDEX_FILE = path.join(DATA, "editions.json")
const READ_FILE = path.join(DATA, "read")
const READS_FILE = path.join(DATA, "reads.json")

function usage() {
  process.stdout.write(USAGE)
}

function flags(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--date" || a === "--out" || a === "--prose-file" || a === "--hour" || a === "--days" || a === "--theme" || a === "--font" || a === "--look") out[a.slice(2)] = argv[++i] || ""
    else if (a.startsWith("--")) out[a.slice(2)] = true
    else out._.push(a)
  }
  return out
}

function readJson(file) {
  try {
    if (fs.statSync(file).size > CACHE_JSON_MAX) return null
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) { return null }
}

function writeAtomic(file, text) {
  const tmp = file + ".tmp-" + process.pid
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

function loadIndex() {
  return Model.parseIndex(fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, "utf8") : "")
}

function yesterday() { return Model.shiftDateKey(Model.dateKeyFromDate(new Date()), -1) }

function openPath(target) {
  const argv = P.openCommand(target)
  if (!P.spawnDetached(argv)) process.stderr.write("Couldn't open " + target + "\n")
}

// ---- build ------------------------------------------------------------------------

function gather(key, opt, cfg) {
  const net = !opt.offline
  const from = Model.shiftDateKey(key, -6)
  const sessions = C.claudeSessions(from, key).concat(C.codexSessions(from, key)).sort((a, b) => a.firstAt - b.firstAt)
  const desk = C.repoDesk(Model.isWeekendEdition(key) ? from : Model.shiftDateKey(key, -2), key, sessions, cfg.repos)
    .filter(p => p.commits.length || p.dirty)
  const monthStart = key.slice(0, 8) + "01"
  const usage = C.claudeUsage(monthStart, key).concat(C.codexUsage(monthStart, key), C.opencodeUsage(monthStart, key))
  const trendFrom = Model.shiftDateKey(key, -13)
  const trendSessions = C.claudeSessions(trendFrom, key).concat(C.codexSessions(trendFrom, key))
  const trendUsage = C.claudeUsage(trendFrom, key).concat(C.codexUsage(trendFrom, key), C.opencodeUsage(trendFrom, key))
  const reads = loadReads()
  const theme = C.desktop()
  const chosen = Themes.resolve(cfg.theme, unlockMornings(Model.readTotal(reads.days, key), cfg), theme.palette)
  if (chosen.id !== "auto") {
    theme.palette = chosen.palette
    theme.theme = chosen.name
  }
  theme.chosen = chosen.id
  theme.locked = chosen.locked
  return {
    key: key,
    home: P.home(),
    reader: C.reader(),
    theme: theme,
    font: cfg.font,
    paperStyle: cfg.style,
    wallpaperImage: theme.wallpaperPath ? C.imageData(theme.wallpaperPath, 1920, 70) : "",
    kickoff: [], kickoffWeek: [],
    elevation: null, elevationTomorrow: null, easel: null, easelInstalled: false, easelTomorrow: null, munger: null, mungerTomorrow: null,
    sessions: sessions,
    usage: [],
    desk: desk,
    carrel: null,
    weather: C.weather(key, net, cfg),
    almanac: C.almanac(),
    looseEnds: C.looseEnds(desk),
    reads: reads,
    modelUsage: usage,
    prices: usage.length ? PR.load(DATA, net) : {},
    trend: Trend.compute(trendSessions, trendUsage, key, 14),
    week: {},
    proInstalled: false
  }
}

// Never through a shell, and never without a time limit. Run from the
// paper's own folder so the agent desk doesn't report it.
function askClaude(prompt, cwd) {
  const cmd = Model.proseCommand()
  try {
    return execFileSync(cmd[0], cmd.slice(1), { cwd: cwd, input: prompt, encoding: "utf8", timeout: Model.PROSE_TIMEOUT_MS, killSignal: "SIGKILL", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 256 << 10, windowsHide: true })
  } catch (e) {
    return ""
  }
}

// Mornings that count toward unlocking themes. Developer Pro unlocks them
// all, so every theme can be tried; the perks ledger still shows real reads.
function unlockMornings(real, cfg) {
  return cfg.developer && cfg.developer.pro ? Math.max(real, Themes.THEMES.reduce((m, t) => Math.max(m, t.at), 0)) : real
}

// Yesterday's prompts and commits, for the portrait's mood.
function dayCounts(g, key) {
  return {
    prompts: g.sessions.reduce((n, s) => n + s.prompts.filter(p => p.key === key).length, 0),
    commits: g.desk.reduce((n, p) => n + p.commits.length, 0)
  }
}

// `portrait good|bad [date]` records a verdict on that edition's picture;
// `portrait test` runs the generator once; plain `portrait` prints how each
// provider has done.
async function portraitCommand(opt, cfg) {
  const dir = Portrait.folder(DATA)
  const verdict = opt._[0]
  if (verdict === "test") {
    privately(DATA)
    const pic = await Inspiration.picture(opt._[1] || yesterday(), Inspiration.settings(cfg).generator)
    let r = { ok: false, error: "Choose Recraft as the image service and add its key first." }
    if (pic && pic.problem) r = { ok: false, error: pic.problem }
    else if (pic) {
      const m = /^data:image\/(\w+);base64,(.*)$/.exec(pic.image)
      const file = path.join(DATA, "portrait-test." + (m[1] === "jpeg" ? "jpg" : m[1]))
      writeAtomic(file, Buffer.from(m[2], "base64"))
      r = { ok: true, path: file, photo: pic.scene, quote: pic.quote, provider: pic.provider }
    }
    process.stdout.write(JSON.stringify(r) + "\n")
    if (!r.ok) { process.stderr.write(r.error + "\n"); process.exit(1) }
    return
  }
  if (!verdict) {
    const s = Portrait.summary(Portrait.readRatings(dir))
    process.stdout.write(JSON.stringify({ folder: dir, photos: Portrait.listPhotos(dir).length, providers: s.providers, ratedPhotos: s.photos }, null, 2) + "\n")
    return
  }
  const key = opt._[1] || yesterday()
  if (!Portrait.VERDICTS.includes(verdict) || !Model.parseDateKey(key)) { process.stderr.write("inkwell-daily: portrait good|bad [YYYY-MM-DD]\n"); process.exit(2) }
  const side = readJson(path.join(ED_DIR, key + ".json")) || {}
  if (!side.portrait) { process.stderr.write("inkwell-daily: the " + key + " edition has no picture\n"); process.exit(1) }
  Portrait.recordRating(dir, { date: key, verdict: verdict, provider: side.portrait.provider, photo: side.portrait.photo })
  process.stdout.write("Noted: " + verdict + " for " + key + " (" + side.portrait.provider + ", " + side.portrait.photo + ")\n")
}

async function build(opt, cfg) {
  const key = opt.date || yesterday()
  if (!Model.parseDateKey(key)) { process.stderr.write("inkwell-daily: bad --date " + key + "\n"); process.exit(2) }
  const outDir = opt.out || DATA
  const edDir = path.join(outDir, "editions")
  privately(outDir)
  fs.mkdirSync(edDir, { recursive: true })

  const indexFile = path.join(outDir, "editions.json")
  const index = Model.parseIndex(fs.existsSync(indexFile) ? fs.readFileSync(indexFile, "utf8") : "")
  const g = gather(key, opt, cfg)
  const log = m => process.stderr.write("inkwell-daily: " + m + "\n")
  const sources = S.loadPlugins(cfg, DATA, log)
  g.proInstalled = S.hasPro(sources) || !!(cfg.developer && cfg.developer.pro)
  g.extras = await S.collectAll(sources, { key: key, from: Model.shiftDateKey(key, -6), to: key, net: !opt.offline, dataDir: DATA }, cfg)
  g.index = index
  g.previous = readJson(path.join(edDir, Model.shiftDateKey(key, -1) + ".json"))

  let ed = compose(g)
  if (opt["print-prompt"]) { process.stdout.write(prosePrompt(ed) + "\n"); return null }

  const facts = factsText(ed)
  let proseRaw = ""
  if (opt["prose-file"]) proseRaw = fs.readFileSync(opt["prose-file"], "utf8")
  else if (opt.prose || cfg.prose) proseRaw = askClaude(prosePrompt(ed), outDir)
  if (proseRaw) {
    g.prose = Model.cleanProse(proseRaw, facts)
    ed = compose(g)
  }

  // The headshot portrait is parked; the front page carries the day's
  // picture and quote instead.
  const heads = Inspiration.settings(cfg)
  g.portrait = g.proInstalled && heads.enabled ? await Inspiration.picture(key, heads.generator) : null
  if (g.portrait && g.portrait.problem) { log("picture: " + g.portrait.problem + " The front page goes without one."); g.portrait = null }

  const sideFile = path.join(edDir, key + ".json")
  const side = readJson(sideFile) || {}
  const hash = crypto.createHash("sha1").update(facts).digest("hex").slice(0, 16)
  const now = Date.now()
  let late = side.late || null
  if (side.hash && side.hash !== hash) late = { at: now, time: clock(now) }
  g.late = late

  ed = compose(g)
  let html = renderEdition(ed)
  g.minutes = Model.readingMinutes(Model.countWords(plainText(html)))
  ed = compose(g)
  html = renderEdition(ed)

  const file = path.join(edDir, key + ".html")
  writeAtomic(file, html)
  const wx = g.weather && g.weather.raw ? Model.weatherDay(g.weather.raw, Model.shiftDateKey(key, 1)) : null
  writeAtomic(sideFile, JSON.stringify({
    date: key, firstBuiltAt: side.firstBuiltAt || now, builtAt: now, hash: hash, late: late,
    forecastTomorrow: wx ? { max: wx.max, min: wx.min, precip: wx.precip, code: wx.code } : null,
    headline: ed.lead.headline, prose: g.prose || null,
    portrait: g.portrait ? { provider: g.portrait.provider, photo: g.portrait.scene, quote: g.portrait.quote } : null
  }, null, 2) + "\n")

  const entry = { date: key, title: ed.title, headline: ed.lead.headline, kicker: ed.lead.kicker, deck: ed.lead.deck || "", minutes: g.minutes, weekend: ed.weekend, late: !!late, builtAt: now, path: file }
  const list = index.filter(e => e.date !== key).concat([entry]).sort((a, b) => a.date < b.date ? 1 : -1)
  writeAtomic(indexFile, JSON.stringify({ version: 1, editions: list }, null, 2) + "\n")
  writeAtomic(path.join(edDir, "index.html"), renderIndex(list, g.theme.palette, g.reader.name, Fonts.get(g.font)))
  writeAtomic(path.join(outDir, "latest.html"), "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0; url=editions/" + list[0].date + ".html\"><title>" + Model.APP_NAME + "</title>\n")

  const result = { date: key, path: file, headline: entry.headline, minutes: entry.minutes, late: !!late, prose: !!g.prose }
  process.stdout.write(JSON.stringify(result) + "\n")
  return result
}

// ---- publish -----------------------------------------------------------------------

function readLink(file) {
  let fd
  try {
    fd = fs.openSync(file, "r")
    const buf = Buffer.alloc(LINK_MAX)
    return buf.toString("utf8", 0, fs.readSync(fd, buf, 0, LINK_MAX, 0)).trim()
  } catch (e) {
    return ""
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }

function runCapture(argv, cwd) {
  try {
    return { ok: true, out: execFileSync(argv[0], argv.slice(1), { cwd: cwd, encoding: "utf8", timeout: 60000, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 20, windowsHide: true }) }
  } catch (e) {
    return { ok: false, out: (String(e.stdout || "") + String(e.stderr || "")).slice(-8192) }
  }
}

// Claude Code's permission rules spell an absolute path with a leading
// double slash, and on Windows as //c/Users/… with forward slashes.
function rulePath(dir) {
  if (process.platform === "win32") return String(dir).replace(/^([A-Za-z]):/, (m, d) => "/" + d.toLowerCase()).replace(/\\/g, "/")
  return dir
}

function publish(opt) {
  const fail = message => { process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n"); process.exitCode = 1; return null }
  const webDir = path.join(DATA, "web")
  const stateFile = path.join(webDir, "state.json")
  const linkFile = path.join(webDir, "link.txt")
  privately(DATA)

  const index = loadIndex()
  const entry = opt.date ? index.find(e => e.date === opt.date) : index[0]
  if (!entry) return fail("No edition to publish yet.")

  const copy = webCopy(fs.readFileSync(path.join(ED_DIR, entry.date + ".html"), "utf8"))
  const state = readJson(stateFile) || {}
  fs.rmSync(path.join(webDir, "img"), { recursive: true, force: true })
  fs.mkdirSync(path.join(webDir, "img"), { recursive: true })
  for (const im of copy.images) fs.writeFileSync(path.join(webDir, im.path), im.data)
  fs.writeFileSync(path.join(webDir, "index.html"), copy.html)
  fs.rmSync(linkFile, { force: true })

  const files = copy.images.map(im => im.path)
  const changes = fileChanges(state.files, files)
  const cmd = Model.publishCommand(rulePath(webDir), Model.publishPrompt({ url: Model.artifactUrl(state.url), files: changes.keep, remove: changes.remove }))
  if (opt["dry-run"]) { process.stdout.write(JSON.stringify({ ok: true, dryRun: true, date: entry.date, command: cmd }, null, 2) + "\n"); return null }

  const started = runCapture(cmd, DATA)
  if (/not trusted/i.test(started.out)) return fail("Claude Code doesn't trust " + DATA + " yet. Run claude there once and accept.")
  const id = (started.out.match(/claude stop ([0-9a-f]{6,})/) || [])[1]
  if (!id) return fail("Claude Code didn't start: " + started.out.trim().split("\n").pop())

  let answer = ""
  const deadline = Date.now() + Model.PUBLISH_TIMEOUT_MS
  while (Date.now() < deadline) {
    answer = readLink(linkFile)
    if (answer) break
    sleep(3000)
  }
  runCapture(["claude", "stop", id], DATA)
  runCapture(["claude", "rm", id], DATA)

  const link = Model.artifactUrl(answer)
  if (!link) return fail(answer ? answer.split("\n")[0].slice(0, 200) : "Claude didn't hand back a link in time.")
  fs.writeFileSync(stateFile, JSON.stringify({ url: link, date: entry.date, files: files, publishedAt: Date.now() }, null, 2) + "\n")
  process.stdout.write(JSON.stringify({ ok: true, date: entry.date, url: link }) + "\n")
  return link
}

// ---- the morning run ----------------------------------------------------------------

// Run by the scheduler at the hour, on wake and at logon. It sets yesterday's
// edition once, then stays quiet until tomorrow.
async function morning(cfg) {
  const key = yesterday()
  const now = new Date()
  if (now.getHours() < cfg.hour) return
  if (loadIndex().some(e => e.date === key)) return
  const r = await build({}, cfg)
  if (!r) return
  if (cfg.notify) {
    const t = P.toastCommand("Your paper is here", r.headline + " · " + Model.readingLine(r.minutes))
    P.spawnDetached(t.argv, t.env)
  }
  if (cfg.web) publish({})
}

// The ledger of mornings the paper was opened. Older builds kept only the last
// edition read, so the first run seeds today from that marker's own timestamp.
function loadReads() {
  const ledger = Model.parseReads(fs.existsSync(READS_FILE) ? fs.readFileSync(READS_FILE, "utf8") : "")
  if (!Object.keys(ledger.days).length) {
    try {
      const key = fs.readFileSync(READ_FILE, "utf8").trim()
      const at = Math.round(fs.statSync(READ_FILE).mtimeMs)
      if (Model.parseDateKey(key)) ledger.days[Model.dateKeyFromDate(new Date(at))] = at
    } catch (e) {}
  }
  return ledger
}

function status() {
  const index = loadIndex()
  const latest = index[0] || null
  let read = ""
  try { read = fs.readFileSync(READ_FILE, "utf8").trim() } catch (e) {}
  const ledger = loadReads()
  const today = Model.dateKeyFromDate(new Date())
  const web = readJson(path.join(DATA, "web", "state.json")) || {}
  process.stdout.write(JSON.stringify({
    latest: latest ? latest.date : "", headline: latest ? latest.headline : "", unread: !!latest && read < latest.date,
    editions: index.length, readDays: Object.keys(ledger.days).length, run: Model.readRun(ledger.days, today),
    checkedToday: !!ledger.days[today], web: Model.artifactUrl(web.url) || "", data: DATA
  }) + "\n")
}

function markRead(key) {
  try { privately(DATA); fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(READ_FILE, key + "\n") } catch (e) {}
  try {
    const ledger = loadReads()
    const now = new Date()
    const day = Model.dateKeyFromDate(now)
    const fresh = !ledger.days[day]
    if (fresh) ledger.days[day] = now.getTime()
    if (fresh || !fs.existsSync(READS_FILE)) writeAtomic(READS_FILE, JSON.stringify(ledger, null, 2) + "\n")
  } catch (e) {}
}

// ---- perks -----------------------------------------------------------------------------

// `theme` with no id lists the milestone themes and where the next one sits.
// With an id, it sets the paper's theme if the habit has earned it.
// `restyle [--date D]`: the newest (or that) edition, and the bound volume,
// in today's theme and font, in place. Settings calls it after a theme or
// font change, so the paper changes at once instead of after a full build.
// `restyle --preview --theme T --font F` writes nothing: it only answers
// with the tokens, so the Paper window can show a theme before it's applied.
function restyleCommand(opt, cfg) {
  if (opt.preview) {
    const theme = C.desktop()
    const reads = Model.readTotal(loadReads().days, Model.dateKeyFromDate(new Date()))
    const chosen = Themes.resolve(opt.theme || cfg.theme, unlockMornings(reads, cfg), theme.palette)
    const look = opt.look || cfg.style
    process.stdout.write(JSON.stringify({ theme: chosen.id, font: Fonts.get(opt.font || cfg.font).id, look: look || "table", style: styleTokens(chosen.palette || theme.palette, opt.font || cfg.font, look) }) + "\n")
    return
  }
  const index = loadIndex()
  const key = opt.date || (index[0] && index[0].date)
  const file = key && path.join(ED_DIR, key + ".html")
  let html = ""
  try { html = fs.readFileSync(file, "utf8") } catch (e) {}
  if (!html) { process.stderr.write("inkwell-daily: no edition to restyle\n"); process.exit(1) }
  const theme = C.desktop()
  const chosen = Themes.resolve(cfg.theme, unlockMornings(Model.readTotal(loadReads().days, key), cfg), theme.palette)
  const out = restyle(html, chosen.palette || theme.palette, cfg.font, cfg.style)
  if (!out) { process.stderr.write("inkwell-daily: that edition is too old to restyle; build it again\n"); process.exit(1) }
  writeAtomic(file, out)
  writeAtomic(path.join(ED_DIR, "index.html"), renderIndex(index, chosen.palette || theme.palette, C.reader().name, Fonts.get(cfg.font)))
  // The tokens let an open Paper window take the change without reloading.
  process.stdout.write(JSON.stringify({ date: key, path: file, theme: chosen.id, font: cfg.font, look: cfg.style || "table", style: styleTokens(chosen.palette || theme.palette, cfg.font, cfg.style) }) + "\n")
}

function themeCommand(opt, cfg) {
  const ledger = loadReads()
  const today = Model.dateKeyFromDate(new Date())
  const mornings = unlockMornings(Model.readTotal(ledger.days, today), cfg)
  const picked = Themes.resolve(cfg.theme, mornings, null)
  const want = opt._[0]
  if (want) {
    const t = Themes.byId(want)
    if (!t) {
      process.stderr.write('No theme "' + want + '". Try: ' + Themes.THEMES.map(x => x.id).join(", ") + "\n")
      process.exit(2)
    }
    if (t.at > mornings) {
      process.stderr.write(t.name + " unlocks at " + t.at + " mornings; you're at " + mornings + ". Keep opening the paper.\n")
      process.exit(2)
    }
    const file = P.configFile()
    const saved = readJson(file) || {}
    privately(DATA)
    fs.mkdirSync(DATA, { recursive: true })
    writeAtomic(file, JSON.stringify(Object.assign({}, P.DEFAULTS, saved, { theme: t.id }), null, 2) + "\n")
    process.stdout.write("Theme set to " + t.name + ". The next edition will use it.\n")
    return
  }
  const p = Themes.perks(mornings, picked.id)
  const list = [{ id: "auto", name: "Auto", at: 0, unlocked: true, active: picked.id === "auto", remaining: 0 }].concat(p.themes)
  if (opt.json) {
    process.stdout.write(JSON.stringify({ theme: cfg.theme, active: picked.id, mornings: mornings, themes: list }, null, 2) + "\n")
    return
  }
  const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length))
  for (const t of list) {
    const when = t.at ? t.at + " mornings" : "always"
    const state = t.active ? "in use" : t.unlocked ? "unlocked" : t.remaining + " to go"
    process.stdout.write(pad(t.id, 12) + pad(t.name, 16) + pad(when, 13) + state + "\n")
  }
  if (p.next) process.stdout.write("\nNext: " + p.next.name + " at " + p.next.at + " mornings (" + p.next.remaining + " to go).\n")
}

// `font` lists the free Google Font pairings; with an id it sets the next
// edition's type. No unlocking here: every pairing is free.
// `style [flat|table]`: a flat page, or the paper lying on a table.
function styleCommand(opt, cfg) {
  const want = opt._[0]
  if (!want) {
    for (const id of STYLES) process.stdout.write(id.padEnd(8) + (id === "table" ? "On the table: paper grain, a fold and shadows" : "Flat: the page as it's always been") + ((cfg.style || "table") === id ? " · in use" : "") + "\n")
    return
  }
  if (!STYLES.includes(want)) { process.stderr.write('No style "' + want + '". Try: ' + STYLES.join(", ") + "\n"); process.exit(2) }
  const file = P.configFile()
  const saved = readJson(file) || {}
  privately(DATA)
  fs.mkdirSync(DATA, { recursive: true })
  writeAtomic(file, JSON.stringify(Object.assign({}, P.DEFAULTS, saved, { style: want }), null, 2) + "\n")
  process.stdout.write("Style set to " + want + ".\n")
}

function fontCommand(opt, cfg) {
  const current = Fonts.get(cfg.font)
  const want = opt._[0]
  if (want) {
    const f = Fonts.byId(want)
    if (!f) {
      process.stderr.write('No font "' + want + '". Try: ' + Fonts.FONTS.map(x => x.id).join(", ") + "\n")
      process.exit(2)
    }
    const file = P.configFile()
    const saved = readJson(file) || {}
    privately(DATA)
    fs.mkdirSync(DATA, { recursive: true })
    writeAtomic(file, JSON.stringify(Object.assign({}, P.DEFAULTS, saved, { font: f.id }), null, 2) + "\n")
    process.stdout.write("Font set to " + f.name + ". The next edition will use it.\n")
    return
  }
  if (opt.json) {
    process.stdout.write(JSON.stringify({
      font: current.id,
      fonts: Fonts.FONTS.map(f => ({ id: f.id, name: f.name, blurb: f.blurb, active: f.id === current.id }))
    }, null, 2) + "\n")
    return
  }
  const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - String(s).length))
  for (const f of Fonts.FONTS) {
    process.stdout.write(pad(f.id, 12) + pad(f.name, 13) + f.blurb + (f.id === current.id ? " · in use" : "") + "\n")
  }
}

// ---- scheduling ------------------------------------------------------------------------

// `trend` prints the last two weeks of prompts and tokens, with a forecast.
function trendCommand(opt) {
  const days = Model.intSetting(opt.days, 14, 7, 31)
  const end = opt.date && Model.parseDateKey(opt.date) ? opt.date : Model.dateKeyFromDate(new Date())
  const from = Model.shiftDateKey(end, -(days - 1))
  const sessions = C.claudeSessions(from, end).concat(C.codexSessions(from, end))
  const usage = C.claudeUsage(from, end).concat(C.codexUsage(from, end), C.opencodeUsage(from, end))
  const t = Trend.compute(sessions, usage, end, days)
  if (opt.json) {
    process.stdout.write(JSON.stringify(t, null, 2) + "\n")
    return
  }
  process.stdout.write(t.headline + "\n" + t.blurb + "\n")
}

function install(opt, cfg) {
  const hour = opt.hour !== undefined ? Model.intSetting(opt.hour, 5, 0, 23) : cfg.hour
  const node = P.stableNode(process.execPath)
  const script = STANDALONE ? "" : P.stableScript(path.resolve(__filename))
  privately(DATA)
  fs.mkdirSync(DATA, { recursive: true })
  const cfgFile = P.configFile()
  const saved = readJson(cfgFile) || {}
  if (saved.hour !== hour || !fs.existsSync(cfgFile)) writeAtomic(cfgFile, JSON.stringify(Object.assign({}, P.DEFAULTS, saved, { hour: hour }), null, 2) + "\n")

  if (process.platform === "darwin") {
    const plist = P.launchdPath()
    fs.mkdirSync(path.dirname(plist), { recursive: true })
    const uid = String(process.getuid())
    runCapture(["launchctl", "bootout", "gui/" + uid, plist])
    fs.writeFileSync(plist, P.launchdPlist(node, script, hour, DATA), { mode: 0o644 })
    const r = runCapture(["launchctl", "bootstrap", "gui/" + uid, plist])
    if (!r.ok) { process.stderr.write("launchctl bootstrap failed:\n" + r.out + "\n"); process.exit(1) }
    process.stdout.write("The paper will be set each morning at " + hour + ":00 (or when your Mac next wakes).\nlaunchd job: " + plist + "\n")
  } else if (process.platform === "win32") {
    const xml = path.join(os.tmpdir(), "inkwell-daily-task-" + process.pid + ".xml")
    // schtasks wants the XML in UTF-16 with a byte-order mark.
    fs.writeFileSync(xml, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(P.taskXml(node, script, hour), "utf16le")]))
    const r = runCapture(["schtasks.exe", "/Create", "/F", "/TN", P.TASK_NAME, "/XML", xml])
    fs.rmSync(xml, { force: true })
    if (!r.ok) { process.stderr.write("schtasks failed:\n" + r.out + "\n"); process.exit(1) }
    process.stdout.write("The paper will be set each morning at " + hour + ":00 (or at your next sign-in).\nScheduled task: " + P.TASK_NAME + "\n")
  } else {
    const cmd = JSON.stringify(node) + " " + (script ? JSON.stringify(script) + " " : "") + "morning"
    process.stdout.write("On Linux, add this to your crontab (crontab -e):\n0 " + hour + " * * * " + cmd + "\n")
  }
}

function uninstall() {
  if (process.platform === "darwin") {
    const plist = P.launchdPath()
    runCapture(["launchctl", "bootout", "gui/" + process.getuid(), plist])
    fs.rmSync(plist, { force: true })
  } else if (process.platform === "win32") {
    runCapture(["schtasks.exe", "/Delete", "/F", "/TN", P.TASK_NAME])
  }
  process.stdout.write("The morning run is off. Your editions are still in " + DATA + "\n")
}

// ---- main ------------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0] && !argv[0].startsWith("-") ? argv.shift() : "help"
  const opt = flags(argv)
  const cfg = P.readConfig()
  switch (cmd) {
    case "build": await build(opt, cfg); break
    case "morning": await morning(cfg); break
    case "sources": {
      const found = S.loadPlugins(cfg, DATA, m => process.stderr.write(m + "\n"))
      process.stdout.write(found.length ? found.map(s => s.id + "\t" + s.name + "\t(" + s.plugin + ")").join("\n") + "\n" : "No plugin sources installed. The free paper reports agent logs, git and the weather.\n")
      break
    }
    case "open": {
      const index = loadIndex()
      const key = opt._[0] || (index[0] && index[0].date)
      const file = key && path.join(ED_DIR, key + ".html")
      if (!file || !fs.existsSync(file)) { process.stderr.write("No edition yet. Set one with: inkwell-daily build\n"); process.exit(1) }
      markRead(key)
      // The menu bar app shows the paper in its own window; it only needs
      // the morning marked and the path.
      if (opt["no-browser"]) process.stdout.write(file + "\n")
      else openPath(file)
      break
    }
    case "index": {
      const file = path.join(ED_DIR, "index.html")
      if (!fs.existsSync(file)) { process.stderr.write("No editions yet.\n"); process.exit(1) }
      openPath(file)
      break
    }
    case "latest": { const e = loadIndex()[0]; if (e) process.stdout.write(path.join(ED_DIR, e.date + ".html") + "\n"); break }
    case "status": status(); break
    case "theme": themeCommand(opt, cfg); break
    case "restyle": restyleCommand(opt, P.readConfig()); break
    case "style": styleCommand(opt, cfg); break
    case "font": fontCommand(opt, cfg); break
    case "trend": trendCommand(opt); break
    case "portrait": await portraitCommand(opt, cfg); break
    case "publish": publish(opt); break
    case "web": { const s = readJson(path.join(DATA, "web", "state.json")) || {}; const u = Model.artifactUrl(s.url); if (u) process.stdout.write(u + "\n"); break }
    case "install": install(opt, cfg); break
    case "uninstall": uninstall(); break
    case "config": process.stdout.write(P.configFile() + "\n" + JSON.stringify(cfg, null, 2) + "\n"); break
    default: usage()
  }
}

main().catch(e => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(1) })
