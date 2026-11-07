// Prints the edition as one self-contained page: a broadsheet in the theme's
// own colours, set on the wallpaper like a window. Pure — an edition object
// in, HTML out.

"use strict"

const Model = require("../Model.js")

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

// A number from a deck or a log, or nothing.
function num(n) {
  const v = Number(n)
  return isFinite(v) ? String(Math.round(v)) : ""
}

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
  storm: '<path d="M7 15.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 15.5z"/><path d="m12.5 15.5-2 3.6h3l-2 3.4"/>'
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

function paras(list, firstDrop) {
  return (list || []).map((p, i) => "<p" + (firstDrop && i === 0 ? ' class="drop"' : "") + ">" + rich(p) + "</p>").join("")
}

function commitTable(commits) {
  if (!commits || !commits.length) return ""
  return '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Plugin</th><th>Commit</th></tr></thead><tbody>' +
    commits.slice(0, 12).map(c => "<tr><td>" + esc(c.time) + "</td><td>" + esc(c.plugin) + "</td><td>" + esc(c.subject) + "</td></tr>").join("") +
    "</tbody></table></div>" + (commits.length > 12 ? '<p class="note">And ' + (commits.length - 12) + " more.</p>" : "")
}

function leadBlock(lead) {
  let body = ""
  if (lead.kind === "desk") body = '<div class="cols">' + paras(lead.paragraphs, true) + "</div>" + commitTable(lead.commits) + (lead.facts ? '<p class="facts">' + esc(lead.facts) + "</p>" : "")
  if (lead.kind === "pick") body = '<div class="cols">' + paras(lead.paragraphs, true) + "</div>" + (lead.facts ? '<p class="facts">' + esc(lead.facts) + "</p>" : "")
  if (lead.kind === "kickoff") body = '<ul class="log" aria-label="Goal log">' + lead.log.map(l => "<li><time>" + esc(l.time) + '</time><span class="s">' + esc(l.text) + "</span><span>" + esc(l.detail) + "</span></li>").join("") + "</ul>"
  return '<article class="lead">' +
    (lead.kicker ? '<p class="kicker">' + esc(lead.kicker) + "</p>" : "") +
    "<h1>" + esc(lead.headline) + "</h1>" +
    (lead.deck ? '<p class="deck">' + esc(lead.deck) + "</p>" : "") +
    (lead.byline ? '<div class="byline">' + esc(lead.byline) + "</div>" : "") + body + "</article>"
}

function wireBlock(w) {
  return '<aside class="wire"><p class="kicker">' + esc(w.kicker) + "</p><h2>" + esc(w.title) + "</h2>" + stats(w.stats) +
    (w.note ? '<p class="note">' + rich(w.note) + "</p>" : "") +
    w.briefs.map(b => '<div class="brief">' + (b.kicker ? '<p class="kicker">' + esc(b.kicker) + "</p>" : "") + "<h3>" + esc(b.title) + "</h3><p>" + esc(b.text) + "</p></div>").join("") +
    "</aside>"
}

function deskBlock(d) {
  if (!d) return ""
  if (d.paragraphs.length <= 1) return '<section class="desk single"><article><p class="kicker">' + esc(d.kicker || "Agent desk") + "</p><h2>" + esc(d.headline) + "</h2>" +
    (d.deck ? '<p class="deck">' + esc(d.deck) + "</p>" : "") + paras(d.paragraphs) + commitTable(d.commits) + (d.facts ? '<p class="facts">' + esc(d.facts) + "</p>" : "") + "</article></section>"
  const half = Math.ceil(d.paragraphs.length / 2)
  return '<section class="desk"><article><p class="kicker">' + esc(d.kicker || "Agent desk") + "</p><h2>" + esc(d.headline) + "</h2>" +
    (d.deck ? '<p class="deck">' + esc(d.deck) + "</p>" : "") + paras(d.paragraphs.slice(0, half)) + "</article><article>" +
    (d.paragraphs.length > 1 ? '<p class="kicker">Also on the desk</p>' : "") + paras(d.paragraphs.slice(half)) + commitTable(d.commits) +
    (d.facts ? '<p class="facts">' + esc(d.facts) + "</p>" : "") + "</article></section>"
}

// Sections from plugin sources (Inkwell Pro's mail desk, and others).
function extrasBlock(x) {
  if (!x || !x.sections.length) return ""
  return '<div class="fold-head"><h2>From your other desks</h2></div><section class="desk extras">' + x.sections.map(s =>
    '<article><p class="kicker">' + esc(s.kicker) + "</p><h2>" + esc(s.headline) + "</h2>" + (s.deck ? '<p class="deck">' + esc(s.deck) + "</p>" : "") +
    (s.items.length ? '<ul class="log">' + s.items.map(i => "<li><time>" + esc(i.time) + '</time><span class="s"></span><span><b>' + esc(i.title) + "</b>" +
      (i.tag ? ' <span class="tag">' + esc(i.tag) + "</span>" : "") + (i.detail ? "<br>" + esc(i.detail) : "") + "</span></li>").join("") + "</ul>" : "") +
    (s.note ? '<p class="note">' + esc(s.note) + "</p>" : "") + "</article>").join("") + "</section>"
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

function magazineBlock(m) {
  if (!m) return ""
  return '<div class="fold-head"><h2>The Sunday magazine · Your week</h2></div><section class="magazine">' +
    '<div class="table-wrap"><table><thead><tr><th>Day</th><th>Prompts</th><th>Shipped</th><th>Building</th><th>Picture</th></tr></thead><tbody>' +
    m.days.map(d => "<tr><td>" + esc(d.day) + "</td><td>" + num(d.prompts) + "</td><td>" + esc(d.commits.slice(0, 2).join("; ") || "—") + "</td><td>" + esc(d.building || "—") + "</td><td>" + esc(d.art || "—") + "</td></tr>").join("") +
    "</tbody></table></div>" +
    '<div class="mag-cols"><div><p class="kicker">The week\'s lines</p>' + m.days.filter(d => d.quote).map(d => '<p class="quote small">' + esc(d.quote) + '</p><p class="facts">' + esc(d.day) + "</p>").join("") + "</div>" +
    '<div><p class="kicker">Kickoff, the week</p>' + (m.goals.length ? '<ul class="log">' + m.goals.map(g => "<li><time>" + esc(g.when) + '</time><span class="s"></span><span>' + esc(g.text) + "</span></li>").join("") + "</ul>" : '<p class="note">No goals on the wire this week.</p>') + "</div></div></section>"
}

function backBlock(b, corrections) {
  const j = b.jumble.length ? '<div class="jumble" id="jumble">' + b.jumble.map((r, i) =>
    '<div class="jrow"><label class="clue" for="j' + i + '"><b>' + esc(r.scramble) + "</b>" + esc(r.clue) + '</label><input id="j' + i + '" data-a="' + esc(r.answer) + '" maxlength="' + r.answer.length + '" autocomplete="off" spellcheck="false"><span class="mark" aria-live="polite"></span></div>').join("") +
    '</div><div class="jtools"><button class="btn" type="button" id="reveal">Show answers</button><span id="jscore" aria-live="polite">0 of ' + b.jumble.length + " solved</span></div>" : '<p class="note">Not enough names in the day for a puzzle.</p>'
  const k = b.keybind
  return '<div class="fold-head"><h2>The back page</h2></div><section class="back">' +
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
  return '<nav class="issues" aria-label="Back issues">' + link(i.prev, "← " + (i.prev ? esc(Model.shortDate(i.prev.date)) : "No earlier edition")) +
    '<a href="index.html">All editions</a>' + link(i.next, (i.next ? esc(Model.shortDate(i.next.date)) : "Newest") + " →") + "</nav>" +
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
.fold { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding-block: 14px 22px; }
.fold > article { min-width: 0; padding: 0 20px; border-left: 1px solid var(--rule); }
.fold > article:first-child { padding-left: 0; border-left: 0; }
.fold > article:last-child { padding-right: 0; }
.fold .wide { grid-column: span 2; }
figure { margin: 0 0 12px; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); }
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
.ahead > section, .back > section { min-width: 0; padding: 0 20px; border-left: 1px solid var(--rule); }
.ahead > section:first-child, .back > section:first-child { padding-left: 0; border-left: 0; }
.ahead > section:last-child, .back > section:last-child { padding-right: 0; }
.ahead h2, .back h2 { font-size: 22px; margin-bottom: 10px; }
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
.issues { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; margin-top: 8px; border-top: 3px double var(--rule); font-family: var(--f-mono); font-size: 12px; letter-spacing: .04em; }
.issues a { text-decoration: none; }
.issues .off { color: var(--ink-faint); }
.yearago { margin: 0 0 12px; padding: 10px 12px; background: var(--paper-deep); border-left: 2px solid var(--gold); }
.yearago p:last-child { margin: 0; }
.colophon { padding-top: 14px; border-top: 1px solid var(--rule); font-family: var(--f-mono); font-size: 11px; color: var(--ink-faint); line-height: 1.7; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; }
@media (max-width: 920px) {
  .fold { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 22px; }
  .fold > article:nth-child(odd) { padding-left: 0; border-left: 0; }
  .ahead, .back { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 22px; }
  .ahead > section:nth-child(3), .back > section:nth-child(3) { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-top: 1px solid var(--rule); padding-top: 16px; }
}
@media (max-width: 760px) {
  .front, .desk, .mag-cols { grid-template-columns: minmax(0, 1fr); }
  .lead { padding-right: 0; }
  .wire { padding-left: 0; border-left: 0; border-top: 1px solid var(--rule); }
  .ears span:nth-child(2) { display: none; }
  .seal { width: 78px; height: 78px; font-size: 8px; top: 8px; right: 8px; }
}
@media (max-width: 560px) {
  body { background-attachment: scroll; }
  .fold, .ahead, .back { grid-template-columns: minmax(0, 1fr); }
  .fold > article, .ahead > section, .back > section { padding: 16px 0 0 !important; border-left: 0 !important; border-top: 1px solid var(--rule); }
}
/* On paper: a broadsheet, black on white, no window and no wallpaper. */
@page { size: 11in 17in; margin: 0.5in; }
@media print {
  :root { --paper: #fff; --paper-deep: #f3f3f3; --ink: #000; --ink-soft: #111; --ink-faint: #555; --rule: #999; --accent: #000; --gold: #000; --red: #000; --green: #000; }
  body { background: #fff !important; font-size: 11pt; }
  .desktop { padding: 0; }
  .sheet { border: 0; box-shadow: none; background: #fff; max-width: none; padding: 0; backdrop-filter: none; }
  .wallnote, .btn, .jtools, .issues, .jrow input, .jrow .mark { display: none !important; }
  .seal { background: #fff; color: #000; border-color: #000; box-shadow: none; }
  .fold, .ahead, .back, .front, .desk { break-inside: avoid; }
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

function head(title, t, wall) {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + esc(title) + "</title>" +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=UnifrakturCook:wght@700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,800;1,6..72,400&family=JetBrains+Mono:wght@400;600&display=swap">' +
    "<style>:root { color-scheme: " + t.scheme + "; --paper: " + t.paper + "; --paper-deep: " + t.deep + "; --ink: " + t.ink + "; --ink-soft: " + t.soft +
    "; --ink-faint: " + t.faint + "; --rule: " + t.rule + "; --accent: " + t.accent + "; --gold: " + t.gold + "; --red: " + t.red + "; --green: " + t.green +
    "; --sheet: " + hexA(t.paper, 0.94) + "; --wall: " + (img(wall) ? 'url("' + img(wall) + '")' : "none") +
    '; --f-plate: "UnifrakturCook", "Old English Text MT", Georgia, serif; --f-serif: "Newsreader", Georgia, "Times New Roman", serif; --f-mono: "JetBrains Mono", ui-monospace, Menlo, monospace; }' +
    STYLE + "</style></head>"
}

function renderEdition(ed) {
  const t = tokens(ed.theme.palette)
  // Escape first, then wrap the last word: the name comes from GECOS.
  const plate = esc(ed.title).replace(/(Daily|Sunday)$/, "<span>$1</span>")
  const late = ed.late ? '<div class="seal" role="note" aria-label="Late edition"><div><b>Late</b>edition<br>' + esc(ed.late.time) + "</div></div>" : ""
  return head(ed.title + " · " + Model.shortDate(ed.key), t, ed.wallpaper) +
    '<body><div class="desktop"><div class="sheet">' + late +
    '<header><div class="ears"><span>Edition <b>' + esc(ed.editionNo) + "</b> · " + esc(Model.readingLine(ed.minutes)) + "</span>" +
    "<span>" + esc(ed.streak || ed.theme.theme) + "</span>" +
    '<span class="ear-w">' + icon(ed.ear.icon) + "<b>" + esc(ed.ear.text) + "</b></span></div>" +
    '<div class="plate">' + plate + "</div>" +
    '<p class="motto"><span id="greet">' + esc(Model.greeting(9, ed.name)) + "</span> All of yesterday's work, set on one page.</p>" +
    '<div class="dateline"><span>' + esc(ed.longDate) + "</span><span>" + esc(ed.delivered) + '</span><span class="live">' + esc(ed.press) + "</span></div></header>" +
    issuesNav(ed) +
    '<section class="front">' + leadBlock(ed.lead) + wireBlock(ed.wire) + "</section>" +
    deskBlock(ed.desk) +
    extrasBlock(ed.extras) +
    magazineBlock(ed.magazine) +
    picksBlock(ed.picks, ed.key) +
    '<div class="fold-head"><h2>Weather, the week, and what\'s next</h2></div><section class="ahead">' + weatherBlock(ed.weather) + tomorrowBlock(ed.tomorrow) + weekBlock(ed.week) + "</section>" +
    backBlock(ed.back, ed.corrections) +
    '<footer class="colophon"><span>Set on this machine from your agent logs and git' + esc(Array.from(new Set(((ed.extras && ed.extras.sections) || []).map(s => s.source))).map(n => ", " + n).join("")) + (ed.proseUsed ? "; headlines rewritten by Claude from those facts" : "") + ".</span>" +
    "<span>" + (ed.weather && ed.weather.source ? "Weather from " + esc(ed.weather.source) + (ed.weather.source === "Open-Meteo" ? "." : " (Open-Meteo data).") : "") + "</span></footer>" +
    "</div>" + (ed.theme.wallpaper ? '<p class="wallnote" id="wallnote">Printed over your desktop · ' + esc(ed.theme.wallpaper) + ", " + esc(ed.theme.theme) + "</p>" : "") +
    "</div>" + script(ed) + "</body></html>\n"
}

// The bound volume: every edition's masthead and lead, newest first.
function renderIndex(entries, palette, name) {
  const t = tokens(palette)
  const title = Model.mastheadTitle(name, false)
  return head(title + " · All editions", t, "") +
    '<body><div class="desktop"><div class="sheet"><header><div class="plate">' + esc(title).replace(/Daily$/, "<span>Daily</span>") + '</div><p class="motto">Every edition, newest first.</p></header>' +
    '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Edition</th><th>Lead</th><th>Read</th></tr></thead><tbody>' +
    entries.map(e => '<tr><td><a href="' + esc(e.date) + '.html">' + esc(Model.longDate(e.date)) + "</a>" + (e.weekend ? ' <span class="tag">Sunday</span>' : "") + (e.late ? ' <span class="tag">Late</span>' : "") +
      "</td><td>" + esc(Model.editionNumber(e.date)) + "</td><td>" + esc(e.headline) + "</td><td>" + num(e.minutes) + " min</td></tr>").join("") +
    "</tbody></table></div></div></div></body></html>\n"
}

function plainText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ")
}

module.exports = { renderEdition, renderIndex, plainText, esc, tokens }
