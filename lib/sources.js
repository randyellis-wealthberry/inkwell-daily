// Sources: the plugin interface. A package (Inkwell Pro, or your own) adds
// sections to the paper by exporting
//
//   module.exports = { sources: [{ id, name, collect(ctx) }] }
//
// collect(ctx) gets { key, from, to, net, config, dataDir } and returns, or
// resolves to, null or:
//
//   { sections:    [{ kicker, headline, deck, note, items: [{ time, title, detail, tag }] }],
//     meter:       [{ label, value }],
//     classifieds: [{ kind, text, code }] }
//
// Everything a source returns is untrusted: it's cut to size and kept to
// plain strings here, and escaped when the page is set.

"use strict"

const path = require("node:path")
const { createRequire } = require("node:module")

const LIMITS = { sections: 4, items: 12, meter: 6, classifieds: 6 }

function str(v, max) {
  return typeof v === "string" || (typeof v === "number" && isFinite(v)) ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function arr(v, max) { return Array.isArray(v) ? v.slice(0, max) : [] }

function cleanResult(r, source) {
  if (!r || typeof r !== "object") return null
  const sections = arr(r.sections, LIMITS.sections).map(s => s && typeof s === "object" ? {
    source: source.name,
    kicker: str(s.kicker, 80) || source.name,
    headline: str(s.headline, 140),
    deck: str(s.deck, 260),
    note: str(s.note, 400),
    items: arr(s.items, LIMITS.items).map(i => i && typeof i === "object" ? {
      time: str(i.time, 20), title: str(i.title, 160), detail: str(i.detail, 300), tag: str(i.tag, 30)
    } : null).filter(i => i && (i.title || i.detail))
  } : null).filter(s => s && s.headline)
  const meter = arr(r.meter, LIMITS.meter).map(m => m && { label: str(m.label, 60), value: str(m.value, 30) }).filter(m => m && m.label && m.value)
  const classifieds = arr(r.classifieds, LIMITS.classifieds).map(c => c && {
    kind: ["WANTED", "NOTICE", "SEEKING"].includes(c.kind) ? c.kind : "NOTICE", text: str(c.text, 240), code: str(c.code, 120)
  }).filter(c => c && c.text)
  return { sections, meter, classifieds }
}

// Where an installed package can be found: the paper's own folder, then
// npm's global folder beside this node.
function searchPaths(dataDir) {
  const bin = path.dirname(process.execPath)
  return [
    path.join(dataDir, "node_modules"),
    process.platform === "win32" ? path.join(bin, "node_modules") : path.join(bin, "..", "lib", "node_modules"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules") : ""
  ].filter(Boolean)
}

function loadModule(file) {
  // `createRequire` keeps plugin loading working when this file is bundled
  // into a standalone executable, where the global `require` only knows
  // Node's built-in modules.
  return createRequire(path.join(process.cwd(), "inkwell-daily-plugin-loader.cjs"))(file)
}

// Inkwell Pro if it's installed, plus anything named in config.json's
// "plugins" (package names or absolute paths).
function loadPlugins(cfg, dataDir, log) {
  const names = ["inkwell-pro"].concat(Array.isArray(cfg.plugins) ? cfg.plugins : [])
  const out = []
  const seen = new Set()
  for (const name of names) {
    let file = ""
    try { file = require.resolve(name, { paths: searchPaths(dataDir) }) } catch (e) {
      if (name !== "inkwell-pro" && log) log("plugin " + name + " not found")
      continue
    }
    if (seen.has(file)) continue
    seen.add(file)
    try {
      const mod = loadModule(file)
      for (const s of Array.isArray(mod.sources) ? mod.sources : []) {
        if (s && typeof s.id === "string" && typeof s.collect === "function") out.push({ id: s.id, name: str(s.name, 40) || s.id, collect: s.collect, plugin: name })
      }
      if (mod.status && log) log(name + ": " + str(mod.status, 200))
    } catch (e) {
      if (log) log("plugin " + name + " failed to load: " + str(e && e.message, 200))
    }
  }
  return out
}

// Runs each source in turn. One that throws becomes a note, never a failed paper.
async function collectAll(sources, ctx, cfg) {
  const results = []
  for (const s of sources) {
    const settings = cfg && cfg.sources && typeof cfg.sources[s.id] === "object" ? cfg.sources[s.id] : {}
    if (settings.enabled === false) continue
    try {
      const r = cleanResult(await s.collect(Object.assign({}, ctx, { config: settings })), s)
      if (r) results.push(r)
    } catch (e) {
      results.push({ sections: [{ source: s.name, kicker: s.name, headline: s.name + " didn't report", deck: "", note: str(e && e.message, 300), items: [] }], meter: [], classifieds: [] })
    }
  }
  return {
    sections: results.flatMap(r => r.sections),
    meter: results.flatMap(r => r.meter),
    classifieds: results.flatMap(r => r.classifieds)
  }
}

module.exports = { loadPlugins, collectAll, cleanResult, searchPaths }
