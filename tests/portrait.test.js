const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const Portrait = require("../lib/portrait.js")
const { webCopy } = require("../lib/web.js")
const { renderEdition } = require("../lib/render.js")

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

test("the day's mood follows its prompts and commits", () => {
  assert.equal(Portrait.moodFor({ prompts: 0, commits: 0 }), "quiet")
  assert.equal(Portrait.moodFor({ prompts: 10, commits: 9 }), "triumphant")
  assert.equal(Portrait.moodFor({ prompts: 30, commits: 0 }), "rough")
  assert.equal(Portrait.moodFor({ prompts: 12, commits: 2 }), "steady")
})

test("a photo's mood is its name's first word", () => {
  assert.equal(Portrait.photoMood("/x/triumphant-beach.jpg"), "triumphant")
  assert.equal(Portrait.photoMood("Rough_1.png"), "rough")
  assert.equal(Portrait.photoMood("headshot.jpg"), "any")
})

test("the mood's own photo wins, and the same date picks the same one", () => {
  const photos = ["/p/quiet-a.jpg", "/p/triumphant-a.jpg", "/p/triumphant-b.jpg", "/p/plain.jpg"]
  const one = Portrait.choosePhoto(photos, "triumphant", "2026-11-06", [])
  assert.match(one, /triumphant-/)
  assert.equal(Portrait.choosePhoto(photos, "triumphant", "2026-11-06", []), one)
  assert.equal(Portrait.choosePhoto(photos, "rough", "2026-11-06", []), "/p/plain.jpg", "no rough photo, so one for any day")
  assert.equal(Portrait.choosePhoto([], "quiet", "2026-11-06", []), "")
})

test("a photo rated bad twice more than good is set aside", () => {
  const photos = ["/p/steady-a.jpg", "/p/steady-b.jpg"]
  const bad = [{ date: "2026-11-01", verdict: "bad", photo: "steady-a.jpg" }, { date: "2026-11-02", verdict: "bad", photo: "steady-a.jpg" }]
  for (const key of ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) assert.equal(Portrait.choosePhoto(photos, "steady", key, bad), "/p/steady-b.jpg")
  assert.equal(Portrait.choosePhoto(["/p/steady-a.jpg"], "steady", "2026-11-06", bad), "/p/steady-a.jpg", "but it's still better than nothing")
})

test("each provider's accuracy counts the newest verdict per edition", () => {
  const r = Portrait.parseRatings([
    JSON.stringify({ date: "2026-11-01", verdict: "bad", provider: "halftone", photo: "a.jpg" }),
    JSON.stringify({ date: "2026-11-01", verdict: "good", provider: "halftone", photo: "a.jpg" }),
    JSON.stringify({ date: "2026-11-02", verdict: "bad", provider: "halftone", photo: "b.jpg" }),
    "not json", JSON.stringify({ date: "2026-11-03", verdict: "meh" })
  ].join("\n"))
  const s = Portrait.summary(r)
  assert.deepEqual(s.providers.halftone, { good: 1, bad: 1, accuracy: 0.5 })
  assert.deepEqual(s.photos["a.jpg"], { good: 1, bad: 0 })
})

test("halftone makes a picture from a photo in the folder, and ratings land beside it", async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-portrait-test-"))
  try {
    const dir = Portrait.folder(data)
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "quiet-desk.png"), Buffer.from(PIXEL, "base64"))
    const p = await Portrait.portrait(data, "2026-11-06", { prompts: 0, commits: 0 })
    assert.equal(p.photo, "quiet-desk.png")
    assert.equal(p.mood, "quiet")
    assert.match(p.image, /^data:image\/png;base64,/)
    Portrait.recordRating(dir, { date: p.date, verdict: "good", provider: p.provider, photo: p.photo })
    assert.equal(Portrait.readRatings(dir).length, 1)
    assert.equal((await Portrait.portrait(data, "2026-11-06", {})).photo, "quiet-desk.png")
    assert.equal(await Portrait.portrait(fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-empty-")), "2026-11-06", {}), null)
  } finally {
    fs.rmSync(data, { recursive: true, force: true })
  }
})

test("the web copy leaves the reader's portrait on the machine", () => {
  const html = '<h1>x</h1><figure class="portrait" data-date="2026-11-06"><span class="plate-photo"><img src="data:image/png;base64,' + PIXEL + '"></span><figcaption>c</figcaption></figure><p>y</p>'
  const c = webCopy(html)
  assert.equal(c.html, "<h1>x</h1><p>y</p>")
  assert.equal(c.images.length, 0)
})


test("a service is used only with consent, and its key never comes from config", () => {
  const key = svc => "key-for-" + svc
  assert.deepEqual(Portrait.settings({}, key), { enabled: true, generator: null })
  assert.equal(Portrait.settings({ headlines: { enabled: false } }, key).enabled, false)
  assert.equal(Portrait.settings({ headlines: { service: "openai" } }, key).generator, null, "no consent, no service")
  assert.deepEqual(Portrait.settings({ headlines: { service: "openai", consent: true, key: "from-config" } }, key).generator, { service: "openai", model: "gpt-image-2", key: "key-for-openai" })
  assert.equal(Portrait.settings({ headlines: { service: "recraft", consent: true } }, key).generator.model, "")
  assert.equal(Portrait.settings({ headlines: { service: "recraft", model: "recraftv4_1", consent: true } }, key).generator.model, "recraftv4_1")
  assert.equal(Portrait.settings({ headlines: { service: "nope", consent: true } }, key).generator, null)
  assert.equal(Portrait.settings({ headlines: { service: "command", generator: "gen", consent: true } }, key).generator, null, "a bare name could be anything on PATH")
  assert.deepEqual(Portrait.settings({ headlines: { generator: "/usr/local/bin/gen", consent: true } }, key).generator, { service: "command", command: "/usr/local/bin/gen" }, "older settings still mean your own command")
})

test("the generator is told the mood and headline", () => {
  const env = Portrait.generatorEnv({ mood: "triumphant", headline: "Local Developer Ships It" })
  assert.equal(env.INKWELL_HEADLINE, "Local Developer Ships It")
  assert.match(env.INKWELL_PROMPT, /celebrating/)
  assert.match(env.INKWELL_PROMPT, /"Local Developer Ships It"/)
  assert.match(env.INKWELL_SCENE, /applauding/)
  assert.match(env.INKWELL_SCENE, /No logos/)
})

test("a command's picture prints, and a failing one falls back to the photo", { skip: process.platform === "win32" }, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-gen-test-"))
  try {
    const dir = Portrait.folder(data)
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "steady.png"), Buffer.from(PIXEL, "base64"))
    const good = path.join(data, "good-gen"), bad = path.join(data, "bad-gen")
    fs.writeFileSync(good, '#!/bin/sh\ntest -n "$INKWELL_PROMPT" && cp "$1" "$2"\n', { mode: 0o755 })
    fs.writeFileSync(bad, "#!/bin/sh\nexit 1\n", { mode: 0o755 })
    assert.equal((await Portrait.portrait(data, "2026-11-06", {}, { generator: { service: "command", command: good }, headline: "H" })).provider, "generator:good-gen")
    const fell = await Portrait.portrait(data, "2026-11-06", {}, { generator: { service: "command", command: bad } })
    assert.equal(fell.provider, "halftone")
    assert.match(fell.problem, /bad-gen failed/)
  } finally {
    fs.rmSync(data, { recursive: true, force: true })
  }
})

test("testing a generator writes its picture, with no fallback to the photo", { skip: process.platform === "win32" }, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "inkwell-gentest-"))
  try {
    const out = path.join(data, "portrait-test")
    assert.match((await Portrait.testGenerator(data, { service: "command", command: "/x/gen" }, out)).error, /headshot/)
    fs.mkdirSync(Portrait.folder(data))
    fs.writeFileSync(path.join(Portrait.folder(data), "a.png"), Buffer.from(PIXEL, "base64"))
    assert.match((await Portrait.testGenerator(data, null, out)).error, /Choose an image service/)
    const good = path.join(data, "gen"), bad = path.join(data, "broken")
    fs.writeFileSync(good, '#!/bin/sh\ncp "$1" "$2"\n', { mode: 0o755 })
    fs.writeFileSync(bad, "#!/bin/sh\nexit 3\n", { mode: 0o755 })
    const r = await Portrait.testGenerator(data, { service: "command", command: good }, out)
    assert.equal(r.ok, true)
    assert.ok(fs.existsSync(r.path) && /portrait-test\.png$/.test(r.path))
    assert.match((await Portrait.testGenerator(data, { service: "command", command: bad }, out)).error, /broken failed/)
  } finally {
    fs.rmSync(data, { recursive: true, force: true })
  }
})
