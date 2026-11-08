// The integration library is optional. If a desks service is configured with a
// license, the build asks it for the 25 most popular integrations and whether
// this reader has each one. Any failure means no page, never a failed paper.

"use strict"

const TIMEOUT_MS = 15000
const MAX_BYTES = 512 * 1024

function isLoopback(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}

// The license travels in a header, so plain http is allowed only to this machine.
function secure(url) {
  let u
  try { u = new URL(String(url || "")) } catch (e) { return false }
  if (u.protocol === "https:") return true
  return u.protocol === "http:" && isLoopback(u.hostname)
}

// The plugin and the menu bar app both write the service URL and license into a
// source's settings, under different names. Either is enough.
function settings(cfg) {
  const sources = (cfg && cfg.sources) || {}
  for (const key of Object.keys(sources)) {
    const s = sources[key] || {}
    const url = s.url || s.proxyUrl
    if (url && s.license) return { url: String(url).replace(/\/+$/, ""), license: String(s.license) }
  }
  const url = process.env.INKWELL_PRO_API
  const license = process.env.INKWELL_PRO_LICENSE
  return url && license ? { url: String(url).replace(/\/+$/, ""), license: String(license) } : null
}

async function library(cfg, net) {
  if (net === false) return null
  const s = settings(cfg)
  if (!s || !secure(s.url)) return null

  try {
    const res = await fetch(s.url + "/integrations", {
      headers: { authorization: "Bearer " + s.license, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null
    const text = await res.text()
    if (text.length > MAX_BYTES) return null
    const body = JSON.parse(text)
    if (!body || body.ok !== true || !Array.isArray(body.integrations)) return null
    return body
  } catch (e) {
    return null
  }
}

module.exports = { library, settings, secure }
