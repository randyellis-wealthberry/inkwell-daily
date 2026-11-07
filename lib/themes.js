// Perks for the habit. The first one is a set of milestone themes: mornings
// opened in the read ledger earn a palette, and a palette is kept once earned.
// "auto" follows the system's light or dark, and is always available.

"use strict"

const THEMES = [
  {
    id: "auto", name: "Auto", at: 0, perk: false,
    blurb: "Light or dark, following your Mac.",
    palette: null
  },
  {
    id: "firstlight", name: "First Light", at: 3,
    blurb: "A warm dawn for the first mornings.",
    palette: {
      mode: "light",
      background: "#fbf4ea", darkBackground: "#f3e7d8",
      foreground: "#5a4738", brightForeground: "#2a1e16", darkForeground: "#8a7660",
      muted: "#b7a48d", accent: "#b25b3d", yellow: "#a8752f",
      red: "#a33a2a", green: "#53703d"
    }
  },
  {
    id: "sunday", name: "Sunday Paper", at: 7,
    blurb: "Newsprint, navy and a long breakfast.",
    palette: {
      mode: "light",
      background: "#f4f0e6", darkBackground: "#e8e2d3",
      foreground: "#3b3a34", brightForeground: "#151513", darkForeground: "#6e6a5d",
      muted: "#a6a08f", accent: "#2f4f6f", yellow: "#8a5a12",
      red: "#8c2f27", green: "#40603a"
    }
  },
  {
    id: "nocturne", name: "Nocturne", at: 14,
    blurb: "Cool ink for the night shift.",
    palette: {
      mode: "dark",
      background: "#151a23", darkBackground: "#0d1118",
      foreground: "#aeb8c9", brightForeground: "#eef1f7", darkForeground: "#6d788a",
      muted: "#4a5567", accent: "#86a9d6", yellow: "#c9a45c",
      red: "#d06a63", green: "#8bb37a"
    }
  },
  {
    id: "sepia", name: "Sepia", at: 30,
    blurb: "Aged paper and copper ink.",
    palette: {
      mode: "light",
      background: "#efe1c9", darkBackground: "#e2d0b2",
      foreground: "#5a432e", brightForeground: "#2a1c11", darkForeground: "#7a6449",
      muted: "#b39a76", accent: "#8a4b2a", yellow: "#9a6a25",
      red: "#8f3327", green: "#5a6b3a"
    }
  },
  {
    id: "gilt", name: "Gilt", at: 60,
    blurb: "Gold leaf on ivory.",
    palette: {
      mode: "light",
      background: "#f7f0dc", darkBackground: "#ece1c4",
      foreground: "#4a3d22", brightForeground: "#1d1708", darkForeground: "#7d6a43",
      muted: "#c0ad82", accent: "#9a6b1e", yellow: "#a8791f",
      red: "#8e3a2b", green: "#4f6334"
    }
  },
  {
    id: "century", name: "Century", at: 100,
    blurb: "Deep green, brass, a hundred mornings.",
    palette: {
      mode: "dark",
      background: "#101a16", darkBackground: "#08110d",
      foreground: "#b9cbb9", brightForeground: "#edf4ea", darkForeground: "#71856f",
      muted: "#485c50", accent: "#c9a45c", yellow: "#d8b979",
      red: "#c06a5c", green: "#8fbf8a"
    }
  }
]

function slug(s) {
  return String(s || "").toLowerCase().replace(/[\s_-]+/g, "")
}

function byId(id) {
  const key = slug(id)
  if (!key) return null
  for (const t of THEMES) if (slug(t.id) === key || slug(t.name) === key) return t
  return null
}

// The perk themes, with their state for a given number of mornings.
function perks(mornings, activeId) {
  const total = Math.max(0, Math.floor(Number(mornings) || 0))
  const list = THEMES.filter(t => t.perk !== false).map(t => ({
    id: t.id, name: t.name, at: t.at, blurb: t.blurb, palette: t.palette,
    unlocked: total >= t.at,
    active: t.id === activeId,
    remaining: Math.max(0, t.at - total)
  }))
  return {
    mornings: total,
    themes: list,
    unlocked: list.filter(t => t.unlocked).length,
    total: list.length,
    active: activeId || "auto",
    next: list.find(t => !t.unlocked) || null
  }
}

// What the paper should actually use. A locked or unknown choice falls back
// to auto rather than failing the edition.
function resolve(id, mornings, autoPalette) {
  const wanted = byId(id)
  const total = Math.max(0, Math.floor(Number(mornings) || 0))
  if (!wanted || wanted.id === "auto") return { id: "auto", name: "Auto", palette: autoPalette || null, locked: null }
  if (total < wanted.at) {
    return {
      id: "auto", name: "Auto", palette: autoPalette || null,
      locked: { id: wanted.id, name: wanted.name, at: wanted.at, remaining: wanted.at - total }
    }
  }
  return { id: wanted.id, name: wanted.name, palette: wanted.palette, locked: null }
}

module.exports = { THEMES, byId, perks, resolve }
