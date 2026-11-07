#!/usr/bin/env node
// Inkwell Daily for macOS and Windows: a morning newspaper about yesterday's
// agent work and commits, set from your own machine.
//
//   inkwell-daily build [--date YYYY-MM-DD] [--prose] [--offline] [--print-prompt] [--out DIR]
//   inkwell-daily morning              set yesterday's edition if it isn't yet, toast, publish
//   inkwell-daily open [YYYY-MM-DD]    read the newest (or that) edition in your browser
//   inkwell-daily index                every edition, in your browser
//   inkwell-daily latest               the newest edition's path
//   inkwell-daily status               {"latest": …, "unread": …, "web": …}
//   inkwell-daily theme [id]           the milestone themes you've unlocked
//   inkwell-daily font [id]            the type pairing for the paper
//   inkwell-daily publish [--date D] [--dry-run]   put an edition on claude.ai
//   inkwell-daily install [--hour H]   set the paper each morning (launchd / Task Scheduler)
//   inkwell-daily uninstall            stop the morning run
//   inkwell-daily config               where the settings file is, and what's in it
//   inkwell-daily sources              the plugin sources that will report (Inkwell Pro and others)

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { execFileSync } = require("node:child_process")

const ROOT = path.join(__dirname, "..")
const Model = require(path.join(ROOT, "Model.js"))
const P = require(path.join(ROOT, "lib/platform.js"))
const C = require(path.join(ROOT, "lib/collect.js"))
const { compose, factsText, prosePrompt, clock } = require(path.join(ROOT, "lib/compose.js"))
const { renderEdition, renderIndex, plainText } = require(path.join(ROOT, "lib/render.js"))
const { webCopy, fileChanges } = require(path.join(ROOT, "lib/web.js"))
const { LINK_MAX, CACHE_JSON_MAX } = require(path.join(ROOT, "lib/fetch.js"))
const { privately } = require(path.join(ROOT, "lib/private.js"))
const S = require(path.join(ROOT, "lib/sources.js"))
const PR = require(path.join(ROOT, "lib/prices.js"))
const Themes = require(path.join(ROOT, "lib/themes.js"))
const Fonts = require(path.join(ROOT, "lib/fonts.js"))

const DATA = P.dataDir()
const ED_DIR = path.join(DATA, "editions")
const INDEX_FILE = path.join(DATA, "editions.json")
const READ_FILE = path.join(DATA, "read")
const READS_FILE = path.join(DATA, "reads.json")

function usage() {
  const lines = fs.readFileSync(__filename, "utf8").split("\n")
  const end = lines.findIndex((line, i) => i > 1 && !line.startsWith("//"))
  process.stdout.write(lines.slice(1, end > 1 ? end : lines.length).map(line => line.replace(/^\/\/ ?/, "")).join("\n") + "\n")
}

function flags(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--date" || a === "--out" || a === "--prose-file" || a === "--hour") out[a.slice(2)] = argv[++i] || ""
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
  const reads = loadReads()
  const theme = C.desktop()
  const chosen = Themes.resolve(cfg.theme, Model.readTotal(reads.days, key), theme.palette)
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
    week: {}
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
  g.extras = await S.collectAll(S.loadPlugins(cfg, DATA, log), { key: key, from: Model.shiftDateKey(key, -6), to: key, net: !opt.offline, dataDir: DATA }, cfg)
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
    headline: ed.lead.headline, prose: g.prose || null
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
function themeCommand(opt, cfg) {
  const ledger = loadReads()
  const today = Model.dateKeyFromDate(new Date())
  const mornings = Model.readTotal(ledger.days, today)
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

function install(opt, cfg) {
  const hour = opt.hour !== undefined ? Model.intSetting(opt.hour, 5, 0, 23) : cfg.hour
  const node = process.execPath
  const script = path.resolve(__filename)
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
    process.stdout.write("On Linux, add this to your crontab (crontab -e):\n0 " + hour + " * * * " + JSON.stringify(node) + " " + JSON.stringify(script) + " morning\n")
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
      openPath(file)
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
    case "font": fontCommand(opt, cfg); break
    case "publish": publish(opt); break
    case "web": { const s = readJson(path.join(DATA, "web", "state.json")) || {}; const u = Model.artifactUrl(s.url); if (u) process.stdout.write(u + "\n"); break }
    case "install": install(opt, cfg); break
    case "uninstall": uninstall(); break
    case "config": process.stdout.write(P.configFile() + "\n" + JSON.stringify(cfg, null, 2) + "\n"); break
    default: usage()
  }
}

main().catch(e => { process.stderr.write(String(e && e.stack || e) + "\n"); process.exit(1) })
