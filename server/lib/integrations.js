// The integration library: Composio's catalogue, cut to the popular end and
// marked with what the reader has actually connected.
//
// The catalogue is popularity-ordered by the API, so "the 25 most popular" is
// simply the first 25 after dropping Composio's own meta toolkits and any
// local ones. Nothing is hardcoded, so the page follows the catalogue.

"use strict"

const MAX = 25
const META = /^composio/i

function normalize(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && raw.items) || []
  return arr
    .filter(t => t && typeof t.slug === "string" && t.slug && !t.isLocalToolkit && !META.test(t.slug))
    .map(t => {
      const meta = t.meta || {}
      const cat = (meta.categories && meta.categories[0]) || {}
      return {
        slug: t.slug,
        name: String(t.name || t.slug),
        category: String(cat.name || cat.slug || ""),
        description: String(meta.description || ""),
        logo: String(meta.logo || "")
      }
    })
}

function withState(items, connected, limit) {
  const on = connected instanceof Set ? connected : new Set(connected || [])
  return items.slice(0, limit || MAX).map(i => Object.assign({}, i, { connected: on.has(i.slug) }))
}

export { normalize, withState, MAX }
