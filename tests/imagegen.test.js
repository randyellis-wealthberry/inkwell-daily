const test = require("node:test")
const assert = require("node:assert/strict")
const IG = require("../lib/imagegen.js")

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
const photo = { bytes: PNG, type: "png" }

function reply(status, body) {
  return { ok: status < 300, status: status, json: async () => body, arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))) }
}

// A fetch that answers from a script and remembers what it was asked.
function fake(script) {
  const calls = []
  const f = async (url, init) => { calls.push({ url: url, init: init || {} }); const next = script.shift(); return typeof next === "function" ? next(url, init) : next }
  f.calls = calls
  return f
}

test("OpenAI gets the headshot as an edit and answers in base64", async () => {
  const f = fake([reply(200, { data: [{ b64_json: PNG.toString("base64") }] })])
  const out = await IG.generate("openai", { key: "sk-1", prompt: "p", photo: photo, fetch: f })
  assert.deepEqual(out, PNG)
  assert.equal(f.calls[0].url, "https://api.openai.com/v1/images/edits")
  assert.equal(f.calls[0].init.headers.Authorization, "Bearer sk-1")
  const body = f.calls[0].init.body
  assert.equal(body.get("model"), "gpt-image-2")
  assert.equal(body.get("prompt"), "p")
  assert.ok(body.get("image"))
})

test("Recraft keeps the person and redraws only the scene behind them", async () => {
  const f = fake([reply(200, { data: [{ b64_json: PNG.toString("base64") }] })])
  await IG.generate("recraft", { key: "rk", prompt: "draw the person", scene: "a newsroom", photo: photo, fetch: f })
  assert.equal(f.calls[0].url, "https://external.api.recraft.ai/v1/images/replaceBackground")
  const body = f.calls[0].init.body
  assert.equal(body.get("prompt"), "a newsroom", "the scene, not the person")
  assert.equal(body.get("model"), null, "Recraft picks its own model unless you name one")
  assert.equal(body.get("strength"), null)
  assert.equal(body.get("response_format"), "b64_json")
  assert.ok(body.get("image"))
})

test("Higgsfield uploads, queues, polls and downloads, and the upload never sees the key", async () => {
  const f = fake([
    reply(200, { upload_url: "https://uploads.example/put", upload_headers: { "Content-Type": "image/png" }, public_url: "https://cdn.example/h.png" }),
    reply(200, {}),
    reply(200, { status: "queued", status_url: "https://api.higgsfield.ai/requests/r1/status" }),
    reply(200, { status: "in_progress" }),
    reply(200, { status: "completed", images: [{ url: "https://cdn.example/out.png" }] }),
    reply(200, PNG)
  ])
  const out = await IG.generate("higgsfield", { key: "id:secret", prompt: "p", photo: photo, fetch: f, sleep: async () => {} })
  assert.deepEqual(out, PNG)
  assert.equal(f.calls[0].init.headers.Authorization, "Key id:secret")
  assert.equal(f.calls[1].url, "https://uploads.example/put")
  assert.ok(!JSON.stringify(f.calls[1].init.headers).includes("secret"), "the key stays off the upload")
  assert.deepEqual(JSON.parse(f.calls[2].init.body).image_urls, ["https://cdn.example/h.png"])
  assert.equal(f.calls[5].url, "https://cdn.example/out.png")
})

test("a turned-down key, a missing key and a non-picture all say why", async () => {
  await assert.rejects(IG.generate("openai", { key: "bad", prompt: "p", photo: photo, fetch: fake([reply(401, { error: { message: "nope" } })]) }), /turned the API key down/)
  await assert.rejects(IG.generate("recraft", { key: "", prompt: "p", photo: photo }), /Add your Recraft API key/)
  await assert.rejects(IG.generate("openai", { key: "k", prompt: "p", photo: photo, fetch: fake([reply(200, { data: [{ b64_json: Buffer.from("hello world!").toString("base64") }] })]) }), /isn't a JPEG, PNG or WebP/)
  await assert.rejects(IG.generate("openai", { key: "k", prompt: "p", photo: photo, fetch: fake([reply(200, { data: [{ url: "http://plain.example/x.png" }] })]) }), /won't follow/)
})

test("a key comes from the environment before the Keychain", () => {
  assert.equal(IG.apiKey("openai", { INKWELL_OPENAI_KEY: " sk-env \n" }, "linux"), "sk-env")
  assert.equal(IG.apiKey("openai", {}, "linux"), "")
})
