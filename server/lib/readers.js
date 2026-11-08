// The section readers.
//
// One entry per integration that can print something in the paper. This file is
// also the session's tool allowlist: a tool that is not named here cannot run,
// so "read-only" is structural. Each reader gets an `exec(slug, args)` that
// runs against the reader's own session and returns the shaped part.

"use strict"

import * as J from "./json.js"
import { clock } from "./desks.js"

const { obj, arr, text } = J

function stamp(v) {
  const s = text(v)
  if (!s) return 0
  const d = new Date(s)
  return isNaN(d) ? 0 : d.getTime()
}

// Some toolkits wrap a list twice ({ issues: { nodes: [] } }); look one level
// deeper before giving up.
function rows(raw, keys) {
  const direct = J.list(raw, keys)
  if (direct.length) return direct
  for (const v of Object.values(obj(raw))) {
    if (v && typeof v === "object") {
      const found = J.list(v, keys)
      if (found.length) return found
    }
  }
  return []
}

function reasonTag(reason) {
  switch (text(reason)) {
    case "review_requested": return "Review"
    case "mention": case "team_mention": return "Mention"
    case "assign": return "Assigned"
    case "ci_activity": return "CI"
    case "state_change": return "State"
    case "subscribed": return "Watching"
    default: return ""
  }
}

function kind(mime) {
  const m = text(mime)
  if (/folder/.test(m)) return "Folder"
  if (/spreadsheet/.test(m)) return "Sheet"
  if (/presentation/.test(m)) return "Slides"
  if (/document/.test(m)) return "Doc"
  if (/pdf/.test(m)) return "PDF"
  if (/image/.test(m)) return "Image"
  return ""
}

const SECTIONS = {
  code: { title: "The Code Desk", noun: "things waiting" },
  shelf: { title: "The Shelf", noun: "files touched" },
  project: { title: "The Project Desk", noun: "open items" },
  social: { title: "The Social Desk", noun: "mentions" },
  money: { title: "The Money Desk", noun: "moves" }
}

const READERS = [
  {
    id: "github", app: "GitHub", toolkit: "github", section: "code",
    tools: ["GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER"],
    async read(exec) {
      const raw = J.unwrap(await exec("GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER", { state: "open", per_page: 20 }))
      const items = rows(raw, ["issues", "items"]).map(i => {
        const o = obj(i)
        const repo = obj(o.repository)
        const label = obj(arr(o.labels)[0])
        return {
          at: stamp(o.updated_at || o.updatedAt),
          app: "GitHub",
          title: text(repo.full_name || repo.name) || "GitHub",
          detail: (o.number ? "#" + text(o.number) + " " : "") + text(o.title),
          tag: text(label.name) || (text(o.state) === "open" ? "Open" : text(o.state))
        }
      }).filter(i => i.detail)
      return { kicker: "GitHub", headline: items.length ? items.length + " assigned" : "", items }
    }
  },
  {
    id: "linear", app: "Linear", toolkit: "linear", section: "code",
    tools: ["LINEAR_GET_CURRENT_USER", "LINEAR_LIST_LINEAR_ISSUES"],
    async read(exec) {
      const me = J.unwrap(await exec("LINEAR_GET_CURRENT_USER", {}))
      const id = text(obj(me).id)
      if (!id) return null
      const raw = J.unwrap(await exec("LINEAR_LIST_LINEAR_ISSUES", { assignee_id: id, first: 20 }))
      const items = rows(raw, ["issues", "nodes", "items"]).map(i => {
        const o = obj(i)
        const state = obj(o.state)
        return {
          at: stamp(o.updatedAt || o.updated_at),
          app: "Linear",
          title: text(o.identifier) || "Issue",
          detail: text(o.title),
          tag: text(state.name),
          stateType: text(state.type)
        }
      }).filter(i => i.detail && !/completed|canceled/i.test(i.stateType))
      return { kicker: "Linear", headline: items.length ? items.length + " assigned" : "", items }
    }
  },
  {
    id: "googledrive", app: "Google Drive", toolkit: "googledrive", section: "shelf",
    tools: ["GOOGLEDRIVE_LIST_FILES"],
    async read(exec, ctx) {
      const q = "modifiedTime > '" + ctx.date + "T00:00:00' and modifiedTime < '" + ctx.until + "T00:00:00'"
      const raw = J.unwrap(await exec("GOOGLEDRIVE_LIST_FILES", { q: q, orderBy: "modifiedTime desc", pageSize: 10 }))
      const items = rows(raw, ["files", "items"]).map(f => {
        const o = obj(f)
        return { at: stamp(o.modifiedTime), app: "Google Drive", title: text(o.name) || "Untitled", detail: kind(o.mimeType), tag: "" }
      }).filter(i => i.title)
      return { kicker: "Drive", headline: items.length ? items.length + " files touched" : "", items }
    }
  }
]

// Toolkits and tools the session must enable for the readers above.
const READER_TOOLS = {}
for (const r of READERS) READER_TOOLS[r.toolkit] = { enable: r.tools.slice() }
const READER_TOOLKITS = READERS.map(r => r.toolkit)

// Merge the shaped parts by section so two apps never make two folds with the
// same name. Newest six, each carrying its app for the tag.
function group(parts, ctx) {
  const by = new Map()
  for (const p of parts) {
    if (!p || !p.items || !p.items.length) continue
    const s = by.get(p.section) || { id: p.section, apps: [], items: [], count: 0 }
    s.apps.push(p.app)
    s.items.push.apply(s.items, p.items)
    s.count += p.items.length
    by.set(p.section, s)
  }

  return [...by.values()].map(s => {
    const total = s.count || s.items.length
    const items = s.items.sort((a, b) => b.at - a.at).slice(0, 6).map(i => ({
      time: clock(i.at, ctx.tz),
      app: i.app,
      title: i.title,
      detail: i.detail,
      tag: i.tag
    }))
    const noun = (SECTIONS[s.id] || { noun: "items" }).noun
    return {
      id: s.id,
      title: (SECTIONS[s.id] || { title: s.id }).title,
      apps: [...new Set(s.apps)],
      headline: total + " " + noun,
      items,
      meter: [{ label: noun, value: String(total) }]
    }
  })
}

export { READERS, READER_TOOLS, READER_TOOLKITS, SECTIONS, group, reasonTag, kind }
