// Inkwell Daily Pro's front-page portrait: one of your own headshots, chosen
// by how yesterday went and printed as a halftone above the lead. Providers
// share one shape:
//   { id, make(photoPath) -> { image: data URI, filtered: bool } | null }
// "Make headlines" in Settings can have an image service draw the portrait
// from a headshot first: OpenAI, Recraft, Higgsfield (imagegen.js), or your
// own command. Whatever it draws is screened as a halftone too.
// The photos and your ratings of them stay in the paper's own folder; the
// web copy leaves the portrait out (see web.js).

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { execFileSync } = require("node:child_process")

const F = require("./fetch.js")
const P = require("./platform.js")
const IG = require("./imagegen.js")

const MOODS = ["triumphant", "steady", "quiet", "rough"]
const VERDICTS = ["good", "bad"]
const PHOTO = /\.(jpe?g|png|webp)$/i
const RATINGS = "ratings.jsonl"
// A photo rated bad this many more times than good is set aside.
const BENCH = 2

// ---- Pure ------------------------------------------------------------------

// The day's mood from its prompts and commits.
function moodFor(day) {
  const prompts = Number(day && day.prompts) || 0, commits = Number(day && day.commits) || 0
  if (!prompts && !commits) return "quiet"
  if (commits >= 8 || prompts >= 60) return "triumphant"
  if (prompts >= 20 && commits === 0) return "rough"
  return "steady"
}

// A file's mood is its name's first word: triumphant-beach.jpg. Anything
// else fits any day.
function photoMood(name) {
  const m = /^([a-z]+)[-_ .]/i.exec(path.basename(name))
  return m && MOODS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : "any"
}

function parseRatings(text) {
  return String(text || "").split("\n").map(l => { try { return JSON.parse(l) } catch (e) { return null } })
    .filter(r => r && VERDICTS.includes(r.verdict) && typeof r.date === "string")
}

// The newest verdict per edition counts; changing your mind replaces it.
function latestRatings(ratings) {
  const by = {}
  for (const r of ratings) by[r.date] = r
  return Object.values(by)
}

// How each provider, and each photo, has fared with you.
function summary(ratings) {
  const providers = {}, photos = {}
  for (const r of latestRatings(ratings)) {
    const p = providers[r.provider || "halftone"] = providers[r.provider || "halftone"] || { good: 0, bad: 0 }
    p[r.verdict]++
    if (r.photo) { const f = photos[r.photo] = photos[r.photo] || { good: 0, bad: 0 }; f[r.verdict]++ }
  }
  for (const k in providers) providers[k].accuracy = providers[k].good / (providers[k].good + providers[k].bad)
  return { providers: providers, photos: photos }
}

// The day's photo: the mood's own first, then any; benched photos only if
// nothing else is left. The same date always picks the same photo.
function choosePhoto(photos, mood, key, ratings) {
  if (!photos.length) return ""
  const scores = summary(ratings || []).photos
  const benched = p => { const s = scores[path.basename(p)]; return s && s.bad - s.good >= BENCH }
  const fresh = photos.filter(p => !benched(p))
  const pool = [mood, "any"].map(m => fresh.filter(p => photoMood(p) === m)).find(l => l.length) || (fresh.length ? fresh : photos)
  const n = parseInt(crypto.createHash("sha1").update(String(key)).digest("hex").slice(0, 8), 16)
  return pool.slice().sort()[n % pool.length]
}

const CAPTIONS = {
  triumphant: "Pictured: the developer, moments after the last commit landed.",
  steady: "Pictured: the developer, keeping a steady hand on the keys.",
  quiet: "Pictured: the developer, on a day the logs stayed quiet.",
  rough: "Pictured: the developer, still optimistic about the next prompt."
}

function caption(mood) {
  return CAPTIONS[mood] || CAPTIONS.steady
}

// ---- Providers -------------------------------------------------------------

function magick(args) {
  try { execFileSync("magick", args, { timeout: 90000, killSignal: "SIGKILL", stdio: "ignore", windowsHide: true }); return true } catch (e) { return false }
}

// Halftone: ImageMagick screens the photo into dots. Without it the photo
// goes in plain and the page's CSS lays the dots over it.
const halftone = {
  id: "halftone",
  make(src) {
    let bytes
    try { if (fs.statSync(src).size > F.LOCAL_IMAGE_MAX) return null; bytes = fs.readFileSync(src) } catch (e) { return null }
    const type = F.sniffImage(bytes)
    if (!type) return null
    let dir = ""
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-portrait-"))
      const input = path.join(dir, "in." + (type === "jpeg" ? "jpg" : type)), output = path.join(dir, "out.png")
      fs.writeFileSync(input, bytes)
      if (P.hasCommand("magick") && magick(["-limit", "memory", "256MiB", "-limit", "time", "60", type + ":" + input + "[0]", "-auto-orient", "-strip",
        "-resize", "1200x>", "-colorspace", "Gray", "-ordered-dither", "h6x6o", "png:" + output])) {
        const out = fs.readFileSync(output)
        if (F.sniffImage(out) === "png" && out.length <= F.IMAGE_MAX) return { image: "data:image/png;base64," + out.toString("base64"), filtered: true }
      }
      return bytes.length <= F.IMAGE_MAX ? { image: "data:image/" + type + ";base64," + bytes.toString("base64"), filtered: false } : null
    } catch (e) {
      return null
    } finally {
      if (dir) try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
    }
  }
}

const GENERATOR_TIMEOUT = 120000

// Your own command, run as `command <photo> <output>` with the brief in
// INKWELL_* variables; it writes a JPEG, PNG or WebP to <output>.
function runCommand(command, src, brief) {
  let dir = ""
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-generate-"))
    const output = path.join(dir, "out")
    try {
      execFileSync(command, [src, output], {
        timeout: GENERATOR_TIMEOUT, killSignal: "SIGKILL", stdio: "ignore", windowsHide: true,
        env: Object.assign({}, process.env, generatorEnv(brief))
      })
    } catch (e) {
      throw new Error(path.basename(command) + (e.signal ? " ran past " + GENERATOR_TIMEOUT / 1000 + " seconds." : " failed (exit " + e.status + ")."))
    }
    let bytes = null
    try { bytes = fs.readFileSync(output) } catch (e) {}
    if (!F.sniffImage(bytes)) throw new Error(path.basename(command) + " didn't write a JPEG, PNG or WebP.")
    return bytes
  } finally {
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
  }
}

// What the chosen service draws, screened like a photo so the paper looks
// the same whoever drew it. Throws with a reason when it can't.
async function drawn(gen, src, brief, deps) {
  const d = deps || {}
  let bytes
  if (gen.service === "command") bytes = runCommand(gen.command, src, brief)
  else {
    const photo = fs.readFileSync(src)
    bytes = await IG.generate(gen.service, {
      key: gen.key, model: gen.model, prompt: generatorEnv(brief).INKWELL_PROMPT, scene: generatorEnv(brief).INKWELL_SCENE,
      photo: { bytes: photo, type: F.sniffImage(photo) }, fetch: d.fetch, sleep: d.sleep
    })
  }
  let dir = ""
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-drawn-"))
    const file = path.join(dir, "drawn")
    fs.writeFileSync(file, bytes)
    const made = halftone.make(file)
    if (!made) throw new Error("The picture came back too big to print.")
    return made
  } finally {
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
  }
}

function providerId(gen) {
  return gen.service === "command" ? "generator:" + path.basename(gen.command) : gen.service + (gen.model ? ":" + gen.model : "")
}

function generatorEnv(brief) {
  const b = brief || {}
  return {
    INKWELL_HEADLINE: String(b.headline || ""),
    INKWELL_MOOD: String(b.mood || ""),
    INKWELL_PROMPT: "A newspaper front-page photo of the person in the reference photo, " + (MOOD_SCENES[b.mood] || MOOD_SCENES.steady) +
      (b.headline ? ", illustrating the headline \"" + b.headline + "\"" : "") + ". Keep their face recognizable. No text in the image.",
    // For services that keep the person and draw only what's behind them.
    // No headline here: quoted words end up painted into the scene.
    INKWELL_SCENE: "A documentary newspaper photo backdrop: " + (BACKDROPS[b.mood] || BACKDROPS.steady) + ". Realistic lighting that matches the subject. No logos, no brand names, no text or lettering anywhere."
  }
}

const BACKDROPS = {
  triumphant: "a packed conference hall on its feet applauding, stage lights and confetti",
  steady: "a busy, warmly lit newsroom with people at work",
  quiet: "a calm, empty city street on a slow morning",
  rough: "a cluttered late-night office with whiteboards full of diagrams"
}

const MOOD_SCENES = {
  triumphant: "celebrating a big win at their desk",
  steady: "working calmly at their desk",
  quiet: "relaxing on a slow day",
  rough: "wrestling cheerfully with a stubborn problem"
}

const PROVIDERS = { halftone: halftone }

// config.json's "headlines": { enabled, service, model, generator, consent }.
// A service is used only with consent, since it sends your photo away; the
// key is looked up separately (imagegen.apiKey), never kept in config.
function settings(cfg, lookupKey) {
  const h = cfg && typeof cfg.headlines === "object" && cfg.headlines ? cfg.headlines : {}
  const out = { enabled: h.enabled !== false, generator: null }
  // Before services, a generator path alone meant your own command.
  const service = IG.SERVICES[h.service] ? h.service : (h.generator ? "command" : "")
  if (!service || h.consent !== true) return out
  const model = typeof h.model === "string" ? h.model.trim().slice(0, 80) : ""
  if (service === "command") {
    if (typeof h.generator === "string" && path.isAbsolute(h.generator)) out.generator = { service: "command", command: h.generator }
  } else {
    out.generator = { service: service, model: model || IG.SERVICES[service].model, key: (lookupKey || IG.apiKey)(service) }
  }
  return out
}

// ---- The folder ------------------------------------------------------------

function folder(dataDir) {
  return path.join(dataDir, "portraits")
}

function listPhotos(dir) {
  try { return fs.readdirSync(dir).filter(n => PHOTO.test(n) && !n.startsWith(".")).map(n => path.join(dir, n)) } catch (e) { return [] }
}

function readRatings(dir) {
  try { return parseRatings(fs.readFileSync(path.join(dir, RATINGS), "utf8")) } catch (e) { return [] }
}

function recordRating(dir, r) {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, RATINGS), JSON.stringify({ date: r.date, verdict: r.verdict, provider: r.provider, photo: r.photo, at: Date.now() }) + "\n")
}

// The portrait for an edition, or null when there are no photos. With a
// service chosen, its picture is tried first and the plain halftone is the
// fallback, so a bad day at the service never costs the paper its photo.
async function portrait(dataDir, key, day, opts, deps) {
  const o = opts || {}
  const dir = folder(dataDir)
  const mood = moodFor(day)
  const photo = choosePhoto(listPhotos(dir), mood, key, readRatings(dir))
  if (!photo) return null
  let id = halftone.id, made = null, problem = ""
  if (o.generator) {
    try { made = await drawn(o.generator, photo, { mood: mood, headline: o.headline }, deps); id = providerId(o.generator) } catch (e) { problem = e.message }
  }
  if (!made) made = halftone.make(photo)
  if (!made) return null
  const drawnBy = id === halftone.id ? "" : o.generator.service === "command" ? path.basename(o.generator.command) : IG.SERVICES[o.generator.service].name
  return { image: made.image, filtered: made.filtered, mood: mood, caption: caption(mood), provider: id, photo: path.basename(photo), drawnBy: drawnBy, date: key, problem: problem }
}

// One run of the chosen service on one headshot, with no fallback, so
// Settings can show what it really makes. Writes the picture to `out`.
async function testGenerator(dataDir, gen, out, deps) {
  const photo = listPhotos(folder(dataDir)).sort()[0]
  if (!photo) return { ok: false, error: "Add a headshot first." }
  if (!gen) return { ok: false, error: "Choose an image service and allow it your headshots first." }
  let made
  try { made = await drawn(gen, photo, { mood: "triumphant", headline: "Local Developer Tests Image Generator, Results Pending" }, deps) } catch (e) { return { ok: false, error: e.message } }
  const m = /^data:image\/(\w+);base64,(.*)$/.exec(made.image)
  const file = out + "." + (m[1] === "jpeg" ? "jpg" : m[1])
  fs.writeFileSync(file, Buffer.from(m[2], "base64"))
  return { ok: true, path: file, photo: path.basename(photo), provider: providerId(gen) }
}

module.exports = { testGenerator, MOODS, VERDICTS, PROVIDERS, generatorEnv, settings, moodFor, photoMood, parseRatings, summary, choosePhoto, caption, folder, listPhotos, readRatings, recordRating, portrait }
