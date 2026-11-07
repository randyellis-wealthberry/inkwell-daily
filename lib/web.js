// The web copy: the same edition, with its photos as files beside the page
// instead of inside it, and without the links that only lead somewhere on
// this machine. Pure; the publisher does the writing.

"use strict"

const crypto = require("node:crypto")

const IMAGE = /data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)/g

function webCopy(html) {
  const images = []
  const seen = {}
  let out = String(html || "").replace(IMAGE, function (m, type, b64) {
    const ext = type === "jpeg" ? "jpg" : type
    const name = "img/" + crypto.createHash("sha1").update(b64).digest("hex").slice(0, 12) + "." + ext
    if (!seen[name]) { seen[name] = true; images.push({ path: name, data: Buffer.from(b64, "base64") }) }
    return name
  })
  // Back issues stay on the machine, so their links go.
  out = out.replace(/<nav class="issues"[\s\S]*?<\/nav>/, "").replace(/<aside class="yearago">[\s\S]*?<\/aside>/, "")
  return { html: out, images: images }
}

// The only names a web copy's photo can have. Anything else in last time's
// state never reaches the publishing prompt.
const FILE = /^img\/[0-9a-f]{12}\.(jpg|png|webp)$/

// What changes between the last publish and this one: files to add, and
// files to remove so a year of photos doesn't pile up.
function fileChanges(previous, current) {
  const now = {}
  for (const p of current) now[p] = true
  const before = Array.isArray(previous) ? previous.filter(p => typeof p === "string" && FILE.test(p)) : []
  return { keep: current.filter(p => FILE.test(p)), remove: before.filter(p => !now[p]) }
}

module.exports = { webCopy, fileChanges, FILE }
