// The image services Make headlines can draw the portrait with. Each takes
// one headshot and a prompt and answers with the picture's bytes, or throws
// with a reason a person can read. Keys come from the Keychain on a Mac
// (Settings puts them there) or from INKWELL_<SERVICE>_KEY; never config.json.

"use strict"

const { execFileSync } = require("node:child_process")

const F = require("./fetch.js")

const TIMEOUT = 120000
const KEYCHAIN = "com.wealthberrylabs.inkwell-daily."

const SERVICES = {
  openai: { name: "OpenAI (GPT Image)", model: "gpt-image-2", key: true },
  // Recraft has no face reference, and image-to-image redraws the face at
  // any strength that changes the scene. Replace background keeps the
  // person exactly as photographed and draws only the scene around them.
  recraft: { name: "Recraft", model: "", key: true },
  higgsfield: { name: "Higgsfield", model: "higgsfield/ads-studio/v1.0", key: true },
  command: { name: "Your own command", model: "", key: false }
}

function apiKey(service, env, platform) {
  env = env || process.env
  const fromEnv = env["INKWELL_" + service.toUpperCase() + "_KEY"]
  if (fromEnv) return fromEnv.trim()
  if ((platform || process.platform) !== "darwin") return ""
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN + service, "-a", "api-key", "-w"],
      { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch (e) {
    return ""
  }
}

function mime(type) {
  return "image/" + type
}

async function failed(res, who) {
  let detail = ""
  try { const j = await res.json(); detail = (j.error && (j.error.message || j.error)) || j.message || j.detail || "" } catch (e) {}
  if (res.status === 401 || res.status === 403) return new Error(who + " turned the API key down. Check it in Settings.")
  return new Error(who + " answered " + res.status + (detail ? ": " + String(detail).slice(0, 160) : "") + ".")
}

// A finished picture behind a link: https only, and no bigger than a photo.
async function download(url, doFetch) {
  if (!/^https:\/\//.test(String(url))) throw new Error("The service sent back a link Inkwell won't follow.")
  const res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error("Couldn't download the finished picture (" + res.status + ").")
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > F.IMAGE_MAX) throw new Error("The finished picture is too big to print.")
  return buf
}

function form(fields, photo, field) {
  const f = new FormData()
  for (const k in fields) if (fields[k] !== undefined && fields[k] !== "") f.append(k, String(fields[k]))
  f.append(field || "image", new Blob([photo.bytes], { type: mime(photo.type) }), "headshot." + (photo.type === "jpeg" ? "jpg" : photo.type))
  return f
}

const CALLS = {
  // POST /v1/images/edits: the headshot as the image to edit; GPT Image
  // models answer in base64.
  async openai(o) {
    const res = await o.fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: "Bearer " + o.key },
      body: form({ model: o.model, prompt: o.prompt, size: "1024x1024", n: 1 }, o.photo),
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!res.ok) throw await failed(res, "OpenAI")
    const item = ((await res.json()).data || [])[0] || {}
    if (item.b64_json) return Buffer.from(item.b64_json, "base64")
    if (item.url) return download(item.url, o.fetch)
    throw new Error("OpenAI sent back no picture.")
  },

  // POST /v1/images/replaceBackground: the prompt describes only the new
  // scene, since the person is kept, not drawn.
  async recraft(o) {
    const res = await o.fetch("https://external.api.recraft.ai/v1/images/replaceBackground", {
      method: "POST", headers: { Authorization: "Bearer " + o.key },
      body: form({ model: o.model, prompt: o.scene || o.prompt, response_format: "b64_json" }, o.photo),
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!res.ok) throw await failed(res, "Recraft")
    const item = ((await res.json()).data || [])[0] || {}
    if (item.b64_json) return Buffer.from(item.b64_json, "base64")
    if (item.url) return download(item.url, o.fetch)
    throw new Error("Recraft sent back no picture.")
  },

  // Higgsfield wants the headshot uploaded first, then a queued request
  // that names it by URL, polled until it's done. The key is KEY_ID:SECRET.
  async higgsfield(o) {
    const base = "https://api.higgsfield.ai"
    const auth = { Authorization: "Key " + o.key, "Content-Type": "application/json" }
    const up = await o.fetch(base + "/files/generate-upload-url", { method: "POST", headers: auth, body: JSON.stringify({ content_type: mime(o.photo.type) }), signal: AbortSignal.timeout(TIMEOUT) })
    if (!up.ok) throw await failed(up, "Higgsfield")
    const slot = await up.json()
    // The upload URL gets only its own headers, never the key.
    const put = await o.fetch(slot.upload_url, { method: "PUT", headers: slot.upload_headers || { "Content-Type": mime(o.photo.type) }, body: o.photo.bytes, signal: AbortSignal.timeout(TIMEOUT) })
    if (!put.ok) throw new Error("Higgsfield didn't take the headshot upload (" + put.status + ").")
    const path = String(o.model || SERVICES.higgsfield.model).replace(/^\/+/, "")
    if (!/^[\w.\/-]+$/.test(path)) throw new Error("That Higgsfield model path doesn't look right.")
    const sub = await o.fetch(base + "/" + path, { method: "POST", headers: auth, body: JSON.stringify({ prompt: o.prompt, image_urls: [slot.public_url] }), signal: AbortSignal.timeout(TIMEOUT) })
    if (!sub.ok) throw await failed(sub, "Higgsfield")
    let job = await sub.json()
    const statusUrl = job.status_url
    const deadline = Date.now() + TIMEOUT
    let wait = 2000
    while (!["completed", "failed", "nsfw", "canceled"].includes(job.status)) {
      if (!statusUrl || !statusUrl.startsWith(base + "/")) throw new Error("Higgsfield didn't say where to check on the picture.")
      if (Date.now() > deadline) throw new Error("Higgsfield took longer than " + TIMEOUT / 1000 + " seconds.")
      await o.sleep(wait)
      wait = Math.min(wait * 1.5, 10000)
      const st = await o.fetch(statusUrl, { headers: { Authorization: "Key " + o.key }, signal: AbortSignal.timeout(TIMEOUT) })
      if (!st.ok) throw await failed(st, "Higgsfield")
      job = await st.json()
    }
    if (job.status !== "completed") throw new Error("Higgsfield stopped: " + job.status + ".")
    const url = ((job.images || [])[0] || {}).url
    if (!url) throw new Error("Higgsfield sent back no picture.")
    return download(url, o.fetch)
  }
}

// A picture from words alone. Recraft only for now: POST /v1/images/generations.
const SCENE_CALLS = {
  async recraft(o) {
    const body = { prompt: o.prompt, n: 1, size: "16:9", response_format: "b64_json" }
    if (o.model) body.model = o.model
    const res = await o.fetch("https://external.api.recraft.ai/v1/images/generations", {
      method: "POST", headers: { Authorization: "Bearer " + o.key, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!res.ok) throw await failed(res, "Recraft")
    const item = ((await res.json()).data || [])[0] || {}
    if (item.b64_json) return Buffer.from(item.b64_json, "base64")
    if (item.url) return download(item.url, o.fetch)
    throw new Error("Recraft sent back no picture.")
  }
}

async function scene(service, opts) {
  const call = SCENE_CALLS[service]
  if (!call) throw new Error(SERVICES[service] ? SERVICES[service].name + " can't make the day's picture yet." : "Inkwell doesn't know the image service " + service + ".")
  if (!opts.key) throw new Error("Add your " + SERVICES[service].name + " API key in Settings.")
  const bytes = await call({ key: opts.key, model: opts.model, prompt: opts.prompt, fetch: opts.fetch || fetch })
  if (!F.sniffImage(bytes)) throw new Error(SERVICES[service].name + " sent back something that isn't a JPEG, PNG or WebP.")
  if (bytes.length > F.IMAGE_MAX) throw new Error("The picture came back too big to print.")
  return bytes
}

// The picture's bytes from a service, given the headshot's bytes and type.
async function generate(service, opts) {
  const call = CALLS[service]
  if (!call) throw new Error("Inkwell doesn't know the image service " + service + ".")
  if (!opts.key) throw new Error("Add your " + SERVICES[service].name + " API key in Settings.")
  const bytes = await call({
    key: opts.key, model: opts.model || SERVICES[service].model, prompt: opts.prompt, scene: opts.scene, photo: opts.photo,
    fetch: opts.fetch || fetch, sleep: opts.sleep || (ms => new Promise(r => setTimeout(r, ms)))
  })
  if (!F.sniffImage(bytes)) throw new Error(SERVICES[service].name + " sent back something that isn't a JPEG, PNG or WebP.")
  return bytes
}

module.exports = { SERVICES, KEYCHAIN, apiKey, generate, scene }
