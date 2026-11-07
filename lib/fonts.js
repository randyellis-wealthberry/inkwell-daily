// Editorial type pairings, all free from Google Fonts. A pairing names the
// masthead face, the body face and the mono face; the page loads exactly the
// families it uses. Unknown ids fall back to the paper's own look.

"use strict"

const FONTS = [
  {
    id: "inkwell", name: "Inkwell",
    blurb: "Blackletter masthead, Newsreader body.",
    url: "https://fonts.googleapis.com/css2?family=UnifrakturCook:wght@700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,800;1,6..72,400&family=JetBrains+Mono:wght@400;600&display=swap",
    plate: '"UnifrakturCook", "Old English Text MT", Georgia, serif',
    serif: '"Newsreader", Georgia, "Times New Roman", serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace'
  },
  {
    id: "broadsheet", name: "Broadsheet",
    blurb: "Playfair Display and Source Serif 4.",
    url: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,800;1,8..60,400&family=IBM+Plex+Mono:wght@400;600&display=swap",
    plate: '"Playfair Display", "Times New Roman", Georgia, serif',
    serif: '"Source Serif 4", Georgia, "Times New Roman", serif',
    mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace'
  },
  {
    id: "gazette", name: "Gazette",
    blurb: "Old masthead, Crimson Pro, Courier Prime.",
    url: "https://fonts.googleapis.com/css2?family=UnifrakturCook:wght@700&family=Crimson+Pro:ital,wght@0,400;0,600;0,800;1,400&family=Courier+Prime:wght@400;700&display=swap",
    plate: '"UnifrakturCook", "Old English Text MT", Georgia, serif',
    serif: '"Crimson Pro", Georgia, "Times New Roman", serif',
    mono: '"Courier Prime", ui-monospace, Menlo, monospace'
  },
  {
    id: "modern", name: "Modern",
    blurb: "DM Serif Display and Inter.",
    url: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap",
    plate: '"DM Serif Display", "Times New Roman", Georgia, serif',
    serif: '"Inter", Georgia, "Helvetica Neue", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace'
  },
  {
    id: "bodoni", name: "Bodoni",
    blurb: "Bodoni Moda, Lora and Space Mono.",
    url: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;0,6..96,800;1,6..96,400&family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Space+Mono:wght@400;700&display=swap",
    plate: '"Bodoni Moda", "Times New Roman", Georgia, serif',
    serif: '"Lora", Georgia, "Times New Roman", serif',
    mono: '"Space Mono", ui-monospace, Menlo, monospace'
  },
  {
    id: "weekend", name: "Weekend",
    blurb: "Abril Fatface, Lora and DM Mono.",
    url: "https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500&display=swap",
    plate: '"Abril Fatface", "Times New Roman", Georgia, serif',
    serif: '"Lora", Georgia, "Times New Roman", serif',
    mono: '"DM Mono", ui-monospace, Menlo, monospace'
  },
  {
    id: "literary", name: "Literary",
    blurb: "Cormorant Garamond, EB Garamond and Inconsolata.",
    url: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,600;0,800;1,400&family=Inconsolata:wght@400;600&display=swap",
    plate: '"Cormorant Garamond", "Times New Roman", Georgia, serif',
    serif: '"EB Garamond", Georgia, "Times New Roman", serif',
    mono: '"Inconsolata", ui-monospace, Menlo, monospace'
  }
]

const DEFAULT_ID = "inkwell"

function slug(s) {
  return String(s || "").toLowerCase().replace(/[\s_-]+/g, "")
}

function byId(id) {
  const key = slug(id)
  if (!key) return null
  for (const f of FONTS) if (slug(f.id) === key || slug(f.name) === key) return f
  return null
}

function get(id) {
  return byId(id) || FONTS[0]
}

module.exports = { FONTS, DEFAULT_ID, byId, get }
