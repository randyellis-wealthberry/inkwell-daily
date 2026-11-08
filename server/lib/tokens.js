// Signed, expiring tokens for the public connect redirect.
//
// A card's Connect button is a plain link in a static page, so it cannot carry
// the license. Instead the build embeds a token naming the reader and the
// toolkit; the service verifies it and only then asks Composio for a link. The
// token is a hash, not a credential: it can start a connection for its own
// reader and nothing else.

"use strict"

import { createHmac, timingSafeEqual } from "node:crypto"

function sign(secret, text) {
  return createHmac("sha256", secret).update(text).digest("base64url")
}

function mint(secret, userId, slug, ttlMs, now) {
  const at = now == null ? Date.now() : now
  const exp = Math.floor((at + ttlMs) / 1000)
  const payload = Buffer.from(JSON.stringify({ u: userId, s: slug, e: exp })).toString("base64url")
  return payload + "." + sign(secret, payload)
}

function read(secret, token, now) {
  if (typeof token !== "string" || !token || token.length > 1024) return null
  const dot = token.lastIndexOf(".")
  if (dot < 1) return null
  const payload = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const want = Buffer.from(sign(secret, payload))
  if (given.length !== want.length) return null
  if (!timingSafeEqual(given, want)) return null

  let body
  try { body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) } catch (e) { return null }
  if (!body || typeof body.u !== "string" || typeof body.s !== "string" || typeof body.e !== "number") return null
  if (body.e * 1000 < (now == null ? Date.now() : now)) return null
  return { userId: body.u, slug: body.s }
}

export { mint, read, sign }
