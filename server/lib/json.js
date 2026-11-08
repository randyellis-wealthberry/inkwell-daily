// Reading Composio tool output without trusting its shape.
//
// The toolkit pages document a tool's inputs precisely and its output only as
// `data: string`. In practice that holds an object for some toolkits and a
// JSON string for others, sometimes wrapped once more. Every function here is
// total: it returns nothing rather than throwing, so one odd payload costs a
// desk, never the paper.

"use strict"

function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {} }
function arr(v) { return Array.isArray(v) ? v : [] }
function text(v) { return typeof v === "string" ? v : (typeof v === "number" && isFinite(v) ? String(v) : "") }

function unwrap(result) {
  if (!result || typeof result !== "object") return null
  if (result.resultType === "blocked") return null
  if (result.successful === false) {
    const e = new Error(text(result.error) || "the tool failed")
    e.provider = true
    throw e
  }
  let data = result.data !== undefined ? result.data : result
  if (typeof data === "string") {
    try { data = JSON.parse(data) } catch (e) { return null }
  }
  // Some toolkits answer { data: { ... } } as well as { data: "..." }.
  const o = obj(data)
  if (!Array.isArray(data) && o.data && typeof o.data === "object" && !o.items && !o.messages && !o.events) return o.data
  return data
}

const NESTS = ["data", "response", "result", "payload"]

// The list inside a response whose key nobody documented. Try the likely keys
// at this level, then look one level down under the wrappers Composio uses.
function list(data, keys) {
  if (Array.isArray(data)) return data
  const o = obj(data)
  for (const k of keys) if (Array.isArray(o[k])) return o[k]
  for (const n of NESTS) {
    const inner = o[n]
    if (!inner || typeof inner !== "object") continue
    const found = list(inner, keys)
    if (found.length) return found
  }
  return []
}

// "Ada Lovelace <ada@example.com>" reads as "Ada Lovelace" in a headline.
function person(v) {
  const s = text(v).replace(/\s+/g, " ").trim()
  const named = s.match(/^"?([^"<]+?)"?\s*<[^>]+>$/)
  if (named) return named[1].trim()
  if (/^[^@\s]+@[^@\s]+$/.test(s)) return s.split("@")[0]
  return s
}

export { obj, arr, text, unwrap, list, person }
