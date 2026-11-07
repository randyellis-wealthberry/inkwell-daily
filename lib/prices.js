// Published model prices, for turning token counts into an estimate. Two
// sources, both already on the machine when it can be helped: the catalog
// OpenCode caches in its own database, else models.dev itself. The compact
// result is cached beside the paper for a week, so a build doesn't re-read
// either one every morning.

"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const F = require("./fetch.js")
const P = require("./platform.js")

const CACHE = "prices.json"
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const API = "https://models.dev/api.json"

function home() { return P.home() }

// Where OpenCode keeps its history. macOS and Linux use the same XDG-style
// folder; Windows keeps it under the profile.
function opencodeDb() {
  const places = [
    path.join(home(), ".local", "share", "opencode", "opencode.db"),
    process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, "opencode", "opencode.db") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "opencode", "opencode.db") : "",
    process.env.APPDATA ? path.join(process.env.APPDATA, "opencode", "opencode.db") : ""
  ].filter(Boolean)
  for (const p of places) {
    try { if (fs.statSync(p).isFile()) return p } catch (e) {}
  }
  return ""
}

// OpenCode's cached models.dev catalog, read-only from its own database.
function fromOpencode() {
  const db = opencodeDb()
  if (!db || !P.hasCommand("sqlite3")) return null
  try {
    const out = execFileSync("sqlite3", ["-readonly", db,
      "select value from kv where key='models-dev:v2:catalog';"],
      { timeout: 30000, maxBuffer: 32 << 20, stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
    const raw = out.toString("utf8").trim()
    if (!raw) return null
    const wrap = JSON.parse(raw)
    const body = typeof wrap.body === "string" ? JSON.parse(wrap.body) : wrap.body
    return body && typeof body === "object" ? body : null
  } catch (e) {
    return null
  }
}

function fetchApi(net) {
  if (!net) return null
  try {
    const out = execFileSync(P.curlCommand(), F.curlArgs(API, F.PRICES_MAX, 30, ["--compressed"]),
      { timeout: 45000, maxBuffer: F.PRICES_MAX, stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
    const body = JSON.parse(out.toString("utf8"))
    return body && typeof body === "object" ? body : null
  } catch (e) {
    return null
  }
}

// A price can be a plain number, {price}, or a cache-write window such as
// {5m, 1h}. Take the ordinary (5 minute) write price when given a window.
function priceOf(v) {
  if (typeof v === "number" && isFinite(v)) return v
  if (v && typeof v === "object") {
    if (typeof v.price === "number" && isFinite(v.price)) return v.price
    if (typeof v["5m"] === "number" && isFinite(v["5m"])) return v["5m"]
    if (typeof v["1h"] === "number" && isFinite(v["1h"])) return v["1h"]
  }
  return null
}

// models.dev has two shapes: the API's flat cost, and the catalog OpenCode
// keeps, whose costs live under `cost.text`.
function normalize(body) {
  const out = {}
  for (const pid of Object.keys(body || {})) {
    const models = body[pid] && body[pid].models
    if (!models || typeof models !== "object") continue
    for (const mid of Object.keys(models)) {
      const m = models[mid] || {}
      const c = m.cost && m.cost.text ? m.cost.text : m.cost
      if (!c || typeof c !== "object") continue
      const input = priceOf(c.input)
      const output = priceOf(c.output)
      const cache = c.input && typeof c.input === "object" ? c.input.cache : null
      const read = cache ? priceOf(cache.read) : null
      const write = cache ? priceOf(cache.write) : null
      const cacheRead = read != null ? read : priceOf(c.cache_read)
      const cacheWrite = write != null ? write : priceOf(c.cache_write)
      if (input == null && output == null) continue
      out[pid + "/" + mid] = {
        name: typeof m.name === "string" ? m.name.replace(/\s*\(latest\)$/i, "") : mid,
        input: input || 0,
        output: output || 0,
        cacheRead: cacheRead || 0,
        cacheWrite: cacheWrite || 0
      }
    }
  }
  return out
}

function readCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"))
    if (!data || typeof data !== "object" || !data.models || typeof data.models !== "object") return null
    return { fetchedAt: Number(data.fetchedAt) || 0, models: data.models }
  } catch (e) {
    return null
  }
}

function writeCache(file, models, source) {
  try {
    const body = JSON.stringify({ version: 1, fetchedAt: Date.now(), source: source, models: models })
    const tmp = file + ".tmp-" + process.pid
    fs.writeFileSync(tmp, body + "\n")
    fs.renameSync(tmp, file)
  } catch (e) {}
}

// The compact catalog, keyed "provider/model". Never throws; an empty object
// just means the paper shows tokens and no money.
function load(dataDir, net) {
  const file = path.join(dataDir, CACHE)
  const cached = readCache(file)
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < TTL_MS) return cached.models
  let body = fromOpencode(), source = "opencode"
  if (!body) { body = fetchApi(net); source = "models.dev" }
  if (!body) return cached ? cached.models : {}
  const models = normalize(body)
  if (!Object.keys(models).length) return cached ? cached.models : {}
  writeCache(file, models, source)
  return models
}

module.exports = { load, normalize, priceOf, opencodeDb, CACHE }
