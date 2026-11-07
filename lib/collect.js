// Gathers what the paper reports, from the machine itself: agent logs, git,
// your wallpaper and the weather. Everything that touches the disk or the
// network lives here; the rest of the builder is pure.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const Model = require("../Model.js")
const F = require("./fetch.js")
const P = require("./platform.js")

const HOME = P.home()
const UA = "InkwellDaily/1.0 (desktop; github.com/wealthberrylabs)"

function run(cmd, args, opts) {
  try {
    return execFileSync(cmd, args, Object.assign({ encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20, windowsHide: true }, opts || {}))
  } catch (e) {
    return ""
  }
}

function ok(cmd, args) {
  try { execFileSync(cmd, args, { stdio: "ignore", timeout: 15000, windowsHide: true }); return true } catch (e) { return false }
}

function has(cmd) { return P.hasCommand(cmd) }

function readText(file) {
  try { return fs.readFileSync(file, "utf8") } catch (e) { return "" }
}

function readJson(file) {
  try {
    if (fs.statSync(file).size > F.CACHE_JSON_MAX) return null
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) { return null }
}

function list(dir) {
  try { return fs.readdirSync(dir) } catch (e) { return [] }
}

function keyOf(ms) { return Model.dateKeyFromDate(new Date(ms)) }

function inRange(key, from, to) { return key >= from && key <= to }

// A capped HTTPS fetch. Past `max` bytes, declared or streamed, the answer
// is refused whole.
function fetchBytes(url, max, seconds, timeout) {
  if (!F.httpsUrl(url)) return null
  try {
    return execFileSync(P.curlCommand(), F.curlArgs(url, max, seconds, ["-A", UA]),
      { timeout: timeout, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "ignore"], maxBuffer: max, windowsHide: true })
  } catch (e) {
    return null
  }
}

function str(v, max) {
  return typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : ""
}

function curlJson(url) {
  const out = fetchBytes(url, F.JSON_MAX, 15, 20000)
  try { return out ? JSON.parse(out.toString("utf8")) : null } catch (e) { return null }
}

// A picture as a data URI, resized so the page stays a sensible size. It
// must be a JPEG, PNG or WebP by its own first bytes. ImageMagick does the
// resizing when it's installed, else sips on a Mac; without either, a
// picture small enough goes in as it is.
const RAW_MAX = 6 << 20

function imageData(src, width, quality) {
  if (!src) return ""
  const remote = /^https:/.test(src)
  let bytes = null
  if (remote) {
    if (!F.httpsUrl(src, F.IMAGE_HOSTS)) return ""
    bytes = fetchBytes(src, F.IMAGE_MAX, 30, 45000)
  } else {
    try { if (fs.statSync(src).size <= F.LOCAL_IMAGE_MAX) bytes = fs.readFileSync(src) } catch (e) { bytes = null }
  }
  const type = F.sniffImage(bytes)
  if (!type) return ""
  let dir = ""
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-daily-"))
    const input = path.join(dir, "in." + (type === "jpeg" ? "jpg" : type))
    const output = path.join(dir, "out.jpg")
    fs.writeFileSync(input, bytes)
    if (has("magick")) run("magick", F.magickArgs(input, type, width, quality, output), { timeout: 90000, killSignal: "SIGKILL" })
    else if (process.platform === "darwin" && type !== "webp") run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(quality || 72), "--resampleWidth", String(width), input, "--out", output], { timeout: 90000, killSignal: "SIGKILL" })
    const out = fs.existsSync(output) ? fs.readFileSync(output) : null
    if (F.sniffImage(out) === "jpeg" && out.length <= F.IMAGE_MAX) return "data:image/jpeg;base64," + out.toString("base64")
    return bytes.length <= RAW_MAX ? "data:image/" + type + ";base64," + bytes.toString("base64") : ""
  } catch (e) {
    return ""
  } finally {
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
  }
}

// ---- You -------------------------------------------------------------------

function reader() {
  const n = P.fullName()
  return { name: Model.firstName(n.full, n.user) }
}

function desktop() {
  const bg = P.wallpaper()
  const dark = P.darkMode()
  const pretty = s => String(s || "").replace(/\.[a-z0-9]+$/i, "").replace(/^\d+-/, "").split(/[-_ ]+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  return {
    theme: dark ? "Dark mode" : "Light mode",
    wallpaper: /TranscodedWallpaper$/.test(bg) ? "Desktop picture" : pretty(path.basename(bg)),
    wallpaperPath: bg,
    palette: P.palette(dark)
  }
}

// ---- Agents --------------------------------------------------------------------------

const SKIP_PREFIX = /^\s*(<|\[Request interrupted|Caveat:)/

function textOf(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.filter(c => c && c.type === "text").map(c => c.text).join("\n")
  return ""
}

// Typed prompts, sessions and what they shipped, per local day.
function claudeSessions(from, to) {
  const root = path.join(HOME, ".claude", "projects")
  const own = P.dataDir()
  const sessions = []
  for (const proj of list(root)) {
    const dir = path.join(root, proj)
    for (const f of list(dir)) {
      if (!f.endsWith(".jsonl")) continue
      const file = path.join(dir, f)
      let st
      try { st = fs.statSync(file) } catch (e) { continue }
      if (keyOf(st.mtimeMs) < from) continue
      const s = { id: f.replace(/\.jsonl$/, ""), cwd: "", prompts: [], commits: 0, files: new Set(), published: 0, installs: 0, outputTokens: 0, model: "", days: {} }
      for (const line of readText(file).split("\n")) {
        if (!line) continue
        let e
        try { e = JSON.parse(line) } catch (err) { continue }
        const t = Date.parse(e.timestamp || "")
        if (!t) continue
        const k = keyOf(t)
        if (!inRange(k, from, to)) continue
        if (e.cwd && !s.cwd) s.cwd = e.cwd
        if (e.type === "user" && !e.isMeta && e.message && typeof e.message.content === "string") {
          const text = e.message.content.trim()
          if (text && !SKIP_PREFIX.test(text)) { s.prompts.push({ at: t, key: k, text: text }); s.days[k] = (s.days[k] || 0) + 1 }
        }
        if (e.type === "assistant" && e.message) {
          const u = e.message.usage
          if (u) s.outputTokens += Number(u.output_tokens) || 0
          if (e.message.model && !/synthetic/.test(e.message.model)) s.model = e.message.model
          for (const c of Array.isArray(e.message.content) ? e.message.content : []) {
            if (!c || c.type !== "tool_use") continue
            const inp = c.input || {}
            if ((c.name === "Edit" || c.name === "Write") && inp.file_path) s.files.add(inp.file_path)
            if (c.name === "Artifact" && (!inp.action || inp.action === "publish")) s.published++
            if (c.name === "Bash" && typeof inp.command === "string") {
              s.commits += (inp.command.match(/\bgit (-C \S+ )?commit\b/g) || []).length
              if (/\b(brew install|winget install|choco install|scoop install|npm i(nstall)? -g|pip install)\b/.test(inp.command)) s.installs++
            }
          }
        }
      }
      if (s.cwd && s.cwd.indexOf(own) === 0) continue
      if (!s.prompts.length) continue
      s.files = Array.from(s.files)
      s.firstAt = s.prompts[0].at
      s.lastAt = s.prompts[s.prompts.length - 1].at
      s.agent = "Claude Code"
      sessions.push(s)
    }
  }
  return sessions.sort((a, b) => a.firstAt - b.firstAt)
}

function codexSessions(from, to) {
  const out = []
  let k = from
  while (k && k <= to) {
    const dir = path.join(HOME, ".codex", "sessions", k.slice(0, 4), k.slice(5, 7), k.slice(8, 10))
    for (const f of list(dir)) {
      if (!f.endsWith(".jsonl")) continue
      const prompts = []
      let cwd = ""
      for (const line of readText(path.join(dir, f)).split("\n")) {
        let e
        try { e = JSON.parse(line) } catch (err) { continue }
        const p = e.payload || e
        if (p && p.cwd && !cwd) cwd = p.cwd
        if (p && p.type === "message" && p.role === "user") {
          const text = textOf(p.content).trim()
          const t = Date.parse(e.timestamp || "") || 0
          if (text && !SKIP_PREFIX.test(text)) prompts.push({ at: t, key: k, text: text })
        }
      }
      if (prompts.length) out.push({ id: f, cwd: cwd, prompts: prompts, commits: 0, files: [], published: 0, installs: 0, outputTokens: 0, model: "", days: { [k]: prompts.length }, firstAt: prompts[0].at, lastAt: prompts[prompts.length - 1].at, agent: "Codex" })
    }
    k = Model.shiftDateKey(k, 1)
  }
  return out
}


// ---- The repo desk ---------------------------------------------------------------

function gitRoot(dir) {
  return dir ? run("git", ["-C", dir, "rev-parse", "--show-toplevel"]).trim() : ""
}

// The repositories you worked in: those listed in config.json, plus every
// one an agent session ran in during the week. Only commits under your own
// git identity count, so pulled-in work never passes for yours.
function repoDesk(from, to, sessions, extra) {
  const roots = new Map()
  const add = dir => {
    const r = gitRoot(dir)
    if (r && !roots.has(path.resolve(r))) roots.set(path.resolve(r), r)
  }
  for (const r of extra || []) add(r.replace(/^~(?=$|[\\/])/, HOME))
  for (const s of sessions || []) if (s.cwd) add(s.cwd)
  const out = []
  const names = {}
  for (const dir of Array.from(roots.values()).sort()) {
    let name = path.basename(dir)
    if (names[name]) name = path.basename(path.dirname(dir)) + "/" + name
    names[name] = true
    const p = { id: dir, name: name, tracked: true, commits: [], dirty: false }
    const email = run("git", ["-C", dir, "config", "user.email"]).trim()
    const since = Model.parseDateKey(from), until = Model.parseDateKey(Model.shiftDateKey(to, 1))
    const log = email ? run("git", ["-C", dir, "log", "--all", "-F", "--author=<" + email + ">", "--since=" + since.toISOString(), "--until=" + until.toISOString(), "--format=%at%x09%s"]) : ""
    const seen = new Set()
    for (const line of log.split("\n")) {
      const m = /^(\d+)\t(.*)$/.exec(line)
      if (m && !seen.has(line)) { seen.add(line); p.commits.push({ at: Number(m[1]) * 1000, key: keyOf(Number(m[1]) * 1000), subject: m[2] }) }
    }
    p.dirty = run("git", ["-C", dir, "status", "--porcelain"]).trim() !== ""
    out.push(p)
  }
  return out
}

// ---- Weather -------------------------------------------------------------------------------

function forecastUrl(lat, lon, from, to) {
  return "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,uv_index_max" +
    "&hourly=temperature_2m,wind_speed_10m&current=temperature_2m,weather_code,is_day&timezone=auto&start_date=" + from + "&end_date=" + to
}

function imperialLocale() {
  let loc = ""
  try { loc = Intl.DateTimeFormat().resolvedOptions().locale || "" } catch (e) {}
  const lang = process.env.LC_ALL || process.env.LC_MEASUREMENT || process.env.LANG || loc
  return /[-_](US|LR|MM)\b/.test(lang)
}

// From Open-Meteo, for the place in config.json or, with none set, wherever
// wttr.in places your IP address. `net` false keeps it all local.
function weather(key, net, cfg) {
  cfg = cfg || {}
  if (net === undefined) net = true
  const imperial = cfg.units === "imperial" || (cfg.units !== "metric" && imperialLocale())
  let raw = null, place = cfg.place || "", source = ""
  if (net) {
    let lat = Number(cfg.latitude), lon = Number(cfg.longitude)
    if (cfg.latitude === null || cfg.latitude === undefined || !isFinite(lat) || !isFinite(lon)) {
      lat = NaN; lon = NaN
      const w = curlJson("https://wttr.in/?format=j1")
      const a = w && w.nearest_area && w.nearest_area[0]
      if (a) { lat = Number(a.latitude); lon = Number(a.longitude); place = place || (a.areaName && a.areaName[0] ? str(a.areaName[0].value, 80) : "") }
    }
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const f = curlJson(forecastUrl(lat, lon, key, Model.shiftDateKey(key, 3)))
      if (f && f.daily) { raw = f; source = "Open-Meteo" }
    }
  }
  return { raw: raw, place: place, source: source, imperial: imperial, places: [] }
}

// ---- The back page --------------------------------------------------------------------------

function almanac() {
  const d = P.disk(HOME)
  return { since: "", diskFree: d.free, diskSize: d.size, bindings: [] }
}

function looseEnds(desk) {
  const out = []
  if (has("gh") && !ok("gh", ["auth", "status"])) out.push({ kind: "WANTED", text: "A GitHub CLI login, for anything that checks provenance or ships a release.", code: "gh auth login" })
  for (const p of desk) if (p.dirty) out.push({ kind: "NOTICE", text: p.name + " has changes that aren't committed yet.", code: "" })
  return out
}

module.exports = {
  run, readJson, readText, imageData, fetchBytes, str, reader, desktop,
  claudeSessions, codexSessions, repoDesk, weather, almanac, looseEnds, has
}
