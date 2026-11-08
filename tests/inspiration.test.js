const test = require("node:test")
const assert = require("node:assert/strict")
const I = require("../lib/inspiration.js")
const { webCopy } = require("../lib/web.js")

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
const reply = (status, body) => ({ ok: status < 300, status: status, json: async () => body })

test("the same date always gets the same scene and quote", () => {
  assert.deepEqual(I.pick("2026-11-06"), I.pick("2026-11-06"))
  const days = new Set(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map(k => I.pick(k).quote))
  assert.ok(days.size > 1, "and the days differ")
  for (const q of I.QUOTES) assert.ok(q[0] && q[1], "every quote has its author")
})

test("the prompt asks for a photograph with room for the quote and no words of its own", () => {
  const p = I.prompt("a lighthouse")
  assert.match(p, /a lighthouse/)
  assert.match(p, /upper third/)
  assert.match(p, /no text or lettering/)
})

test("only Recraft makes the day's picture, and no headshot is involved", () => {
  const key = svc => "k-" + svc
  assert.equal(I.settings({}, key).generator, null)
  assert.equal(I.settings({ headlines: { service: "openai", consent: true } }, key).generator, null)
  assert.deepEqual(I.settings({ headlines: { service: "recraft" } }, key).generator, { service: "recraft", model: "", key: "k-recraft" })
  assert.equal(I.settings({ headlines: { enabled: false, service: "recraft" } }, key).enabled, false)
})

test("Recraft is asked for a wide photograph from words alone", async () => {
  const calls = []
  const fetch = async (url, init) => { calls.push({ url, init }); return reply(200, { data: [{ b64_json: PNG.toString("base64") }] }) }
  const p = await I.picture("2026-11-06", { service: "recraft", model: "", key: "rk" }, { fetch })
  assert.equal(calls[0].url, "https://external.api.recraft.ai/v1/images/generations")
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.size, "16:9")
  assert.equal(body.model, undefined, "Recraft picks its own model unless you name one")
  assert.match(p.image, /^data:image\/png;base64,/)
  assert.equal(p.quote, I.pick("2026-11-06").quote)
  assert.equal(p.provider, "recraft")
})

test("a failing service says why instead of breaking the paper", async () => {
  const fetch = async () => reply(401, {})
  assert.match((await I.picture("2026-11-06", { service: "recraft", key: "bad" }, { fetch })).problem, /turned the API key down/)
  assert.match((await I.picture("2026-11-06", { service: "recraft", key: "" })).problem, /Add your Recraft API key/)
  assert.equal(await I.picture("2026-11-06", null), null)
})

test("the day's picture goes on the web copy; a headshot portrait never does", () => {
  const pic = '<figure class="portrait inspiration" data-date="d"><img src="data:image/png;base64,' + PNG.toString("base64") + '"></figure>'
  assert.equal(webCopy(pic).images.length, 1)
  assert.equal(webCopy('<figure class="portrait screen"><img src="data:image/png;base64,' + PNG.toString("base64") + '"></figure>').html, "")
})
