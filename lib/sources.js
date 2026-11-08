// Sources: the plugin interface. A package (Inkwell Pro, or your own) adds
// desks to the paper by exporting
//
//   module.exports = { sources: [{ id, name, desk, collect(ctx) }] }
//
// `desk` names the standing feature the source fills: "mail", "city",
// "notebook", "daybook" or "project". A source without one is an "other"
// desk and prints in the back-page fallback, so the five named homes never
// move.
//
// collect(ctx) gets { key, from, to, net, config, dataDir } and returns, or
// resolves to, null or:
//
//   { state: "open" | "empty" | "expired" | "offline" | "error" | "closed",
//     lastSet: "6:40 am",
//     action: { label: "Reconnect Gmail", href: "inkwell-daily://desk?..." },
//     sections:    [{ kicker, headline, deck, note, items: [{ time, title, detail, tag }] }],
//     meter:       [{ label, value }],
//     classifieds: [{ kind, text, code }] }
//
// Everything a source returns is untrusted: it's cut to size and kept to
// plain strings here, and escaped when the page is set. The desk id and the
// action's scheme are chosen by the loader, never by the answer.

"use strict"

const path = require("node:path")
const { createRequire } = require("node:module")

const LIMITS = { sections: 4, items: 12, meter: 6, classifieds: 6 }
const PRO_PLUGIN = "inkwell-pro"
const DESKS = ["mail", "city", "notebook", "daybook", "project"]
const STATES = ["open", "empty", "expired", "offline", "error", "closed"]

// The product a source id belongs to, when the package doesn't say.
const DESK_BY_ID = {
  gmail: "mail",
  slack: "city",
  notion: "notebook",
  calendar: "daybook",
  googlecalendar: "daybook",
  gcal: "daybook",
  basecamp: "project"
}

function str(v, max) {
  return typeof v === "string" || (typeof v === "number" && isFinite(v)) ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : ""
}

function arr(v, max) { return Array.isArray(v) ? v.slice(0, max) : [] }

// The slot a source fills. The manifest wins; an id maps to a known desk as
// a convenience; everything else is the fallback.
function deskOf(source) {
  const declared = source && typeof source.desk === "string" ? source.desk : ""
  if (DESKS.includes(declared) || declared === "other") return declared
  const id = String(source && source.id || "").toLowerCase().replace(/[^a-z]/g, "")
  return DESK_BY_ID[id] || "other"
}

// An action only leads somewhere the paper can open: the menu bar app's own
// scheme, or a hosted connect page. Anything else is shown as plain text.
function safeHref(href) {
  const s = str(href, 300)
  return /^(inkwell-daily:\/\/|https:\/\/)/i.test(s) ? s : ""
}

function cleanAction(a) {
  if (!a || typeof a !== "object") return null
  const label = str(a.label, 60)
  if (!label) return null
  return { label: label, href: safeHref(a.href) }
}

function cleanResult(r, source) {
  if (!r || typeof r !== "object") return null
  const desk = deskOf(source)
  const state = STATES.includes(r.state) ? r.state : (Array.isArray(r.sections) && r.sections.length ? "open" : "closed")
  const sections = arr(r.sections, LIMITS.sections).map((s, i) => s && typeof s === "object" ? {
    source: source.name,
    desk: i === 0 ? desk : "other",
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
  return { desk, state, lastSet: str(r.lastSet, 80), action: cleanAction(r.action), sections, meter, classifieds }
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
  const names = [PRO_PLUGIN].concat(Array.isArray(cfg.plugins) ? cfg.plugins : [])
  const out = []
  const seen = new Set()
  for (const name of names) {
    let file = ""
    try { file = require.resolve(name, { paths: searchPaths(dataDir) }) } catch (e) {
      if (name !== PRO_PLUGIN && log) log("plugin " + name + " not found")
      continue
    }
    if (seen.has(file)) continue
    seen.add(file)
    try {
      const mod = loadModule(file)
      for (const s of Array.isArray(mod.sources) ? mod.sources : []) {
        if (s && typeof s.id === "string" && typeof s.collect === "function") out.push({ id: s.id, name: str(s.name, 40) || s.id, desk: deskOf(s), collect: s.collect, plugin: name })
      }
      if (mod.status && log) log(name + ": " + str(mod.status, 200))
    } catch (e) {
      if (log) log("plugin " + name + " failed to load: " + str(e && e.message, 200))
    }
  }
  return out
}

// Whether Inkwell Pro is among the loaded sources. The free paper uses this
// to decide whether its Pro notice is still needed.
function hasPro(sources) {
  return (sources || []).some(s => s && s.plugin === PRO_PLUGIN)
}

// The action a desk's directory row uses when the source doesn't name one.
function defaultAction(id, name, state) {
  const product = name || "desk"
  const label = state === "expired" ? "Reconnect " + product : state === "error" ? "Retry " + product : state === "closed" ? "Connect " + product : "Manage " + product
  return { label: label, href: "inkwell-daily://desk?desk=" + encodeURIComponent(String(id || "")) }
}

// Runs each source in turn. One that throws becomes a note, never a failed
// paper. Every source leaves a desk record, even when it is closed, so the
// back-page directory can list it without a section.
async function collectAll(sources, ctx, cfg) {
  const out = { sections: [], meter: [], classifieds: [], desks: [] }
  for (const s of sources) {
    const settings = cfg && cfg.sources && typeof cfg.sources[s.id] === "object" ? cfg.sources[s.id] : {}
    const desk = deskOf(s)
    if (settings.enabled === false) {
      out.desks.push({ id: s.id, name: s.name, desk, state: "closed", disabled: true, action: defaultAction(s.id, s.name, "closed") })
      continue
    }
    try {
      const r = cleanResult(await s.collect(Object.assign({}, ctx, { config: settings })), s)
      if (r) {
        const section = r.sections[0] || null
        out.desks.push({
          id: s.id, name: s.name, desk: r.desk, state: r.state, lastSet: r.lastSet,
          action: r.action || defaultAction(s.id, s.name, r.state), section, note: section ? section.note : ""
        })
        out.sections.push(...r.sections)
        out.meter.push(...r.meter)
        out.classifieds.push(...r.classifieds)
      } else {
        out.desks.push({ id: s.id, name: s.name, desk, state: "closed", action: defaultAction(s.id, s.name, "closed") })
      }
    } catch (e) {
      const note = str(e && e.message, 300)
      const section = { source: s.name, desk, kicker: s.name, headline: s.name + " didn't report", deck: "", note, items: [] }
      out.sections.push(section)
      out.desks.push({ id: s.id, name: s.name, desk, state: "error", note, action: defaultAction(s.id, s.name, "error"), section })
    }
  }
  return out
}

module.exports = { loadPlugins, collectAll, cleanResult, searchPaths, hasPro, deskOf, safeHref, defaultAction, PRO_PLUGIN, DESKS, STATES }
