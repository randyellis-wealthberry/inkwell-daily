// Prints the edition as one self-contained page: a broadsheet in the theme's
// own colours, set on the wallpaper like a window. Pure — an edition object
// in, HTML out.

"use strict"

const Model = require("../Model.js")
const Fonts = require("./fonts.js")
const Trend = require("./trend.js")

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

// A number from a deck or a log, or nothing.
function num(n) {
  const v = Number(n)
  return isFinite(v) ? String(Math.round(v)) : ""
}

function compact(n) {
  const v = Number(n) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k"
  return String(Math.round(v))
}

function money(n) {
  const v = Number(n)
  if (!isFinite(v)) return "—"
  if (v > 0 && v < 0.01) return "<$0.01"
  return "$" + v.toFixed(2)
}

const SOURCE_NAMES = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode" }

// Only the pictures the builder made itself: a JPEG, PNG or WebP data URI.
function img(src) {
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(String(src || "")) ? String(src) : ""
}

// Backticked commands in the copy become code.
function rich(s) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>")
}

function tokens(p) {
  const c = p || {}
  const light = c.mode === "light"
  return {
    scheme: light ? "light" : "dark",
    paper: c.background || "#1a1b26",
    deep: c.darkBackground || "#13141c",
    ink: c.brightForeground || c.foreground || "#c0caf5",
    soft: c.foreground || "#a9b1d6",
    faint: c.darkForeground || c.muted || "#565f89",
    rule: c.muted || "#414868",
    accent: c.accent || "#7aa2f7",
    gold: c.yellow || "#e0af68",
    red: c.red || "#f7768e",
    green: c.green || "#9ece6a"
  }
}

function hexA(hex, a) {
  const n = parseInt(String(hex).slice(1), 16)
  return "rgba(" + (n >> 16 & 255) + ", " + (n >> 8 & 255) + ", " + (n & 255) + ", " + a + ")"
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  cloud: '<path d="M7 18.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 18.5z"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.2a2.3 2.3 0 0 1-4.6 0"/><path d="M12 3v-1"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.8 4.6 12 6.4l2.2-1.8M9.8 19.4 12 17.6l2.2 1.8"/>',
  storm: '<path d="M7 15.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 15.5z"/><path d="m12.5 15.5-2 3.6h3l-2 3.4"/>',
  good: '<path d="M7 10.5v9H4v-9z"/><path d="M7 10.5 11 3a2.2 2.2 0 0 1 2.6 2.6L13 9.5h5.6a2 2 0 0 1 2 2.4l-1.4 6a2 2 0 0 1-2 1.6H7"/>',
  bad: '<path d="M7 13.5v-9H4v9z"/><path d="M7 13.5 11 21a2.2 2.2 0 0 0 2.6-2.6L13 14.5h5.6a2 2 0 0 0 2-2.4l-1.4-6a2 2 0 0 0-2-1.6H7"/>'
}

function icon(name) {
  return '<svg class="ear-icon" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.cloud) + "</svg>"
}

function stats(rows) {
  return rows.map(r => '<div class="stat"><span>' + esc(r.label) + "</span><b>" + esc(r.value) + "</b>" +
    (r.meter != null ? '<div class="meter"><i' + (r.meter < 25 ? ' class="low"' : "") + ' style="width:' + r.meter.toFixed(0) + '%"></i></div>' : "") + "</div>").join("")
}

function almanacRows(rows) {
  return '<div class="almanac">' + rows.map(r => "<div><span>" + esc(r.label) + "</span><b>" + esc(r.value) + "</b></div>").join("") + "</div>"
}

function quoteBlock(q) {
  if (!q || !q.text) return ""
  return '<blockquote class="promptquote"><p>' + rich(q.text) + "</p>" + (q.by ? "<cite>" + esc(q.by) + "</cite>" : "") + "</blockquote>"
}

function paras(list, firstDrop, quote) {
  return (list || []).map((p, i) => "<p" + (firstDrop && i === 0 ? ' class="drop"' : "") + ">" + rich(p) + "</p>" + (i === 0 ? quoteBlock(quote) : "")).join("")
}

function commitTable(commits) {
  if (!commits || !commits.length) return ""
  return '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Plugin</th><th>Commit</th></tr></thead><tbody>' +
    commits.slice(0, 12).map(c => "<tr><td>" + esc(c.time) + "</td><td>" + esc(c.plugin) + "</td><td>" + esc(c.subject) + "</td></tr>").join("") +
    "</tbody></table></div>" + (commits.length > 12 ? '<p class="note">And ' + (commits.length - 12) + " more.</p>" : "")
}

// Pro's portrait of the reader, with a good / bad verdict so we learn how
// well each provider does for them.
function portraitBlock(p) {
  const src = p ? img(p.image) : ""
  if (!src) return ""
  if (p.quote) return inspirationBlock(p, src)
  const btn = (v, label) => '<button class="btn rate" type="button" data-verdict="' + v + '" aria-pressed="false" aria-label="' + label + '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[v] + "</svg></button>"
  return '<figure class="portrait' + (p.filtered ? "" : " screen") + '" data-date="' + esc(p.date) + '" data-provider="' + esc(p.provider) + '">' +
    '<span class="plate-photo"><img src="' + src + '" alt="The reader, on file"></span><figcaption><span>' + esc(p.caption) + " (File photo" + (p.photo ? ": " + esc(p.photo) : "") + (p.drawnBy ? ", drawn by " + esc(p.drawnBy) : "") + ".)</span>" +
    '<span class="rating" role="group" aria-label="How did the picture come out?">' + btn("good", "Good picture") + btn("bad", "Bad picture") + "</span>" +
    '<span class="rated" aria-live="polite"></span></figcaption></figure>'
}

function rateButtons() {
  const btn = (v, label) => '<button class="btn rate" type="button" data-verdict="' + v + '" aria-pressed="false" aria-label="' + label + '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[v] + "</svg></button>"
  return '<span class="rating" role="group" aria-label="How did the picture come out?">' + btn("good", "Good picture") + btn("bad", "Bad picture") + "</span>"
}

// Pro's picture of the day: a made photograph with a quote set over it in
// the paper's type, so the words are always spelled right.
function inspirationBlock(p, src) {
  return '<figure class="portrait inspiration" data-date="' + esc(p.date) + '" data-provider="' + esc(p.provider) + '">' +
    '<span class="plate-photo"><img src="' + src + '" alt="' + esc("A photograph of " + p.scene) + '">' +
    '<blockquote class="overquote"><p>' + esc(p.quote) + "</p><cite>" + esc(p.author) + "</cite></blockquote></span>" +
    "<figcaption><span>Photograph made by " + esc(p.drawnBy) + ": " + esc(p.scene) + ".</span>" + rateButtons() +
    '<span class="rated" aria-live="polite"></span></figcaption></figure>'
}

function leadBlock(lead) {
  let body = ""
  if (lead.kind === "desk") body = '<div class="cols">' + paras(lead.paragraphs, true, lead.quote) + "</div>" + commitTable(lead.commits) + (lead.facts ? '<p class="facts">' + esc(lead.facts) + "</p>" : "")
  if (lead.kind === "pick") body = '<div class="cols">' + paras(lead.paragraphs, true, lead.quote) + "</div>" + (lead.facts ? '<p class="facts">' + esc(lead.facts) + "</p>" : "")
  if (lead.kind === "kickoff") body = '<ul class="log" aria-label="Goal log">' + lead.log.map(l => "<li><time>" + esc(l.time) + '</time><span class="s">' + esc(l.text) + "</span><span>" + esc(l.detail) + "</span></li>").join("") + "</ul>"
  return '<article class="lead">' +
    (lead.kicker ? '<p class="kicker">' + esc(lead.kicker) + "</p>" : "") +
    "<h1>" + esc(lead.headline) + "</h1>" + portraitBlock(lead.portrait) +
    (lead.deck ? '<p class="deck">' + esc(lead.deck) + "</p>" : "") +
    (lead.byline ? '<div class="byline">' + esc(lead.byline) + "</div>" : "") + body + "</article>"
}

// The Pace box: a verdict, then only the signals worth acting on. A healthy
// day is the verdict alone.
function paceBlock(p) {
  if (!p) return ""
  const shown = p.rows.filter(r => r.note)
  return '<section class="pace" aria-labelledby="pace-h"><p class="kicker">Pace</p><h3 id="pace-h">' + esc(p.verdict) + "</h3>" +
    (shown.length ? shown.map(r => '<div class="pace-row' + (r.flag ? " flag" : "") + '"><span>' + esc(r.label) + "</span><b>" + esc(r.value) + "</b><p>" + esc(r.note) + "</p></div>").join("") : "") +
    "</section>"
}

function wireBlock(w, pace) {
  return '<aside class="wire"><p class="kicker">' + esc(w.kicker) + "</p><h2>" + esc(w.title) + "</h2>" + stats(w.stats) + paceBlock(pace) +
    (w.note ? '<p class="note">' + rich(w.note) + "</p>" : "") +
    w.briefs.map(b => '<div class="brief">' + (b.kicker ? '<p class="kicker">' + esc(b.kicker) + "</p>" : "") + "<h3>" + esc(b.title) + "</h3><p>" + esc(b.text) + "</p></div>").join("") +
    "</aside>"
}

function deskBlock(d, single) {
  if (!d) return ""
  if (single || d.paragraphs.length <= 1) return '<section class="desk single"><article><p class="kicker">' + esc(d.kicker || "Agent desk") + "</p><h2>" + esc(d.headline) + "</h2>" +
    (d.deck ? '<p class="deck">' + esc(d.deck) + "</p>" : "") + paras(d.paragraphs, false, d.quote) + commitTable(d.commits) + (d.facts ? '<p class="facts">' + esc(d.facts) + "</p>" : "") + "</article></section>"
  const half = Math.ceil(d.paragraphs.length / 2)
  return '<section class="desk"><article><p class="kicker">' + esc(d.kicker || "Agent desk") + "</p><h2>" + esc(d.headline) + "</h2>" +
    (d.deck ? '<p class="deck">' + esc(d.deck) + "</p>" : "") + paras(d.paragraphs.slice(0, half), false, d.quote) + "</article><article>" +
    (d.paragraphs.length > 1 ? '<p class="kicker">Also on the desk</p>' : "") + paras(d.paragraphs.slice(half)) + commitTable(d.commits) +
    (d.facts ? '<p class="facts">' + esc(d.facts) + "</p>" : "") + "</article></section>"
}

// ---- The desks -------------------------------------------------------------------------
// Five fixed standing features. A connected desk prints in its beat; a closed
// one is a line in the back-page directory; a broken one keeps its name and
// position and replaces only the body with a standing notice.

const DESK_META = {
  mail: { persona: "The Mail Bag", body: "letters" },
  city: { persona: "The City Desk", body: "notes" },
  notebook: { persona: "The Notebook", body: "notes" },
  daybook: { persona: "The Day Book", body: "schedule" },
  project: { persona: "The Project Desk", body: "notes" }
}
const DESK_ORDER = ["mail", "city", "notebook", "daybook", "project"]
const DESK_STATE = {
  open: { label: "Wire live", cls: "live", dir: "Open" },
  empty: { label: "Wire live", cls: "live", dir: "Open" },
  expired: { label: "Wire closed", cls: "expired", dir: "Expired" },
  offline: { label: "Set offline", cls: "offline", dir: "Offline" },
  error: { label: "Wire down", cls: "down", dir: "Error" },
  closed: { label: "Not connected", cls: "closed", dir: "Not connected" }
}

// Pro-only blocks are marked so the web copy can strip them whole, even when
// they sit beside the paper's own copy.
function proWrap(html) { return html ? "<!-- pro:start -->" + html + "<!-- pro:end -->" : "" }

function deskFor(ed, slot) {
  const d = (ed.desks || []).find(x => x && x.desk === slot)
  if (!d || d.disabled || d.state === "closed") return null
  return d
}

function actionLink(action, fallback) {
  const a = action || {}
  const label = String(a.label || fallback || "Manage").replace(/\s*→$/, "")
  const href = /^(inkwell-daily:\/\/|https:\/\/)/i.test(a.href || "") ? a.href : ""
  return href ? '<a href="' + esc(href) + '">' + esc(label) + " →</a>" : '<span class="mono">' + esc(label) + "</span>"
}

function mailBody(items) {
  if (!items.length) return ""
  return '<ul class="letters">' + items.map(i => {
    const parts = String(i.detail || "").split(/:\s+/)
    const detail = parts.length > 1 ? "<i>" + esc(parts[0]) + ".</i> " + esc(parts.slice(1).join(": ")) : esc(i.detail || "")
    return "<li><time>" + esc(i.time) + '</time><div><b>' + esc(i.title) + "</b>" + (i.tag ? ' <span class="tag">' + esc(i.tag) + "</span>" : "") +
      (detail ? "<p>" + detail + "</p>" : "") + "</div></li>"
  }).join("") + "</ul>"
}

function notesBody(items) {
  if (!items.length) return ""
  return '<ul class="notes">' + items.map(i => "<li>" + (i.time ? '<span class="when">' + esc(i.time) + "</span> " : "") +
    "<b>" + esc(i.title) + "</b>" + (i.tag ? ' <span class="tag">' + esc(i.tag) + "</span>" : "") + (i.detail ? "<br>" + esc(i.detail) : "") + "</li>").join("") + "</ul>"
}

function scheduleBody(items) {
  if (!items.length) return ""
  return '<table class="schedule" aria-label="The day\'s engagements"><tbody>' + items.map(i => "<tr><td>" + esc(i.time) + "</td><td><b>" + esc(i.title) + "</b>" +
    (i.detail ? "<br>" + esc(i.detail) : "") + "</td><td>" + esc(i.tag) + "</td></tr>").join("") + "</tbody></table>"
}

function deskBody(slot, items) {
  const body = (DESK_META[slot] || {}).body
  if (body === "letters") return mailBody(items || [])
  if (body === "schedule") return scheduleBody(items || [])
  return notesBody(items || [])
}

function deskNotice(d, state) {
  const s = d.section || {}
  const text = s.note || d.note || (state === "expired" ? (d.name || "The desk") + " needs reconnecting." : state === "offline" ? "This edition was set without a network." : "The desk didn't report.")
  const action = state === "expired" || state === "error"
    ? actionLink(d.action, state === "expired" ? "Reconnect " + (d.name || "desk") : "Retry")
    : ""
  return '<div class="notice' + (state === "error" ? " down" : "") + '"><p>' + esc(text) + "</p>" + (action ? "<p>" + action + "</p>" : "") + "</div>"
}

function deskFoot(d, s, state) {
  const left = state === "open"
    ? (s.note || (d.lastSet ? "Last set: " + d.lastSet : ""))
    : (d.lastSet ? "Last set: " + d.lastSet : (s.note || ""))
  const action = state === "expired" || state === "error" ? ""
    : actionLink(d.action, (state === "empty" ? "Open " : "Manage ") + (d.name || "desk"))
  if (!left && !action) return ""
  return '<div class="slot-foot"><span>' + esc(left) + "</span>" + action + "</div>"
}

function deskSlot(d, slot) {
  if (!d) return ""
  const meta = DESK_META[slot] || { persona: d.name || "Desk", body: "notes" }
  const s = d.section || {}
  const state = DESK_STATE[d.state] ? d.state : "open"
  const st = DESK_STATE[state]
  const status = st.label + (state === "open" && d.lastSet ? " · " + d.lastSet : "")
  const headline = s.headline ||
    (state === "expired" ? "The connection has lapsed"
      : state === "error" ? (d.name || "The desk") + " didn't report"
        : state === "offline" ? "Yesterday's copy"
          : state === "empty" ? "A quiet desk" : meta.persona)
  const deck = s.deck ? '<p class="deck">' + esc(s.deck) + "</p>" : ""
  let body = ""
  if (state === "expired" || state === "error" || state === "offline") {
    body = deskNotice(d, state)
    if (state === "offline" && s.items && s.items.length) {
      body += '<span class="ghost-tag">Yesterday\'s copy</span><div class="ghost">' + deskBody(slot, s.items) + "</div>"
    }
  } else {
    body = deskBody(slot, s.items || [])
    if (!body && s.note) body = '<p class="note">' + esc(s.note) + "</p>"
  }
  return '<section class="slot ' + st.cls + '" aria-labelledby="' + slot + '-h">' +
    '<div class="slot-head"><p class="slot-kicker">' + esc(meta.persona) + (d.name ? '<span class="src">' + esc(d.name) + "</span>" : "") + "</p>" +
    '<span class="slot-status"><i class="dot" aria-hidden="true"></i>' + esc(status) + "</span></div>" +
    '<h2 id="' + slot + '-h">' + esc(headline) + "</h2>" + deck +
    '<div class="slot-body">' + body + "</div>" + deskFoot(d, s, state) + "</section>"
}

function deskRow(ed) {
  const agent = deskBlock(ed.desk, true)
  const city = deskSlot(deskFor(ed, "city"), "city")
  if (!city) return agent
  return '<div class="desk-row' + (agent ? "" : " solo") + '">' + (agent || "") + proWrap(city) + "</div>"
}

function belowPair(ed) {
  const notebook = deskSlot(deskFor(ed, "notebook"), "notebook")
  const project = deskSlot(deskFor(ed, "project"), "project")
  if (!notebook && !project) return ""
  return proWrap('<div class="desk-pair' + (notebook && project ? "" : " solo") + '">' + notebook + project + "</div>")
}

function aheadRow(ed) {
  const head = '<div class="fold-head"><h2>Weather, the week, and what\'s next</h2></div>'
  // The middle column is for Elevation, Easel and Munger, which the desktop
  // port does not carry. When it is empty the grid drops to two columns and
  // the weather and week fill the width instead of leaving a dead third.
  const next = tomorrowBlock(ed.tomorrow)
  const ahead = '<section class="ahead' + (next ? "" : " duo") + '">' + weatherBlock(ed.weather) + next + weekBlock(ed.week) + "</section>"
  const day = deskSlot(deskFor(ed, "daybook"), "daybook")
  if (!day) return head + ahead
  return head + '<div class="ahead-row"><div class="ahead-main">' + ahead + "</div>" + proWrap(day) + "</div>"
}

function dirRow(d) {
  const meta = DESK_META[d.desk] || { persona: d.name || "Desk" }
  const state = d.disabled ? "closed" : (DESK_STATE[d.state] ? d.state : "open")
  const label = d.disabled ? "Off" : DESK_STATE[state].dir
  const cls = d.disabled ? "closed" : DESK_STATE[state].cls
  const detail = d.section && d.section.headline ? d.section.headline : (d.note || (state === "closed" ? "Not connected" : ""))
  const action = d.action || {}
  const href = /^(inkwell-daily:\/\/|https:\/\/)/i.test(action.href || "") ? action.href : "inkwell-daily://desk?desk=" + encodeURIComponent(String(d.id || ""))
  const act = d.disabled ? "Turn on" : state === "expired" ? "Reconnect" : state === "error" ? "Retry" : state === "closed" ? "Connect" : "Manage"
  return '<div class="dir-row ' + cls + '"><div class="name">' + esc(meta.persona) + (d.name ? "<span>" + esc(d.name) + "</span>" : "") + "</div>" +
    '<div class="state">' + esc(label) + "</div>" +
    (detail ? '<div class="detail">' + esc(detail) + "</div>" : "") +
    '<a class="act" href="' + esc(href) + '">' + esc(act) + " →</a></div>"
}

function directoryBlock(desks) {
  const known = (desks || []).filter(d => d && DESK_ORDER.includes(d.desk))
  if (!known.length) return ""
  const order = DESK_ORDER.map(slot => known.find(d => d.desk === slot)).filter(Boolean)
  const open = order.filter(d => d.state === "open" || d.state === "empty").length
  const need = order.length - open
  const standfirst = open
    ? open + " open" + (need ? ", " + need + (need === 1 ? " needs" : " need") + " a hand." : ", all quiet.")
    : "No desks open yet."
  const rows = order.map(dirRow).join("") + (order.length < DESK_ORDER.length
    ? '<div class="dir-row"><div class="name">A new desk<span>Inkwell Daily Pro</span></div><div class="state">—</div><div class="detail">Connect Gmail, Slack, Notion, Calendar or Basecamp</div><a class="act" href="inkwell-daily://desks">Connect →</a></div>'
    : "")
  return '<section class="directory" aria-labelledby="dir-h"><h2 id="dir-h">Standing notices</h2><p class="standfirst">The desk directory. ' + esc(standfirst) + '</p>' +
    '<div class="dir-list">' + rows + '</div><div class="dir-foot"><span>Desks are read-only. They never post.</span><span>Inkwell Daily Pro</span></div></section>'
}

// Sections from plugin sources that don't name one of the five desks. They
// get one standing feature at the back, so the five named homes never move.
function otherDesksBlock(ed) {
  const sections = ((ed.extras && ed.extras.sections) || []).filter(s => s && (s.desk === "other" || !s.desk))
  if (!sections.length) return ""
  return '<div class="fold-head"><h2>Other desks</h2></div><section class="desk other">' + sections.map(s =>
    '<article><p class="kicker">' + esc(s.kicker) + "</p><h2>" + esc(s.headline) + "</h2>" + (s.deck ? '<p class="deck">' + esc(s.deck) + "</p>" : "") +
    (s.items.length ? '<ul class="log">' + s.items.map(i => "<li><time>" + esc(i.time) + '</time><span class="s"></span><span><b>' + esc(i.title) + "</b>" +
      (i.tag ? ' <span class="tag">' + esc(i.tag) + "</span>" : "") + (i.detail ? "<br>" + esc(i.detail) : "") + "</span></li>").join("") + "</ul>" : "") +
    (s.note ? '<p class="note">' + esc(s.note) + "</p>" : "") + "</article>").join("") + "</section>"
}

// The free build's Pro preview: one standing feature after the front. It is
// public marketing, not private desk data, so the web copy keeps it and the
// share card never sees it.
function proPreviewBlock(p) {
  if (!p) return ""
  const desks = (p.desks || []).map(d =>
    '<div class="pro-desk"><p class="slot-kicker">' + esc(d.persona) + (d.product ? '<span class="src">' + esc(d.product) + "</span>" : "") +
    '</p><span class="pro-tag">With Pro</span><p>' + esc(d.line) + "</p></div>").join("")
  return '<div class="fold-head"><h2>The Pro desks</h2><span class="fold-note">Five standing features · ' + esc(p.status) + "</span></div>" +
    '<section class="pro-preview" aria-labelledby="pro-h">' +
    '<div class="pro-preview-copy"><p class="kicker">' + esc(p.kicker) + '</p><h2 id="pro-h">' + esc(p.headline) + "</h2>" +
    '<p class="deck">' + esc(p.deck) + "</p>" +
    '<div class="pro-cta"><button class="btn pro-btn" type="button" id="add-desks" data-paywall="inkwell-daily-pro" disabled aria-disabled="true" aria-describedby="pro-note" title="Opens the Inkwell Daily Pro key desk when it is ready">' +
    esc(p.cta) + '</button><span class="pro-soon">' + esc(p.status) + "</span></div>" +
    '<p class="note" id="pro-note">' + esc(p.note) + "</p></div>" +
    '<div class="pro-preview-desks">' + desks + "</div></section>"
}

function picksBlock(p, key) {
  const e = p.elevation, a = p.easel, m = p.munger
  // Without the daily widgets' sources there's nothing below the fold.
  if (!e && !a && !m) return ""
  const parts = []
  const eImg = e ? img(e.image) : "", aImg = a ? img(a.image) : ""
  if (e) parts.push('<article><p class="kicker">Elevation · Architecture</p>' +
    (eImg ? '<figure><img src="' + eImg + '" alt="' + esc(e.imageAlt) + '"><figcaption>' + esc(e.place) + " · Wikimedia Commons</figcaption></figure>" : "") +
    "<h3>" + esc(e.name) + '</h3><p class="facts"><b>' + esc(e.architect) + "</b> · " + esc(e.year) + " · " + esc(e.style) + "</p><p>" + esc(Model.countWords(e.extract) ? e.extract.split(/(?<=\.)\s/).slice(0, 2).join(" ") : e.note) + "</p>" +
    '<div class="cycle" data-pos="' + num(e.position) + '" data-total="' + num(e.total) + '" aria-label="Day ' + num(e.position) + " of " + num(e.total) + ' in the current cycle"></div>' +
    '<p class="facts">Day <b>' + num(e.position) + "</b> of " + num(e.total) + " · <b>" + num(e.remaining) + "</b> buildings to the reshuffle</p></article>")
  else parts.push('<article><p class="kicker">Elevation</p><p class="note">Elevation isn\'t installed, so no building today.</p></article>')
  if (a) parts.push('<article><p class="kicker">Easel · The day\'s picture</p>' +
    (aImg ? '<figure><img id="easel-img" src="' + aImg + '" alt="' + esc(a.title || "The day's picture") + '"><figcaption>Art Institute of Chicago · public domain</figcaption></figure>' : "") +
    "<h3>" + esc(a.title || "Untitled") + '</h3><p class="facts"><b>' + esc(a.artist) + "</b>" + (a.date ? " · " + esc(a.date) : "") + "</p>" +
    '<dl class="label">' + [["Medium", a.medium], ["Size", a.size], ["Department", a.department], ["Accession", a.accession]].filter(r => r[1]).map(r => "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>").join("") + "</dl>" +
    (aImg ? '<button class="btn hang" type="button" id="hang" aria-pressed="false">Hang it behind the paper</button>' : "") + "</article>")
  else parts.push('<article><p class="kicker">Easel</p><p class="note">' + (p.easelInstalled === false ? "Easel isn\'t installed, so no picture today." : "Easel didn\'t hang a picture on " + esc(Model.weekday(key)) + ".") + "</p></article>")
  if (m) parts.push('<article class="wide"><p class="kicker">Munger · Editorial</p><p class="quote">' + esc(m.text) + "</p><p>" +
    (m.tag ? '<span class="tag">' + esc(m.tag) + "</span> &nbsp;" : "") + '<span class="mono">Deck card ' + num(m.card) + "</span></p></article>")
  return '<div class="fold-head"><h2>Below the fold · What the bar showed ' + esc(Model.weekday(key)) + '</h2></div><section class="fold">' + parts.join("") + "</section>"
}

function weatherBlock(w) {
  if (w.missing) return '<section aria-labelledby="wx-h"><p class="kicker">Weather</p><h2 id="wx-h">No report</h2><p class="note">' + esc(w.missing) + "</p></section>"
  return '<section aria-labelledby="wx-h"><p class="kicker">Weather' + (w.place ? " · " + esc(w.place) : "") + '</p><h2 id="wx-h">' + esc(w.headline) + "</h2>" +
    '<div class="wx-now"><div class="wx-hi">' + esc(w.high) + "<span>/" + esc(w.low) + '</span></div><div class="wx-desc">' + esc(w.label) + "</div></div>" +
    '<svg class="spark" id="spark" viewBox="0 0 300 92" role="img" aria-label="Hourly temperature"></svg>' + almanacRows(w.rows) +
    (w.outlook.length ? '<p class="kicker" style="margin-top:14px">Outlook</p><div class="outlook">' + w.outlook.map(o => "<div><b>" + esc(o.day) + "</b><span>" + esc(o.text) + "</span><em>" + esc(o.temps) + "</em></div>").join("") + "</div>" : "") +
    (w.meanwhile.length ? '<div class="meanwhile">' + w.meanwhile.map(l => "<p>" + esc(l) + "</p>").join("") + "</div>" : "") +
    "</section>"
}

function tomorrowBlock(t) {
  const items = []
  if (t.elevation) items.push('<div><span class="src">Elevation</span><h3>' + esc(t.elevation.name) + "</h3><p>" + esc(t.elevation.architect + ", " + t.elevation.place + ", " + t.elevation.year + ". " + (t.elevation.note || "")) + " Day " + num(t.elevation.position) + " of " + num(t.elevation.total) + ".</p></div>")
  if (t.easel) items.push('<div><span class="src">Easel</span><h3>' + esc(t.easel.title) + "</h3>" + (t.easel.credit ? "<p>" + esc(t.easel.credit) + ". It went up at midnight.</p>" : "") + "</div>")
  if (t.munger) items.push('<div><span class="src">Munger</span><p class="quote small">' + esc(t.munger.text) + "</p>" + (t.munger.tag ? '<span class="tag">' + esc(t.munger.tag) + "</span>" : "") + "</div>")
  if (!items.length) return ""
  return '<section aria-labelledby="next-h"><p class="kicker">Coming ' + esc(t.day) + '</p><h2 id="next-h">Today on the bar</h2><div class="next">' + (items.join("") || '<p class="note">Nothing dealt yet.</p>') + "</div></section>"
}

function weekBlock(w) {
  return '<section aria-labelledby="week-h"><p class="kicker">Your week in agents</p><h2 id="week-h">' + esc(w.headline) + "</h2>" +
    '<svg class="bars" id="bars" viewBox="0 0 300 150" role="img" aria-label="Prompts typed per day for the week"></svg>' + almanacRows(w.rows) +
    '<p class="note">Counts the prompts you typed, not tool calls.</p></section>'
}

// A fortnight of the metric the trend picked (tokens when there are any,
// prompts otherwise), with tomorrow's forecast as a dashed point.
function trendBlock(t) {
  if (!t || !Array.isArray(t.days) || !t.days.length) return ""
  const field = t.metric === "tokens" ? "tokens" : "prompts"
  const tokens = field === "tokens"
  const rows = t.days
  const W = 620
  const H = 156
  const PAD = 18
  const n = rows.length
  const max = Math.max(1, ...rows.map(d => d[field]), (t.forecast && t.forecast[field]) || 0)
  const step = (W - PAD * 2) / n
  const px = i => PAD + i * step
  const py = v => H - PAD - (v / max) * (H - PAD * 2)
  const points = rows.map((d, i) => [px(i), py(d[field])])
  const line = "M " + points.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ")
  const area = "M " + px(0).toFixed(1) + " " + (H - PAD).toFixed(1) + " L " +
    points.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ") +
    " L " + px(n - 1).toFixed(1) + " " + (H - PAD).toFixed(1) + " Z"
  const last = points[points.length - 1]
  const fx = px(n)
  const fy = py((t.forecast && t.forecast[field]) || 0)
  const labels = rows.map((d, i) => i % 2 === 0
    ? '<text x="' + px(i).toFixed(1) + '" y="' + (H - 3) + '" text-anchor="middle">' + esc(d.label) + "</text>"
    : "").join("")
  const dots = points.map(p => '<circle class="dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.9"/>').join("")
  const fmt = n => tokens ? Trend.formatTokens(n) : String(Math.round(n))
  const stats = [
    [tokens ? "Tokens" : "Prompts", fmt(tokens ? t.totalTokens : t.totalPrompts)],
    ["A day", fmt(tokens ? (t.averageTokens || 0) : (t.averagePrompts || 0))],
    [tokens ? "Prompts" : "Active days", tokens ? String(t.totalPrompts) : String(t.activeDays)],
    ["Heaviest", t.busiest || "—"]
  ]
  return '<section class="trend" aria-labelledby="trend-h">' +
    '<div class="trend-copy"><p class="kicker">The usage line</p><h2 id="trend-h">' + esc(t.headline) + "</h2>" +
    '<p class="note">' + esc(t.blurb) + "</p>" +
    '<dl class="almanac">' + stats.map(([label, value]) =>
      "<div><span>" + esc(label) + "</span><b>" + esc(value) + "</b></div>").join("") + "</dl></div>" +
    '<div class="trend-chart"><svg class="spark trend-line" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc((tokens ? "Tokens" : "Prompts") + " per day for the last " + rows.length + " days, with a forecast for " + ((t.forecast && t.forecast.day) || "tomorrow")) + '">' +
      '<line class="grid" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>' +
      '<path class="area" d="' + area + '"/>' +
      '<path class="line" d="' + line + '"/>' +
      dots +
      '<path class="line forecast" d="M ' + last[0].toFixed(1) + " " + last[1].toFixed(1) + " L " + fx.toFixed(1) + " " + fy.toFixed(1) + '"/>' +
      '<circle class="dot ring" cx="' + fx.toFixed(1) + '" cy="' + fy.toFixed(1) + '" r="3.6"/>' +
      labels +
    "</svg>" +
    '<p class="facts">' + (tokens ? "Tokens" : "Prompts") + " per day. The dashed point is tomorrow's forecast.</p></div>" +
    "</section>"
}

// The model desk: which models did the work, by tokens, with the price they
// would carry at published list rates. OpenCode's own cost is a fallback when
// a model isn't in the catalog.
function modelRows(rows) {
  return rows.slice(0, 8).map(r => "<tr><td><b>" + esc(r.name) + "</b>" +
    (r.sources.length ? '<span class="src">' + esc(r.sources.map(s => SOURCE_NAMES[s] || s).join(" · ")) + "</span>" : "") +
    '<span class="modelbar"><i style="width:' + Math.max(1, r.share).toFixed(0) + '%"></i></span></td>' +
    "<td>" + compact(r.input) + "</td><td>" + compact(r.output) + "</td><td>" + (r.priced ? money(r.cost) : "—") + "</td></tr>").join("")
}

function modelBlock(m) {
  if (!m || !m.month.rows.length) return ""
  const day = m.day, month = m.month
  const head = day.rows.length
    ? "<h2>" + (day.priced ? money(day.cost) + " estimated" : compact(day.tokens) + " tokens") + "</h2>"
    : "<h2>No model work on file</h2>"
  const table = day.rows.length
    ? '<div class="table-wrap"><table class="models-table"><thead><tr><th>Model</th><th>In</th><th>Out</th><th>Est.</th></tr></thead><tbody>' +
      modelRows(day.rows) + "</tbody></table></div>" +
      (day.rows.length > 8 ? '<p class="note">And ' + (day.rows.length - 8) + " more.</p>" : "")
    : '<p class="note">Nothing was run yesterday. The month to date is below.</p>'
  const total = month.priced ? money(month.cost) : compact(month.tokens)
  const bars = month.rows.slice(0, 5).map(r => '<div class="row"><div><b>' + esc(r.name) + "</b><span>" +
    (r.priced ? money(r.cost) : compact(r.tokens) + " tok") + "</span></div>" +
    '<div class="meter"><i style="width:' + Math.max(1, r.share).toFixed(0) + '%"></i></div></div>').join("")
  return '<div class="fold-head"><h2>The model desk · What the models cost</h2><span class="fold-note">Ranked by tokens</span></div>' +
    '<section class="models' + (day.rows.length ? "" : " quiet") + '">' +
    '<div class="models-day"><p class="kicker">Yesterday · ' + esc(Model.shortDate(m.key)) + "</p>" + head + table + "</div>" +
    '<aside class="models-month"><p class="kicker">This month</p><div class="model-total"><b>' + esc(total) + "</b><span>" +
    (month.priced ? "estimated at list prices" : "tokens so far") + "</span></div>" +
    almanacRows([
      { label: "Calls", value: String(month.calls) },
      { label: "Tokens in", value: compact(month.input) },
      { label: "Tokens out", value: compact(month.output) },
      { label: "Models", value: String(month.rows.length) }
    ]) +
    '<div class="model-bars">' + bars + "</div>" +
    '<p class="note">' + (month.priced ? "OpenCode's own cost where it records one; otherwise estimated at published list prices." : "No prices on file for these models, so only token counts are shown.") + "</p></aside>" +
    "</section>"
}

// The perks: the milestone themes the habit has earned, and the next one.
function perksBlock(p, theme) {
  if (!p || !p.themes.length) return ""
  const cards = p.themes.map(t => {
    const pal = t.palette || {}
    const swatch = '<span class="swatch">' +
      '<i style="background:' + esc(pal.background) + '"></i>' +
      '<i style="background:' + esc(pal.darkBackground) + '"></i>' +
      '<i style="background:' + esc(pal.accent) + '"></i>' +
      '<i style="background:' + esc(pal.brightForeground) + '"></i></span>'
    const state = t.active ? "In use" : t.unlocked ? "Unlocked" : "Locked"
    const note = t.unlocked ? t.blurb : t.remaining + (t.remaining === 1 ? " morning to go" : " mornings to go")
    return '<article class="perk' + (t.unlocked ? " on" : " locked") + (t.active ? " active" : "") +
      (p.next && p.next.id === t.id ? " next" : "") + '">' + swatch +
      '<p class="kicker">' + esc(state) + "</p><h3>" + esc(t.name) + '</h3><p class="note">' + esc(note) + "</p></article>"
  }).join("")
  let note = "Themes stay unlocked once earned. Auto-advance uses your newest earned theme; Auto follows your Mac; choose one with <code>inkwell-daily theme &lt;name&gt;</code>."
  if (theme && theme.locked) note += " " + esc(theme.locked.name) + " is locked until " + theme.locked.at + " mornings, so this edition uses " + esc(theme.theme || "Auto") + "."
  return '<div class="fold-head"><h2>The perks · Milestone themes</h2><span class="fold-note">' + p.unlocked + " of " + p.total + " unlocked</span></div>" +
    '<section class="perks"><div class="perk-grid">' + cards + "</div>" +
    '<p class="note">' + note + "</p></section>"
}

// The habit: a five-week ledger of the mornings the paper was opened, with the
// run it makes. Static on purpose — the page is set before you read it.
function habitBlock(h) {
  if (!h || !h.cells.length) return ""
  const cells = h.cells.map(c => {
    const label = Model.longDate(c.key) + (c.future ? " · still to come" : c.before ? " · before the ledger" : c.on ? " · opened" : " · not opened")
    return '<span class="cell' + (c.on ? " on" : "") + (c.today ? " today" : "") + (c.future ? " future" : "") + (c.before ? " before" : "") +
      '" title="' + esc(label) + '">' + (c.on ? "&#10003;" : "") + "</span>"
  }).join("")
  const stats = almanacRows([
    { label: "Mornings running", value: String(h.run) },
    { label: "Best run", value: String(h.best) },
    { label: "This month", value: String(h.month) },
    { label: "All told", value: String(h.total) }
  ])
  const since = h.run > 1 && h.runStart ? "Since " + Model.shortDate(h.runStart) + "." : ""
  return '<div class="fold-head"><h2>Your inkwell habit</h2><span class="fold-note">' + esc(h.monthLabel) + "</span></div>" +
    '<section class="habit" aria-labelledby="habit-h">' +
    '<div class="habit-grid"><div class="habit-days" aria-hidden="true">' + h.weekdays.map(d => "<span>" + esc(d) + "</span>").join("") + "</div>" +
    '<div class="habit-cells" role="img" aria-label="' + esc("Mornings opened, five weeks to " + Model.longDate(h.end) + ": " + h.run + " running, " + h.total + " all told") + '">' + cells + "</div></div>" +
    '<div class="habit-copy"><p class="kicker">Checking your inkwell</p><h2 id="habit-h">' + esc(h.headline) + "</h2>" +
    (since ? '<p class="facts">' + esc(since) + "</p>" : "") + stats +
    '<p class="note">A morning counts once you open the paper. The next edition adds today\'s check-in.</p></div>' +
    "</section>"
}

// The week in a sentence, then only the days something happened. The
// bars below already chart the counts, so nothing here repeats them.
function magazineSummary(days) {
  const busy = days.filter(d => d.prompts || d.commits.length)
  const prompts = days.reduce((n, d) => n + d.prompts, 0), shipped = days.reduce((n, d) => n + d.commits.length, 0)
  if (!busy.length) return "A quiet week: no prompts and nothing shipped."
  const top = busy.slice().sort((x, y) => y.prompts - x.prompts)[0]
  const name = top.key ? Model.weekday(top.key) : top.day.split(" ")[0]
  const when = busy.length === 1 ? "all on " + name : "across " + busy.length + " days, most on " + name
  return prompts + " prompt" + (prompts === 1 ? "" : "s") + ", " + when + ". " +
    (shipped ? shipped + " commit" + (shipped === 1 ? "" : "s") + " shipped." : "Nothing shipped.")
}

function magazineBlock(m) {
  if (!m) return ""
  const busy = m.days.filter(d => d.prompts || d.commits.length)
  const lines = m.days.filter(d => d.quote)
  const side = []
  if (lines.length) side.push('<div><p class="kicker">The week\'s lines</p>' + lines.map(d => '<p class="quote small">' + esc(d.quote) + '</p><p class="facts">' + esc(d.day) + "</p>").join("") + "</div>")
  if (m.goals.length) side.push('<div><p class="kicker">Kickoff, the week</p><ul class="log">' + m.goals.map(g => "<li><time>" + esc(g.when) + '</time><span class="s"></span><span>' + esc(g.text) + "</span></li>").join("") + "</ul></div>")
  return '<div class="fold-head"><h2>The Sunday magazine · Your week</h2></div><section class="magazine">' +
    '<p class="deck">' + esc(magazineSummary(m.days)) + "</p>" +
    (busy.length ? '<ul class="log">' + busy.map(d => "<li><time>" + esc(d.day) + '</time><span class="s"></span><span><b>' + num(d.prompts) + " prompt" + (d.prompts === 1 ? "" : "s") + "</b>" +
      (d.commits.length ? " · shipped " + esc(d.commits.slice(0, 2).join("; ")) + (d.commits.length > 2 ? " and " + (d.commits.length - 2) + " more" : "") : "") + "</span></li>").join("") + "</ul>" : "") +
    (side.length ? '<div class="mag-cols">' + side.join("") + "</div>" : "") + "</section>"
}

function backBlock(b, corrections, directory) {
  const j = b.jumble.length ? '<div class="jumble" id="jumble">' + b.jumble.map((r, i) =>
    '<div class="jrow"><label class="clue" for="j' + i + '"><b>' + esc(r.scramble) + "</b>" + esc(r.clue) + '</label><input id="j' + i + '" data-a="' + esc(r.answer) + '" maxlength="' + r.answer.length + '" autocomplete="off" spellcheck="false"><span class="mark" aria-live="polite"></span></div>').join("") +
    '</div><div class="jtools"><button class="btn" type="button" id="reveal">Show answers</button><span id="jscore" aria-live="polite">0 of ' + b.jumble.length + " solved</span></div>" : '<p class="note">Not enough names in the day for a puzzle.</p>'
  const k = b.keybind
  return '<div class="fold-head"><h2>The back page</h2></div><section class="back">' + (directory || "") +
    '<section aria-labelledby="jumble-h"><p class="kicker">Puzzle · Jumble</p><h2 id="jumble-h">Unscramble yesterday</h2><p class="how">Every answer is somewhere on this page. Type it in and the box turns green.</p>' + j + "</section>" +
    "<section>" + (k ? '<p class="kicker">Keybind of the day</p><h2>' + esc(k.action) + '</h2><div class="tip"><div class="keys">' + k.keys.map(x => "<kbd>" + esc(x) + "</kbd>").join(" ") + "</div></div>" : "") +
    '<p class="kicker">Almanac</p>' + almanacRows(b.almanac) + "</section>" +
    "<section>" + (corrections.length ? '<div class="corrections"><p class="kicker">Corrections</p>' + corrections.map(c => "<p>" + esc(c) + "</p>").join("") + "</div>" : "") +
    '<p class="kicker">Classifieds</p><h2>Notices</h2><div class="ads">' +
    (b.classifieds.length ? b.classifieds.map(a => '<p class="ad"><b>' + esc(a.kind) + "</b> " + esc(a.text) + (a.code ? " Apply with <code>" + esc(a.code) + "</code>." : "") + "</p>").join("") : '<p class="ad">No loose ends. A tidy desk.</p>') +
    "</div></section></section>"
}

function issuesNav(ed) {
  const i = ed.issues
  const link = (e, label) => e ? '<a href="' + esc(e.date) + '.html">' + label + "</a>" : '<span class="off">' + label + "</span>"
  const total = Number(i.total) || 0
  const all = '<a class="all" href="index.html">All editions' +
    (total ? '<span class="count" aria-label="' + total + ' editions">' + total + "</span>" : "") +
    '<span aria-hidden="true">→</span></a>'
  const group = '<span class="allgroup">' + all +
    (ed.integrations ? '<a class="all ghost" href="integrations.html">Integrations</a>' : "") +
    "</span>"
  return '<nav class="issues" aria-label="All editions and adjacent issues">' +
    link(i.prev, "← " + (i.prev ? esc(Model.shortDate(i.prev.date)) : "No earlier edition")) +
    group + link(i.next, (i.next ? esc(Model.shortDate(i.next.date)) : "Newest") + " →") + "</nav>" +
    (i.yearAgo ? '<aside class="yearago"><p class="kicker">A year ago today</p><p><a href="' + esc(i.yearAgo.date) + '.html">' + esc(i.yearAgo.headline || i.yearAgo.title) + "</a></p></aside>" : "")
}

const STYLE = String.raw`
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper) var(--wall) center top / cover fixed no-repeat; color: var(--ink-soft); font-family: var(--f-serif); font-size: 17px; line-height: 1.5; }
.desktop { padding-inline: clamp(16px, 4vw, 56px); padding-block: clamp(28px, 6vw, 72px); }
.sheet { position: relative; max-width: 1180px; margin: 0 auto; padding-inline: clamp(16px, 4vw, 40px); padding-block: 28px 40px; background: var(--sheet); border: 2px solid var(--accent); box-shadow: 0 24px 80px rgba(0,0,0,.45); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.wallnote { max-width: 1180px; margin: 12px auto 0; text-align: right; font-family: var(--f-mono); font-size: 11px; letter-spacing: .06em; color: #f4f4f8; text-shadow: 0 1px 6px rgba(0,0,0,.8); }
a { color: var(--accent); }
.ears { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-family: var(--f-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); }
.ears b { color: var(--gold); font-weight: 600; }
.ear-w { display: inline-flex; align-items: center; gap: 8px; }
.share { display: inline-flex; align-items: center; gap: 5px; margin-left: 10px; padding: 3px 9px; border: 1px solid var(--rule); border-radius: 999px; color: var(--accent); text-decoration: none; }
.share:hover { border-color: var(--accent); }
.share svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ear-icon { width: 22px; height: 22px; fill: none; stroke: var(--gold); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.plate { font-family: var(--f-plate); font-weight: 700; color: var(--ink); text-align: center; font-size: clamp(34px, 7vw, 88px); line-height: 1.02; margin: 10px 0 6px; text-wrap: balance; }
.plate span { color: var(--accent); }
.motto { text-align: center; font-style: italic; color: var(--ink-faint); font-size: 14px; margin: 0 0 12px; }
.dateline { border-top: 3px double var(--rule); border-bottom: 1px solid var(--rule); padding: 7px 0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 18px; font-family: var(--f-mono); font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-soft); }
.dateline .live::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--green); margin-right: 7px; vertical-align: 1px; }
.seal { position: absolute; top: 74px; right: clamp(14px, 3vw, 36px); width: 104px; height: 104px; border-radius: 50%; display: grid; place-items: center; text-align: center; background: radial-gradient(circle at 35% 30%, var(--red), color-mix(in srgb, var(--red) 60%, #000)); color: #fff; font-family: var(--f-mono); font-size: 10px; letter-spacing: .14em; line-height: 1.35; text-transform: uppercase; transform: rotate(-12deg); box-shadow: 0 3px 0 color-mix(in srgb, var(--red) 50%, #000), 0 8px 22px rgba(0,0,0,.4); border: 3px double rgba(255,255,255,.55); }
.seal b { display: block; font-family: var(--f-plate); font-size: 19px; letter-spacing: 0; text-transform: none; }
.kicker { font-family: var(--f-mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); margin: 0 0 6px; }
h1, h2, h3 { font-family: var(--f-serif); color: var(--ink); text-wrap: balance; margin: 0; }
h1 { font-size: clamp(30px, 4.6vw, 52px); font-weight: 800; line-height: 1.04; letter-spacing: -.015em; }
h2 { font-size: 26px; font-weight: 800; line-height: 1.1; }
h3 { font-size: 21px; font-weight: 600; line-height: 1.15; }
.deck { font-size: 20px; font-style: italic; color: var(--ink-soft); margin: 10px 0 14px; line-height: 1.35; }
.byline { font-family: var(--f-mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 12px; }
p { margin: 0 0 .8em; }
code, .mono { font-family: var(--f-mono); font-size: .82em; color: var(--accent); }
.drop::first-letter { font-family: var(--f-plate); float: left; font-size: 3.6em; line-height: .82; padding: 6px 8px 0 0; color: var(--accent); }
.front { display: grid; grid-template-columns: minmax(0, 2.1fr) minmax(0, 1fr); border-bottom: 1px solid var(--rule); }
.front > * { padding-block: 22px; min-width: 0; }
.lead { padding-right: 28px; }
.wire { padding-left: 24px; border-left: 1px solid var(--rule); }
.cols { columns: 2 18em; column-gap: 28px; column-rule: 1px solid var(--rule); }
.cols p { break-inside: avoid-column; }
.promptquote { margin: 12px 0; padding: 2px 0 2px 14px; border-left: 2px solid var(--gold); break-inside: avoid-column; }
.promptquote p { margin: 0 0 4px; font-size: 18px; font-style: italic; line-height: 1.35; color: var(--ink); }
.promptquote cite { font-family: var(--f-mono); font-style: normal; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft); }
.promptquote cite::before { content: "— "; }
.log { list-style: none; margin: 0; padding: 0; font-family: var(--f-mono); font-size: 12.5px; }
.log li { display: grid; grid-template-columns: 6em minmax(0, auto) minmax(0, 1fr); gap: 10px; padding: 6px 0; border-bottom: 1px dotted var(--rule); }
.log time { color: var(--ink-faint); }
.log .s { color: var(--ink); font-weight: 600; }
.wire h2 { font-size: 22px; margin-bottom: 10px; }
.stat { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; font-family: var(--f-mono); font-size: 12px; padding: 7px 0; border-bottom: 1px dotted var(--rule); }
.stat b { color: var(--ink); font-weight: 600; }
.meter { grid-column: 1 / -1; height: 5px; background: var(--paper-deep); border: 1px solid var(--rule); }
.meter i { display: block; height: 100%; background: var(--accent); }
.meter i.low { background: var(--green); }
.note { font-size: 13.5px; color: var(--ink-faint); font-style: italic; margin-top: 10px; }
.wire .brief { padding: 12px 0; border-bottom: 1px solid var(--rule); }
.wire .brief:last-child { border-bottom: 0; }
.wire .brief h3 { font-size: 17px; margin-bottom: 4px; }
.wire .brief p { font-size: 15px; margin: 0; }
.wire .brief p.kicker { font-size: 11px; margin-bottom: 6px; }
.desk { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; padding-block: 22px; border-bottom: 3px double var(--rule); }
.desk > * { min-width: 0; }
.desk.single { grid-template-columns: minmax(0, 1fr); }
.desk.single article { max-width: 46em; }

/* ---- A desk slot ------------------------------------------------------- */
.slot { padding-block: 22px; border-bottom: 3px double var(--rule); }
.slot-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 6px 18px; border-top: 1px solid var(--rule); padding-top: 10px; }
.slot-kicker { font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .15em; text-transform: uppercase; color: var(--gold); margin: 0; }
.slot-kicker .src { color: var(--ink-soft); letter-spacing: .08em; }
.slot-kicker .src::before { content: " · "; color: var(--rule); }
.slot-status { font-family: var(--f-mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.slot-status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex: 0 0 auto; }
.slot.live .slot-status .dot { animation: pulse 2.4s ease-in-out infinite; }
.slot.closed .slot-status .dot, .slot.offline .slot-status .dot { background: transparent; border: 1px solid var(--ink-faint); }
.slot.offline .slot-status .dot { border-color: var(--gold); }
.slot.down .slot-status .dot { background: var(--red); }
.slot.expired .slot-status .dot { background: transparent; border: 1px solid var(--red); }
.slot h2 { font-size: 26px; margin: 8px 0 0; }
.slot .deck { font-size: 17px; margin: 8px 0 12px; }
.slot-body { min-width: 0; }
.slot-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 18px; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--rule); font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .04em; color: var(--ink-soft); }
.slot-foot a, .notice a, .dir-row a { color: color-mix(in srgb, var(--accent) 78%, var(--ink)); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); transition: border-color 120ms ease, color 120ms ease; }
.slot-foot a:hover, .notice a:hover, .dir-row a:hover { border-color: var(--accent); }
.notice { margin: 10px 0 0; padding: 12px 14px; border-left: 2px solid var(--gold); background: var(--paper-deep); font-size: 14px; font-style: italic; color: var(--ink-soft); }
.notice.down { border-left-color: var(--red); }
.notice p { margin: 0 0 6px; }
.notice p:last-child { margin: 0; }
.notice .mono { font-style: normal; font-size: 12px; color: var(--ink); }
.ghost { opacity: .55; }
.ghost-tag { display: inline-block; font-family: var(--f-mono); font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-soft); border: 1px solid var(--rule); padding: 1px 6px; margin-bottom: 8px; }
.letters { list-style: none; margin: 0; padding: 0; columns: 2 17em; column-gap: 28px; }
.letters li { break-inside: avoid; display: grid; grid-template-columns: 5.2em minmax(0, 1fr); gap: 10px; padding: 8px 0; border-bottom: 1px dotted var(--rule); }
.letters time { font-family: var(--f-mono); font-size: 11px; color: var(--ink-soft); padding-top: 2px; }
.letters b { color: var(--ink); font-weight: 600; }
.letters p { margin: 2px 0 0; font-size: 14px; line-height: 1.35; }
.schedule { width: 100%; border-collapse: collapse; font-size: 14px; }
.schedule td { padding: 6px 8px 6px 0; border-bottom: 1px dotted var(--rule); vertical-align: top; }
.schedule td:first-child { font-family: var(--f-mono); font-size: 11.5px; color: var(--ink-soft); width: 5em; }
.schedule td:last-child { text-align: right; font-family: var(--f-mono); font-size: 10.5px; color: var(--ink-soft); }
.schedule b { color: var(--ink); font-weight: 600; }
.notes { list-style: none; margin: 0; padding: 0; }
.notes li { padding: 8px 0; border-bottom: 1px dotted var(--rule); font-size: 14px; }
.notes b { color: var(--ink); font-weight: 600; }
.notes .when { font-family: var(--f-mono); font-size: 10.5px; color: var(--ink-soft); }
.desk-row { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 28px; border-bottom: 3px double var(--rule); }
.desk-row > * { min-width: 0; padding-block: 22px; }
.desk-row .desk, .desk-row .slot { border-bottom: 0; padding-block: 0; }
.desk-row.solo, .desk-row:not(:has(.slot)) { grid-template-columns: minmax(0, 1fr); }
.desk-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; border-bottom: 3px double var(--rule); }
.desk-pair > * { min-width: 0; padding-block: 22px; }
.desk-pair .slot { border-bottom: 0; padding-block: 0; }
.desk-pair.solo { grid-template-columns: minmax(0, 1fr); }
.ahead-row { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 28px; border-bottom: 3px double var(--rule); }
.ahead-row > * { min-width: 0; }
.ahead-row .slot { border-bottom: 0; padding-block: 0; }
.ahead-row:not(:has(.slot)) { grid-template-columns: minmax(0, 1fr); }
.directory { padding-block: 18px 22px; border-top: 3px double var(--rule); }
.back .directory { grid-column: 1 / -1; padding: 0 0 18px; border-left: 0; border-top: 0; border-bottom: 1px solid var(--rule); }
.back .directory + section { padding-left: 0; border-left: 0; }
.directory h2 { font-size: 15px; font-family: var(--f-mono); font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 4px; }
.directory .standfirst { font-size: 14px; font-style: italic; color: var(--ink-soft); margin: 0 0 10px; }
.dir-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.dir-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 12px; padding: 9px 0; border-bottom: 1px dotted var(--rule); }
.dir-row .name { font-size: 15px; color: var(--ink); }
.dir-row .name span { display: block; font-family: var(--f-mono); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft); margin-top: 1px; }
.dir-row .state { font-family: var(--f-mono); font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); text-align: right; white-space: nowrap; }
.dir-row.open .state { color: var(--green); }
.dir-row.expired .state, .dir-row.error .state { color: var(--red); }
.dir-row.offline .state, .dir-row.closed .state { color: var(--ink-soft); }
.dir-row .detail { grid-column: 1 / -1; font-size: 12.5px; color: var(--ink-soft); }
.dir-row .act { grid-column: 2; text-align: right; font-family: var(--f-mono); font-size: 10.5px; }
.dir-foot { margin-top: 12px; font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .03em; color: var(--ink-soft); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; }
.desk.other { border-bottom: 3px double var(--rule); }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.82); } }
@media (prefers-reduced-motion: reduce) {
  .slot.live .slot-status .dot { animation: none; }
  .slot-foot a, .notice a, .dir-row a { transition: none; }
}
a:focus-visible, .btn:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a:active { color: var(--ink); }
.btn:active { border-color: var(--accent); }
.table-wrap { overflow-x: auto; margin: 6px 0 12px; }
table { width: 100%; border-collapse: collapse; font-family: var(--f-mono); font-size: 12.5px; }
th { text-align: left; font-weight: 600; color: var(--ink-faint); text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; border-bottom: 1px solid var(--ink-faint); padding: 6px 8px 6px 0; }
td { padding: 6px 8px 6px 0; border-bottom: 1px dotted var(--rule); color: var(--ink-soft); vertical-align: top; }
.keys { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 12px; }
kbd { font-family: var(--f-mono); font-size: 12px; color: var(--ink); background: var(--paper-deep); border: 1px solid var(--rule); border-bottom-width: 2px; padding: 2px 7px; border-radius: 3px; }
.facts { font-family: var(--f-mono); font-size: 11.5px; color: var(--ink-faint); margin: 8px 0 10px; }
.facts b { color: var(--ink); font-weight: 600; }
.fold-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 0 0; }
.fold-head h2 { font-size: 15px; font-family: var(--f-mono); font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-faint); }
.fold-head .fold-note { font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); }
.fold { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding-block: 14px 22px; }
.fold > article { min-width: 0; padding: 0 20px; border-left: 1px solid var(--rule); }
.fold > article:first-child { padding-left: 0; border-left: 0; }
.fold > article:last-child { padding-right: 0; }
.fold .wide { grid-column: span 2; }
figure { margin: 0 0 12px; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); }
.portrait { margin: 14px 0 4px; width: 100%; }
.portrait img { filter: grayscale(1) contrast(1.1); }
.plate-photo { display: block; position: relative; }
.portrait.screen .plate-photo::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle, transparent 38%, var(--paper) 40%) 0 0 / 4px 4px; mix-blend-mode: multiply; opacity: .55; }
.portrait figcaption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13px; font-style: italic; color: var(--ink-faint); margin-top: 6px; }
.portrait figcaption > span:first-child { flex: 1 1 14em; }
.inspiration img { filter: grayscale(1) contrast(1.08); }
.overquote { position: absolute; inset: 0 0 auto; margin: 0; padding: 7% 9% 18%; text-align: center; color: #fff;
  background: linear-gradient(to bottom, rgba(0, 0, 0, .55), rgba(0, 0, 0, 0)); text-shadow: 0 1px 12px rgba(0, 0, 0, .5); }
.overquote p { font-family: var(--f-serif); font-style: italic; font-weight: 600; font-size: clamp(18px, 2.6vw, 32px); line-height: 1.2; margin: 0 0 .4em; text-wrap: balance; }
.overquote cite { font-family: var(--f-mono); font-style: normal; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
.overquote cite::before { content: "— "; }
.pace { margin: 16px 0 6px; padding: 12px 0 2px; border-top: 1px solid var(--rule); }
.pace h3 { font-size: 18px; margin-bottom: 8px; }
.pace-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 8px 0; border-top: 1px dotted var(--rule); }
.pace-row span { font-family: var(--f-mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); }
.pace-row b { font-family: var(--f-mono); color: var(--ink); }
.pace-row.flag b { color: var(--red); }
.pace-row p { grid-column: 1 / -1; margin: 0; font-size: 14px; color: var(--ink-soft); }
.rating { display: inline-flex; gap: 6px; }
.rate { padding: 4px 7px; line-height: 0; }
.rate svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; }
.rate[aria-pressed="true"][data-verdict="good"] { color: var(--green); border-color: var(--green); }
.rate[aria-pressed="true"][data-verdict="bad"] { color: var(--red); border-color: var(--red); }
.rated { flex-basis: 100%; font-style: normal; font-family: var(--f-mono); font-size: 11px; }
.rated:empty { display: none; }
figcaption { font-family: var(--f-mono); font-size: 10.5px; color: var(--ink-faint); margin-top: 5px; }
.label { font-family: var(--f-mono); font-size: 11.5px; line-height: 1.6; border-top: 1px solid var(--rule); padding-top: 8px; }
.label dt { color: var(--ink-faint); text-transform: uppercase; letter-spacing: .08em; font-size: 10px; }
.label dd { margin: 0 0 6px; }
.quote { font-size: 25px; line-height: 1.25; font-style: italic; color: var(--ink); margin: 6px 0 12px; text-wrap: pretty; }
.quote::before { content: "\201C"; color: var(--gold); font-family: var(--f-plate); font-size: 1.9em; line-height: 0; vertical-align: -.35em; margin-right: 4px; font-style: normal; }
.quote.small { font-size: 18px; margin: 4px 0 8px; }
.tag { display: inline-block; font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--paper); background: var(--gold); padding: 1px 7px; }
.cycle { display: flex; gap: 1px; margin: 8px 0 4px; height: 10px; }
.cycle i { flex: 1; background: var(--rule); }
.cycle i.done { background: var(--ink-faint); }
.cycle i.today { background: var(--gold); }
.ahead { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr); padding-block: 14px 22px; }
.ahead.duo { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); }
.ahead > section, .back > section { min-width: 0; padding: 0 20px; border-left: 1px solid var(--rule); }
.ahead > section:first-child, .back > section:first-child { padding-left: 0; border-left: 0; }
.ahead > section:last-child, .back > section:last-child { padding-right: 0; }
.ahead h2, .back h2 { font-size: 22px; margin-bottom: 10px; }
.trend { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 28px; padding-block: 16px 22px; border-top: 1px solid var(--rule); }
.trend > * { min-width: 0; }
.trend h2 { font-size: 22px; margin-bottom: 8px; }
.trend .almanac { margin-top: 10px; }
.trend .facts { margin-top: 4px; }
.trend-line .forecast { stroke-dasharray: 4 5; stroke-opacity: .75; }
.trend-line .ring { fill: none; stroke: var(--accent); }
.wx-now { display: flex; align-items: center; gap: 14px; }
.wx-hi { font-weight: 800; font-size: 54px; line-height: 1; color: var(--ink); }
.wx-hi span { font-size: 26px; color: var(--ink-faint); font-weight: 600; }
.wx-desc { font-size: 16px; color: var(--ink); }
.spark, .bars { display: block; width: 100%; height: auto; margin: 10px 0 6px; overflow: visible; }
.spark text, .bars text { font-family: var(--f-mono); font-size: 9.5px; fill: var(--ink-faint); }
.spark .area { fill: var(--accent); fill-opacity: .14; }
.spark .line { fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linejoin: round; }
.spark .grid, .bars .grid { stroke: var(--rule); stroke-width: 1; stroke-dasharray: 2 3; }
.spark .dot { fill: var(--gold); }
.bars .bar { fill: var(--rule); }
.bars .bar.on { fill: var(--accent); }
.bars .val { fill: var(--ink); font-weight: 600; }
.almanac { font-family: var(--f-mono); font-size: 12px; }
.almanac div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px dotted var(--rule); }
.almanac b { color: var(--ink); font-weight: 600; text-align: right; }
.outlook { font-family: var(--f-mono); font-size: 12px; }
.outlook div { display: grid; grid-template-columns: 3em minmax(0, 1fr) auto; gap: 10px; padding: 5px 0; border-bottom: 1px dotted var(--rule); }
.outlook b { color: var(--gold); font-weight: 600; }
.outlook em { font-style: normal; color: var(--ink); }
.meanwhile { margin-top: 14px; padding: 10px 12px; background: var(--paper-deep); border-left: 2px solid var(--accent); font-size: 15px; font-style: italic; }
.meanwhile p { margin: 0; }
.next { display: grid; gap: 12px; }
.next > div { padding-bottom: 12px; border-bottom: 1px dotted var(--rule); }
.next > div:last-child { border-bottom: 0; }
.next .src { font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
.next h3 { font-size: 18px; margin: 2px 0 4px; }
.next p { font-size: 15px; margin: 0 0 6px; }
.magazine { padding-block: 14px 22px; border-bottom: 3px double var(--rule); }
.mag-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 14px; }
.models { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 28px; padding-block: 16px 22px; border-top: 1px solid var(--rule); }
.models > * { min-width: 0; }
.models h2 { font-size: 22px; margin-bottom: 8px; }
.models .table-wrap { margin-top: 16px; }
.models-table td b { color: var(--ink); font-weight: 600; }
.models-table th:last-child, .models-table td:last-child { text-align: right; }
.models .src { display: block; font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); margin-top: 2px; }
.modelbar { display: block; max-width: 220px; height: 3px; margin-top: 5px; background: var(--paper-deep); }
.modelbar i { display: block; height: 100%; background: var(--accent); }
.models-month { border-left: 1px solid var(--rule); padding-left: 24px; }
.models.quiet { grid-template-columns: minmax(0, 1fr); gap: 0; }
.models.quiet .models-month { border-left: 0; padding-left: 0; }
.models.quiet .model-bars { max-width: 34em; }
.models.quiet .models-day h2 { font-size: 18px; margin-bottom: 2px; }
.models.quiet .models-day .note { margin-top: 4px; }
.models.quiet .models-month { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--rule); }
.models.quiet .almanac { max-width: 34em; }
.model-total { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; margin: 4px 0 12px; }
.model-total b { font-family: var(--f-serif); font-size: 40px; font-weight: 800; color: var(--ink); line-height: 1; }
.model-total span { font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); }
.model-bars { margin-top: 14px; }
.model-bars .row { padding: 7px 0; border-bottom: 1px dotted var(--rule); }
.model-bars .row > div:first-child { display: flex; justify-content: space-between; gap: 10px; font-family: var(--f-mono); font-size: 11.5px; }
.model-bars .row b { color: var(--ink); font-weight: 600; }
.model-bars .meter { margin-top: 5px; }
.perks { padding-block: 16px 22px; border-top: 1px solid var(--rule); }
.perk-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.perk { border: 1px solid var(--rule); background: var(--paper-deep); padding: 10px; min-width: 0; }
.perk.on { border-color: var(--accent); }
.perk.active { box-shadow: inset 0 0 0 1px var(--accent); }
.perk.next { border-style: dashed; }
.perk.locked { opacity: .55; }
.perk .swatch { display: flex; height: 30px; margin-bottom: 8px; border: 1px solid var(--rule); }
.perk .swatch i { flex: 1; }
.perk h3 { font-size: 15px; margin: 0 0 3px; }
.perk .kicker { margin: 0 0 3px; }
.perk .note { font-size: 11.5px; margin: 0; }
.pro { display: grid; grid-template-columns: auto minmax(0, 1.6fr) minmax(0, .7fr); gap: 18px 24px; align-items: center; margin-block: 4px 22px; padding: 18px 20px; background: var(--paper-deep); border: 1px solid var(--rule); border-left: 3px solid var(--gold); }
.pro-mark { display: grid; place-items: center; width: 54px; height: 54px; border: 1px solid var(--gold); color: var(--gold); font-family: var(--f-plate); font-size: 38px; line-height: 1; }
.pro-copy { min-width: 0; }
.pro-copy h2 { font-size: 30px; margin-bottom: 6px; }
.pro-copy .deck { font-size: 17px; margin: 0 0 8px; }
.pro-copy .note { margin: 0; }
.pro-cta { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; justify-self: end; }
.btn.pro-btn { border-color: var(--gold); color: var(--gold); padding: 9px 14px; font-size: 12px; letter-spacing: .02em; text-transform: none; }
.btn.pro-btn[disabled] { opacity: .6; cursor: not-allowed; }
.btn.pro-btn[disabled]:hover { border-color: var(--gold); color: var(--gold); }
.pro-soon { font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); }
.pro-preview { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 18px 32px; margin-block: 4px 22px; padding: 18px 20px; background: var(--paper-deep); border: 1px solid var(--rule); border-left: 3px solid var(--gold); }
.pro-preview-copy { min-width: 0; }
.pro-preview-copy .kicker { color: var(--ink-soft); }
.pro-preview-copy h2 { font-size: 30px; margin-bottom: 6px; }
.pro-preview-copy .deck { font-size: 17px; margin: 0 0 12px; }
.pro-preview-copy .note { color: var(--ink-soft); margin: 8px 0 0; }
.pro-preview .pro-cta { justify-self: start; }
.pro-preview-desks { min-width: 0; }
.pro-desk { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 10px 0; border-bottom: 1px dotted var(--rule); }
.pro-desk:last-child { border-bottom: 0; }
.pro-desk .slot-kicker { margin: 0; color: var(--ink); }
.pro-desk .slot-kicker .src { color: var(--ink-soft); }
.pro-desk > p:last-child { grid-column: 1 / -1; font-size: 14px; margin: 0; }
.pro-tag { display: inline-block; font-family: var(--f-mono); font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink); border: 1px solid var(--gold); padding: 1px 6px; white-space: nowrap; }
.pro-preview .pro-soon { color: var(--ink-soft); }
.habit { --cell: 26px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 20px 36px; align-items: start; padding-block: 16px 22px; border-top: 1px solid var(--rule); }
.habit-grid { display: grid; grid-template-columns: auto auto; gap: 8px 10px; align-items: center; }
.habit-days { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: 4px; align-items: center; font-family: var(--f-mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); }
.habit-cells { display: grid; grid-template-rows: repeat(7, var(--cell)); grid-auto-flow: column; grid-auto-columns: var(--cell); gap: 4px; }
.habit .cell { display: grid; place-items: center; border: 1px solid var(--rule); background: var(--paper-deep); font-family: var(--f-mono); font-size: 13px; line-height: 1; color: var(--paper); }
.habit .cell.on { background: var(--accent); border-color: var(--accent); }
.habit .cell.today { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.habit .cell.future, .habit .cell.before { background: transparent; border-style: dotted; opacity: .45; }
.habit-copy { max-width: 36em; }
.habit-copy h2 { font-size: 26px; margin-bottom: 8px; }
.habit-copy .note { margin-top: 12px; }
.back { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr); padding-block: 18px 22px; border-top: 3px double var(--rule); }
.back .how { font-size: 14px; color: var(--ink-faint); font-style: italic; margin-bottom: 10px; }
.jumble { display: grid; gap: 9px; }
.jrow { display: grid; grid-template-columns: minmax(0, 1fr) 7.2em 1.4em; align-items: center; gap: 10px; }
.jrow .clue { font-size: 14px; line-height: 1.3; }
.jrow .clue b { display: block; font-family: var(--f-mono); font-size: 15px; letter-spacing: .3em; color: var(--gold); font-weight: 600; }
.jrow input { width: 100%; font-family: var(--f-mono); font-size: 14px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink); background: var(--paper-deep); border: 1px solid var(--rule); padding: 5px 7px; }
.jrow input.right { border-color: var(--green); color: var(--green); }
.jrow .mark { font-family: var(--f-mono); color: var(--green); text-align: center; }
.jtools { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; font-family: var(--f-mono); font-size: 12px; color: var(--ink-faint); }
.btn { font-family: var(--f-mono); font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink); background: transparent; border: 1px solid var(--rule); padding: 5px 10px; cursor: pointer; }
.btn:hover { border-color: var(--accent); color: var(--accent); }
.hang[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); }
body.hung { background-size: auto 100vh; background-repeat: repeat-x; }
.tip { background: var(--paper-deep); border: 1px solid var(--rule); padding: 14px 14px 4px; margin: 6px 0 12px; }
.corrections { border: 1px solid var(--rule); border-top: 2px solid var(--red); padding: 10px 12px; margin-bottom: 16px; font-size: 14px; }
.corrections .kicker { color: var(--red); }
.corrections p:last-child { margin: 0; }
.ad { font-size: 14px; line-height: 1.4; padding: 8px 0; border-bottom: 1px dotted var(--rule); margin: 0; }
.ad:last-child { border-bottom: 0; }
.ad b { font-family: var(--f-mono); font-size: 11px; letter-spacing: .12em; color: var(--gold); font-weight: 600; margin-right: 4px; }
.issues { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 14px 0; margin-top: 8px; border-top: 3px double var(--rule); font-family: var(--f-mono); font-size: 12px; letter-spacing: .04em; }
.issues .allgroup { display: flex; gap: 8px; align-items: center; justify-self: center; }
.issues > :first-child { justify-self: start; }
.issues > :last-child { justify-self: end; }
.issues a { text-decoration: none; }
.issues .off { color: var(--ink-faint); }
.issues .all { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid var(--accent); background: var(--paper-deep); color: var(--ink); font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
.issues .all:hover { background: var(--accent); color: var(--paper); border-color: var(--accent); }
.issues .all .count { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding-inline: 5px; border-radius: 999px; background: var(--accent); color: var(--paper); font-size: 10px; letter-spacing: 0; }
.issues .all:hover .count { background: var(--paper); color: var(--accent); }
.issues .all.ghost { background: transparent; border-color: var(--rule); color: var(--ink-soft); }
.issues .all.ghost:hover { background: var(--accent); border-color: var(--accent); color: var(--paper); }

/* The integration library: a card per app, enabled or not. */
.lib-sheet { max-width: 1180px; }
.lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 18px 0 22px; }
.int-card { display: flex; flex-direction: column; gap: 5px; padding: 14px; border: 1px solid var(--rule); background: var(--paper-deep); min-height: 152px; }
.int-card.off { opacity: .7; }
.int-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.int-mark { display: inline-grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--rule); font-family: var(--f-mono); font-size: 12px; font-weight: 700; letter-spacing: .04em; color: var(--accent); }
.int-card.on .int-mark { background: var(--accent); color: var(--paper); border-color: var(--accent); }
.int-pill { font-family: var(--f-mono); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 7px; border: 1px solid var(--rule); color: var(--ink-faint); white-space: nowrap; }
.int-pill.on { color: var(--gold); border-color: var(--gold); }
.int-card h3 { margin: 0; font-size: 17px; }
.int-cat { margin: 0; font-family: var(--f-mono); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-faint); }
.int-desc { margin: 0; font-size: 12.5px; line-height: 1.35; color: var(--ink-soft); }
.int-cta { margin-top: auto; display: inline-flex; align-items: center; justify-content: center; padding: 7px 10px; border: 1px solid var(--accent); color: var(--accent); font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; }
.int-cta:hover { background: var(--accent); color: var(--paper); }
.int-cta.on { border-color: var(--gold); color: var(--gold); }
.yearago { margin: 0 0 12px; padding: 10px 12px; background: var(--paper-deep); border-left: 2px solid var(--gold); }
.yearago p:last-child { margin: 0; }
.colophon { padding-top: 14px; border-top: 1px solid var(--rule); font-family: var(--f-mono); font-size: 11px; color: var(--ink-faint); line-height: 1.7; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; }

/* On the table: the sheet as paper lying on a desk. Grain and wood are
   drawn here (SVG noise and gradients), so nothing is downloaded. */
[data-style="table"] body {
  background-color: #2a1d14;
  background-image:
    radial-gradient(ellipse at 50% 18%, rgba(255, 236, 200, .16), transparent 62%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012 .32' numOctaves='3' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 .32 0 0 0 0 .2 0 0 0 0 .11 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='600' height='600' filter='url(%23w)'/%3E%3C/svg%3E"),
    linear-gradient(180deg, #3b2919, #241811);
  background-size: 100% 100%, 600px 600px, 100% 100%;
  background-repeat: no-repeat, repeat, no-repeat;
  background-position: center top, 0 0, center top;
  background-attachment: fixed;
}
[data-style="table"] body.hung { background-size: auto 100vh; }
[data-style="table"] {
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .45 0 0 0 0 .38 0 0 0 .22 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23g)'/%3E%3C/svg%3E");
}
[data-style="table"] .sheet {
  background: var(--grain), linear-gradient(172deg, rgba(255, 255, 255, .05), rgba(0, 0, 0, .05)), var(--paper);
  border: 0;
  -webkit-backdrop-filter: none; backdrop-filter: none;
  transform: rotate(-.45deg);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, .22),
    0 3px 6px rgba(0, 0, 0, .18),
    0 18px 30px -8px rgba(0, 0, 0, .45),
    0 46px 90px -20px rgba(0, 0, 0, .55),
    inset 0 0 70px rgba(120, 90, 50, .08);
}
/* The fold across the middle, and the edges catching a little shade. */
[data-style="table"] .sheet::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background:
    linear-gradient(180deg, transparent 49.4%, rgba(0, 0, 0, .09) 49.85%, rgba(255, 255, 255, .07) 50.15%, transparent 50.6%),
    linear-gradient(90deg, rgba(0, 0, 0, .05), transparent 8%, transparent 92%, rgba(0, 0, 0, .06));
}
[data-style="table"] .sheet h1, [data-style="table"] .sheet h2, [data-style="table"] .plate { text-shadow: 0 0 .6px rgba(0, 0, 0, .35); }
[data-style="table"] figure img { filter: grayscale(1) contrast(1.08) sepia(.18); }
[data-style="table"] .wallnote { color: rgba(255, 240, 220, .75); }
/* The share card: a fixed 1200×630 frame for social posts. */
.card-body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: var(--paper); }
[data-style="table"] .card-body { background-size: 100% 100%, 600px 600px, 100% 100%; }
.card { box-sizing: border-box; width: 1120px; height: 560px; margin: 35px 40px; padding: 30px 40px 22px; display: flex; flex-direction: column; background: var(--paper); border: 2px solid var(--accent); position: relative; }
[data-style="table"] .card { border: 0; transform: rotate(-.6deg); box-shadow: 0 3px 6px rgba(0,0,0,.25), 0 30px 60px -12px rgba(0,0,0,.6);
  background: var(--grain, none), var(--paper); }
.card .plate { font-size: 64px; padding: 0; }
.card .dateline { margin-top: 10px; }
.card-main { flex: 1; display: flex; gap: 32px; align-items: stretch; margin-top: 22px; min-height: 0; }
.card-copy { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.card h1 { font-size: 50px; line-height: 1.05; margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.card.with-pic h1 { font-size: 42px; }
.card-stats { display: flex; gap: 34px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--rule); }
.card-stats b { display: block; font-family: var(--f-serif); font-size: 40px; color: var(--ink); line-height: 1; }
.card-stats span { font-family: var(--f-mono); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); }
.card-pic { flex: 0 0 470px; margin: 0; position: relative; overflow: hidden; border: 1px solid var(--rule); }
.card-pic img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.08); display: block; }
.card-pic blockquote { position: absolute; inset: 0 0 auto; margin: 0; padding: 22px 26px 50px; text-align: center; color: #fff; background: linear-gradient(rgba(0,0,0,.6), rgba(0,0,0,0)); text-shadow: 0 1px 10px rgba(0,0,0,.5); }
.card-pic p { font-family: var(--f-serif); font-style: italic; font-weight: 600; font-size: 22px; line-height: 1.2; margin: 0 0 6px; }
.card-pic cite { font-family: var(--f-mono); font-style: normal; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
.card-foot { margin-top: 14px; font-family: var(--f-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); }
@media (max-width: 920px) {
  .fold { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 22px; }
  .fold > article:nth-child(odd) { padding-left: 0; border-left: 0; }
  .ahead, .back { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 22px; }
  .perk-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ahead > section:nth-child(3), .back > section:nth-child(3) { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-top: 1px solid var(--rule); padding-top: 16px; }
  .back .directory ~ section:nth-child(3) { grid-column: auto; padding-left: 20px; border-left: 1px solid var(--rule); border-top: 0; padding-top: 0; }
  .back .directory ~ section:nth-child(4) { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-top: 1px solid var(--rule); padding-top: 16px; }
}
@media (max-width: 760px) {
  .front, .desk, .mag-cols, .habit, .models, .trend, .pro, .pro-preview, .desk-row, .desk-pair, .ahead-row { grid-template-columns: minmax(0, 1fr); }
  .pro-mark { display: none; }
  .pro-cta { justify-self: start; }
  .pro-preview-copy h2 { font-size: 26px; }
  .models-month { border-left: 0; padding-left: 0; border-top: 1px solid var(--rule); padding-top: 16px; }
  .lead { padding-right: 0; }
  .wire { padding-left: 0; border-left: 0; border-top: 1px solid var(--rule); }
  .ears span:nth-child(2) { display: none; }
  .seal { width: 78px; height: 78px; font-size: 8px; top: 8px; right: 8px; }
}
@media (max-width: 560px) {
  body { background-attachment: scroll; }
  .fold, .ahead, .back { grid-template-columns: minmax(0, 1fr); }
  .perk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fold > article, .ahead > section, .back > section { padding: 16px 0 0 !important; border-left: 0 !important; border-top: 1px solid var(--rule); }
  .letters { columns: 1; }
  .dir-list { grid-template-columns: 1fr; }
  [data-style="table"] .sheet { transform: none; }
}
/* On paper: a broadsheet, black on white, no window and no wallpaper. */
@page { size: 11in 17in; margin: 0.5in; }
@media print {
  :root { --paper: #fff; --paper-deep: #f3f3f3; --ink: #000; --ink-soft: #111; --ink-faint: #555; --rule: #999; --accent: #000; --gold: #000; --red: #000; --green: #000; }
  body { background: #fff !important; font-size: 11pt; }
  [data-style="table"] .sheet { transform: none; box-shadow: none !important; background: #fff !important; }
  [data-style="table"] .sheet::before { display: none; }
  .share { display: none; }
  .desktop { padding: 0; }
  .sheet { border: 0; box-shadow: none; background: #fff; max-width: none; padding: 0; backdrop-filter: none; }
  .wallnote, .btn, .jtools, .issues, .jrow input, .jrow .mark, .pro-cta { display: none !important; }
  .seal { background: #fff; color: #000; border-color: #000; box-shadow: none; }
  .habit .cell { border-color: #000; }
  .habit .cell.on { background: #000 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .habit .cell.future, .habit .cell.before { opacity: 1; }
  .fold, .ahead, .back, .front, .desk, .habit, .models, .perks, .pro, .pro-preview, .slot, .desk-row, .desk-pair, .ahead-row, .directory { break-inside: avoid; }
  .slot-foot a, .notice a, .dir-row .act { display: none !important; }
  .slot.live .slot-status .dot { animation: none !important; }
  .pro { grid-template-columns: auto minmax(0, 1fr); }
  .perk .swatch { display: none; }
  figure img { filter: grayscale(1); }
  a { color: #000; text-decoration: none; }
}
`

function script(ed) {
  const data = {
    name: ed.name,
    temps: ed.weather && !ed.weather.missing ? ed.weather.temps : [],
    days: ed.week.days.map(d => [d.label, d.date, d.count]),
    wall: ed.theme.wallpaper ? "Printed over your desktop · " + ed.theme.wallpaper + ", " + ed.theme.theme : "",
    art: ed.picks.easel && ed.picks.easel.title ? "Printed over " + (ed.picks.easel.artist ? ed.picks.easel.artist + " · " : "") + ed.picks.easel.title : ""
  }
  return "<script>var DAILY = " + JSON.stringify(data).replace(/</g, "\\u003c") + ";\n" + String.raw`
(function () {
  var g = document.getElementById("greet");
  if (g) {
    var h = new Date().getHours(), n = DAILY.name ? ", " + DAILY.name + "." : ".";
    g.textContent = (h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + n;
  }
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e);
    return e;
  }
  var sp = document.getElementById("spark"), temps = DAILY.temps;
  if (sp && temps.length > 1) {
    var lo = Math.floor(Math.min.apply(null, temps) - 1), hi = Math.ceil(Math.max.apply(null, temps) + 1);
    var L = 26, R = 292, T = 8, B = 72, last = temps.length - 1;
    var x = function (i) { return L + (R - L) * i / last; };
    var y = function (t) { return B - (B - T) * (t - lo) / Math.max(1, hi - lo); };
    [lo, Math.round((lo + hi) / 2), hi].forEach(function (t) {
      el("line", { "class": "grid", x1: L, x2: R, y1: y(t), y2: y(t) }, sp);
      el("text", { x: L - 5, y: y(t) + 3, "text-anchor": "end" }, sp, t + "°");
    });
    var pts = temps.map(function (t, i) { return x(i).toFixed(1) + "," + y(t).toFixed(1); });
    el("polygon", { "class": "area", points: x(0) + "," + B + " " + pts.join(" ") + " " + x(last) + "," + B }, sp);
    el("polyline", { "class": "line", points: pts.join(" ") }, sp);
    var hiI = temps.indexOf(Math.max.apply(null, temps));
    el("circle", { "class": "dot", cx: x(hiI), cy: y(temps[hiI]), r: 3.2 }, sp);
    [[0, "12a"], [6, "6a"], [12, "12p"], [18, "6p"], [last, "11p"]].forEach(function (h) {
      el("text", { x: x(h[0]), y: 88, "text-anchor": h[0] === 0 ? "start" : h[0] === last ? "end" : "middle" }, sp, h[1]);
    });
  }
  var bs = document.getElementById("bars");
  if (bs) {
    var max = Math.max(5, Math.max.apply(null, DAILY.days.map(function (d) { return d[2]; })));
    var top = 14, base = 112, slot = 300 / 7, w = slot * 0.56;
    [0, max].forEach(function (v) { var yy = base - (base - top) * v / max; el("line", { "class": "grid", x1: 0, x2: 300, y1: yy, y2: yy }, bs); });
    DAILY.days.forEach(function (d, i) {
      var cx = slot * i + slot / 2, hgt = Math.max(2, (base - top) * d[2] / max);
      el("rect", { "class": "bar" + (d[2] ? " on" : ""), x: cx - w / 2, y: base - hgt, width: w, height: hgt }, bs);
      if (d[2]) el("text", { "class": "val", x: cx, y: base - hgt - 5, "text-anchor": "middle" }, bs, d[2]);
      el("text", { x: cx, y: base + 16, "text-anchor": "middle" }, bs, d[0]);
      el("text", { x: cx, y: base + 29, "text-anchor": "middle" }, bs, d[1]);
    });
  }
  document.querySelectorAll(".cycle").forEach(function (c) {
    var pos = +c.dataset.pos, total = +c.dataset.total;
    for (var i = 1; i <= total; i++) { var t = document.createElement("i"); if (i < pos) t.className = "done"; if (i === pos) t.className = "today"; c.appendChild(t); }
  });
  var hang = document.getElementById("hang"), art = document.getElementById("easel-img"), note = document.getElementById("wallnote");
  if (hang && art) {
    var wall = getComputedStyle(document.body).backgroundImage;
    hang.addEventListener("click", function () {
      var on = hang.getAttribute("aria-pressed") !== "true";
      hang.setAttribute("aria-pressed", on ? "true" : "false");
      document.body.style.backgroundImage = on ? 'url("' + art.src + '")' : wall;
      document.body.classList.toggle("hung", on);
      hang.textContent = on ? "Take it down" : "Hang it behind the paper";
      if (note) note.textContent = on ? DAILY.art : DAILY.wall;
    });
  }
  // The page can't write to disk, so a verdict goes to the menu bar app by its
  // inkwell-daily:// link; the command is shown for anyone without the app.
  var pf = document.querySelector(".portrait");
  if (pf) {
    var store = "inkwell-portrait-" + pf.dataset.date, said = pf.querySelector(".rated");
    var mark = function (v) {
      pf.querySelectorAll(".rate").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.verdict === v ? "true" : "false"); });
      if (v) said.textContent = "Sent to Inkwell. Without the menu bar app: inkwell-daily portrait " + v + " " + pf.dataset.date;
    };
    try { mark(localStorage.getItem(store)); } catch (e) {}
    pf.querySelectorAll(".rate").forEach(function (b) {
      b.addEventListener("click", function () {
        mark(b.dataset.verdict);
        try { localStorage.setItem(store, b.dataset.verdict); } catch (e) {}
        location.href = "inkwell-daily://portrait?verdict=" + b.dataset.verdict + "&date=" + encodeURIComponent(pf.dataset.date);
      });
    });
  }
  var inputs = document.querySelectorAll("#jumble input"), score = document.getElementById("jscore");
  function check() {
    var n = 0;
    inputs.forEach(function (inp) {
      var ok = inp.value.trim().toUpperCase() === inp.dataset.a;
      inp.classList.toggle("right", ok);
      inp.nextElementSibling.textContent = ok ? "✓" : "";
      if (ok) n++;
    });
    if (score) score.textContent = n === inputs.length ? "All " + n + ". Nicely done" + (DAILY.name ? ", " + DAILY.name : "") + "." : n + " of " + inputs.length + " solved";
  }
  inputs.forEach(function (inp) { inp.addEventListener("input", check); });
  var reveal = document.getElementById("reveal");
  if (reveal) reveal.addEventListener("click", function () { inputs.forEach(function (inp) { inp.value = inp.dataset.a; }); check(); });
})();
</script>`
}

function rootTokens(t, wallCss, f) {
  return ":root { color-scheme: " + t.scheme + "; --paper: " + t.paper + "; --paper-deep: " + t.deep + "; --ink: " + t.ink + "; --ink-soft: " + t.soft +
    "; --ink-faint: " + t.faint + "; --rule: " + t.rule + "; --accent: " + t.accent + "; --gold: " + t.gold + "; --red: " + t.red + "; --green: " + t.green +
    "; --sheet: " + hexA(t.paper, 0.94) + "; --wall: " + wallCss +
    "; --f-plate: " + f.plate + "; --f-serif: " + f.serif + "; --f-mono: " + f.mono + "; }"
}

// The same tokens as CSS custom properties, for a page already on screen.
function styleTokens(palette, font, look) {
  const t = tokens(palette), f = font && font.url ? font : Fonts.get(font)
  return {
    look: paperStyle(look),
    vars: { "color-scheme": t.scheme, "--paper": t.paper, "--paper-deep": t.deep, "--ink": t.ink, "--ink-soft": t.soft, "--ink-faint": t.faint, "--rule": t.rule,
      "--accent": t.accent, "--gold": t.gold, "--red": t.red, "--green": t.green, "--sheet": hexA(t.paper, 0.94), "--f-plate": f.plate, "--f-serif": f.serif, "--f-mono": f.mono },
    fontUrl: f.url
  }
}

// A set page in a new theme and type, without setting it again: only the
// colour and font tokens and the font link change, so it takes no time.
function restyle(html, palette, font, look) {
  const f = font && font.url ? font : Fonts.get(font)
  const out = String(html)
  const root = /<style>:root \{[^}]*\}/.exec(out)
  if (!root) return ""
  const wall = /--wall: (url\("data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+"\)|none)/.exec(root[0])
  // The whole stylesheet is today's, so an older edition takes new looks too.
  const sheet = /<style>:root \{[^}]*\}[\s\S]*?<\/style><\/head>/.exec(out)
  if (!sheet) return ""
  return out.replace(sheet[0], () => "<style>" + rootTokens(tokens(palette), wall ? wall[1] : "none", f) + STYLE + "</style></head>")
    .replace(/(<link rel="stylesheet" href=")[^"]*(">)/, (m, a, b) => a + esc(f.url) + b)
    .replace(/<html lang="en"( data-style="\w+")?>/, '<html lang="en" data-style="' + paperStyle(look) + '">')
}

const STYLES = ["flat", "table"]
const DEFAULT_STYLE = "table"

function paperStyle(id) {
  return STYLES.includes(id) ? id : DEFAULT_STYLE
}

function head(title, t, wall, font, look) {
  const f = font && font.url ? font : Fonts.get(font)
  return "<!doctype html><html lang=\"en\" data-style=\"" + paperStyle(look) + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + esc(title) + "</title>" +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="' + esc(f.url) + '">' +
    "<style>" + rootTokens(t, img(wall) ? 'url("' + img(wall) + '")' : "none", f) +
    STYLE + "</style></head>"
}

function renderEdition(ed) {
  const t = tokens(ed.theme.palette)
  // Escape first, then wrap the last word: the name comes from GECOS.
  const plate = esc(ed.title).replace(/(Daily|Sunday)$/, "<span>$1</span>")
  const late = ed.late ? '<div class="seal" role="note" aria-label="Late edition"><div><b>Late</b>edition<br>' + esc(ed.late.time) + "</div></div>" : ""
  return head(ed.title + " · " + Model.shortDate(ed.editionKey || ed.key), t, ed.wallpaper, ed.font, ed.paperStyle) +
    '<body><div class="desktop"><div class="sheet">' + late +
    '<header><div class="ears"><span>Edition <b>' + esc(ed.editionNo) + "</b> · " + esc(Model.readingLine(ed.minutes)) + "</span>" +
    "<span>" + esc(ed.streak || ed.theme.theme) + "</span>" +
    '<span class="ear-w">' + icon(ed.ear.icon) + "<b>" + esc(ed.ear.text) + "</b>" +
    '<a class="share" href="inkwell-daily://share?date=' + esc(ed.editionKey || ed.key) + '" title="Share a card of this edition">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7.5h14V12"/></svg>Share</a></span></div>' +
    '<div class="plate">' + plate + "</div>" +
    '<p class="motto"><span id="greet">' + esc(Model.greeting(9, ed.name)) + "</span> All of yesterday's work, set on one page.</p>" +
    '<div class="dateline"><span>' + esc(ed.longDate) + "</span><span>" + esc(ed.delivered) + '</span><span class="live">' + esc(ed.press) + "</span></div></header>" +
    issuesNav(ed) +
    '<section class="front">' + leadBlock(ed.lead) + wireBlock(ed.wire, ed.pace) + "</section>" +
    proPreviewBlock(ed.pro) +
    proWrap(deskSlot(deskFor(ed, "mail"), "mail")) +
    deskRow(ed) +
    magazineBlock(ed.magazine) +
    picksBlock(ed.picks, ed.key) +
    belowPair(ed) +
    aheadRow(ed) +
    trendBlock(ed.trend) +
    modelBlock(ed.models) +
    habitBlock(ed.habit) +
    perksBlock(ed.perks, ed.theme) +
    proWrap(otherDesksBlock(ed)) +
    backBlock(ed.back, ed.corrections, proWrap(directoryBlock(ed.desks))) +
    '<footer class="colophon"><span>Set on this machine from your agent logs and git' + (ed.proseUsed ? "; headlines rewritten by Claude from those facts" : "") + ".</span>" +
    "<span>" + (ed.weather && ed.weather.source ? "Weather from " + esc(ed.weather.source) + (ed.weather.source === "Open-Meteo" ? "." : " (Open-Meteo data).") : "") + "</span></footer>" +
    "</div>" + (ed.theme.wallpaper ? '<p class="wallnote" id="wallnote">Printed over your desktop · ' + esc(ed.theme.wallpaper) + ", " + esc(ed.theme.theme) + "</p>" : "") +
    "</div>" + script(ed) + "</body></html>\n"
}

// The share card: 1200×630, made to be posted. It carries the masthead, the
// day's headline, the picture and quote if there is one, and counts. Never
// a prompt, a commit subject, a message or anything from a plugin desk.
function renderShareCard(ed) {
  const t = tokens(ed.theme.palette)
  const p = ed.lead.portrait && ed.lead.portrait.quote ? ed.lead.portrait : null
  const pic = p ? img(p.image) : ""
  const n = ed.share || { prompts: 0, commits: 0 }
  const stat = (v, label) => "<div><b>" + esc(v) + "</b><span>" + esc(label) + "</span></div>"
  const stats = [stat(n.prompts, n.prompts === 1 ? "prompt" : "prompts"), stat(n.commits, n.commits === 1 ? "commit" : "commits")]
  if (ed.pace && ed.pace.rows) {
    const focus = ed.pace.rows.find(r => r.id === "focus")
    if (focus) stats.push(stat(focus.value, focus.value === "1" ? "focus block" : "focus blocks"))
  }
  const plate = esc(ed.title).replace(/(Daily|Sunday)$/, "<span>$1</span>")
  return head(ed.title + " · " + Model.shortDate(ed.editionKey || ed.key), t, "", ed.font, ed.paperStyle) +
    '<body class="card-body"><main class="card' + (pic ? " with-pic" : "") + '">' +
    '<header><div class="plate">' + plate + '</div><div class="dateline"><span>' + esc(ed.longDate) + "</span><span>Edition " + esc(ed.editionNo) + "</span></div></header>" +
    '<section class="card-main"><div class="card-copy"><p class="kicker">' + esc(ed.lead.kicker || "Yesterday") + "</p><h1>" + esc(ed.lead.headline) + "</h1>" +
    '<div class="card-stats">' + stats.join("") + "</div></div>" +
    (pic ? '<figure class="card-pic"><img src="' + pic + '" alt=""><blockquote><p>' + esc(p.quote) + "</p><cite>" + esc(p.author) + "</cite></blockquote></figure>" : "") +
    '</section><footer class="card-foot">Set by Inkwell Daily · a morning paper about yesterday\'s agent work</footer></main></body></html>\n'
}

// Two initials from the name, so a card has a mark without a remote image.
function monogram(name) {
  const parts = String(name || "?").replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean)
  return (((parts[0] || "?")[0] || "") + (parts[1] ? parts[1][0] : "")).slice(0, 2).toUpperCase()
}

function cut(s, n) {
  const v = String(s || "").replace(/\s+/g, " ").trim()
  if (v.length <= n) return v
  return v.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"
}

// The card library: every popular integration, with what is on.
function renderIntegrations(lib, palette, name, font, backKey) {
  const t = tokens(palette)
  const list = (lib && lib.integrations) || []
  const on = list.filter(i => i.connected).length
  const title = Model.mastheadTitle(name, false)
  const card = i => '<article class="int-card ' + (i.connected ? "on" : "off") + '">' +
    '<div class="int-top"><span class="int-mark" aria-hidden="true">' + esc(monogram(i.name)) + "</span>" +
    '<span class="int-pill ' + (i.connected ? "on" : "off") + '">' + (i.connected ? "Enabled" : "Not enabled") + "</span></div>" +
    "<h3>" + esc(i.name) + "</h3>" +
    (i.category ? '<p class="int-cat">' + esc(i.category) + "</p>" : "") +
    (i.description ? '<p class="int-desc">' + esc(cut(i.description, 105)) + "</p>" : "") +
    (i.connected
      ? '<a class="int-cta on" href="https://app.composio.dev" target="_blank" rel="noreferrer">Manage →</a>'
      : (i.connect
        ? '<a class="int-cta" href="' + esc(i.connect) + '" target="_blank" rel="noreferrer">Connect →</a>'
        : '<span class="int-cta">Connect in Composio</span>')) +
    "</article>"

  return head("Integrations · " + title, t, "", font) +
    '<body><div class="desktop"><div class="sheet lib-sheet">' +
    '<header><div class="plate">' + esc(title).replace(/Daily$/, "<span>Daily</span>") + '</div>' +
    '<div class="dateline"><span>' + (list.length || 25) + ' integrations</span><span>' + on + ' enabled</span></div></header>' +
    '<p class="motto">The apps Inkwell can read through Composio, and which ones are already on.</p>' +
    '<div class="lib">' + list.map(card).join("") + "</div>" +
    '<nav class="issues" aria-label="Integrations">' +
    '<a href="' + esc(backKey) + '.html">← Back to the paper</a>' +
    '<span class="allgroup"><a class="all" href="index.html">All editions</a></span>' +
    '<a href="https://app.composio.dev" rel="noreferrer">Manage in Composio →</a>' +
    "</nav></div></div></body></html>\n"
}

// The bound volume: every edition's masthead and lead, newest first.
function renderIndex(entries, palette, name, font) {
  const t = tokens(palette)
  const title = Model.mastheadTitle(name, false)
  return head(title + " · All editions", t, "", font) +
    '<body><div class="desktop"><div class="sheet"><header><div class="plate">' + esc(title).replace(/Daily$/, "<span>Daily</span>") + '</div><p class="motto">Every edition, newest first.</p></header>' +
    '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Edition</th><th>Lead</th><th>Read</th></tr></thead><tbody>' +
    entries.map(e => '<tr><td><a href="' + esc(e.date) + '.html">' + esc(Model.longDate(e.date)) + "</a>" + (e.weekend ? ' <span class="tag">Sunday</span>' : "") + (e.late ? ' <span class="tag">Late</span>' : "") +
      "</td><td>" + esc(Model.editionNumber(e.date)) + "</td><td>" + esc(e.headline) + "</td><td>" + num(e.minutes) + " min</td></tr>").join("") +
    "</tbody></table></div></div></div></body></html>\n"
}

function plainText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ")
}

module.exports = { STYLES, renderEdition, renderIndex, renderIntegrations, renderShareCard, restyle, styleTokens, plainText, esc, tokens }
