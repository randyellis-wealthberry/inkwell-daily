// Limits for everything the builder takes from the network or from another
// plugin's cache. Pure; collect.js does the fetching.

"use strict"

// JSON answers are small; a photo is a few megabytes. Anything bigger is
// refused, not truncated.
const JSON_MAX = 2 << 20
const IMAGE_MAX = 24 << 20
const LOCAL_IMAGE_MAX = 64 << 20
const CACHE_JSON_MAX = 8 << 20
const LINK_MAX = 4096

// Only these hosts may hand the builder a photo to fetch.
const IMAGE_HOSTS = ["upload.wikimedia.org", "thumb.wikimedia.org"]

// curl over HTTPS only, redirects included, with a time and a size limit.
// --max-filesize stops a declared-too-large answer up front; the caller's
// maxBuffer stops a chunked one mid-stream.
function curlArgs(url, maxBytes, seconds, extra) {
  return ["-fsSLg", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "3",
    "--max-time", String(seconds), "--max-filesize", String(maxBytes)].concat(extra || [], ["--", String(url)])
}

function httpsUrl(url, hosts) {
  let u
  try { u = new URL(String(url || "")) } catch (e) { return "" }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return ""
  if (hosts && hosts.indexOf(u.hostname) < 0) return ""
  return u.href
}

// What a picture really is, from its first bytes. Only formats ImageMagick
// reads with a plain raster decoder pass.
function sniffImage(buf) {
  if (!buf || buf.length < 12) return ""
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg"
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return "png"
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp"
  return ""
}

// ImageMagick, told the format outright and held to a budget, so a hostile
// file can't pick another decoder or eat the machine.
function magickArgs(input, type, width, quality, output) {
  return ["-limit", "memory", "256MiB", "-limit", "map", "512MiB", "-limit", "area", "128MP",
    "-limit", "width", "16KP", "-limit", "height", "16KP", "-limit", "time", "60",
    type + ":" + input + "[0]", "-auto-orient", "-resize", width + "x>", "-strip", "-quality", String(quality || 72), "jpeg:" + output]
}

module.exports = { JSON_MAX, IMAGE_MAX, LOCAL_IMAGE_MAX, CACHE_JSON_MAX, LINK_MAX, IMAGE_HOSTS, curlArgs, httpsUrl, sniffImage, magickArgs }
