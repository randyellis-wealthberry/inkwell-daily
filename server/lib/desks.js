// The five desks, shaped for the paper.
//
// One entry per desk: which toolkit it needs, the one read-only tool it calls,
// the arguments for the edition's date, and how the answer becomes a section,
// a meter row and a classified. Shaping lives here rather than in inkwell-pro
// so a shipped client never needs a new release when a provider changes its
// response.
//
// Every tool listed is read-only, and the Composio session is narrowed to
// exactly these slugs (see lib/composio.js). Nothing in this file can write.

"use strict"

import * as J from "./json.js"
const { obj, arr, text } = J

const LIMIT = 12

// ---- dates and times -----------------------------------------------------

function day(v) { return /^\d{4}-\d{2}-\d{2}$/.test(text(v)) ? text(v) : "" }

function shift(key, n) {
  const d = new Date(key + "T00:00:00Z")
  if (isNaN(d)) return key
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Gmail's after:/before: operators take YYYY/MM/DD, not ISO.
function gmailDay(key) { return key.replace(/-/g, "/") }

// Epoch milliseconds, a 10-digit Slack timestamp, an ISO string or a RFC-2822
// header all reach here. Anything unreadable is 0, which sorts last and prints
// as no time at all.
function ms(v) {
  const s = text(v).trim()
  if (!s) return 0
  if (/^\d{13}$/.test(s)) return Number(s)
  if (/^\d{10}(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000)
  const d = new Date(s)
  return isNaN(d) ? 0 : d.getTime()
}

function clock(v, tz) {
  const t = ms(v)
  if (!t) return ""
  try {
    return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined })
  } catch (e) {
    return ""
  }
}

function ago(v, today) {
  const t = ms(v)
  const now = ms(today + "T12:00:00Z")
  if (!t || !now) return ""
  const days = Math.round((now - t) / 86400000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  return days + " days ago"
}

// ---- the desks -----------------------------------------------------------

const gmail = {
  name: "Gmail",
  toolkit: "gmail",
  tool: "GMAIL_FETCH_EMAILS",
  args: (c) => ({
    query: "after:" + gmailDay(shift(c.to, -1)) + " before:" + gmailDay(shift(c.to, 1)),
    max_results: 25,
    verbose: false,
    include_spam_trash: false
  }),
  shape: (raw, c) => {
    const rows = J.list(raw, ["messages", "emails", "threads"]).map(m => {
      const o = obj(m)
      const h = obj(o.headers)
      const labels = arr(o.labelIds || o.label_ids)
      return {
        from: J.person(o.sender || o.from || h.from || o.From) || "Someone",
        subject: text(o.subject || o.Subject || h.subject).replace(/\s+/g, " ").trim() || "(no subject)",
        unread: o.isUnread === true || o.unread === true || labels.indexOf("UNREAD") > -1,
        at: text(o.messageTimestamp || o.internalDate || o.date || o.receivedAt || h.date)
      }
    }).sort((a, b) => ms(b.at) - ms(a.at))

    const unread = rows.filter(r => r.unread).length
    return {
      state: rows.length ? "open" : "empty",
      sections: [{
        kicker: "Mail",
        headline: !rows.length ? "A quiet box" : unread ? unread + " still unread" : rows.length + " in, all read",
        deck: rows.length ? "Everything that arrived since yesterday's edition." : "Nothing new since yesterday's edition.",
        items: rows.slice(0, LIMIT).map(r => ({
          time: clock(r.at, c.tz), title: r.from, detail: r.subject, tag: r.unread ? "Unread" : ""
        }))
      }],
      meter: rows.length ? [
        { label: "Unread", value: String(unread) },
        { label: "In the box", value: String(rows.length) }
      ] : [],
      classifieds: rows.filter(r => r.unread).slice(0, 2).map(r => ({
        kind: "NOTICE", text: "Unread from " + r.from + ": " + r.subject
      }))
    }
  }
}

const calendar = {
  name: "Google Calendar",
  toolkit: "googlecalendar",
  tool: "GOOGLECALENDAR_EVENTS_LIST",
  // The paper is built in the morning for the day it lands on, so this desk is
  // the present day even when the rest of the edition is yesterday.
  args: (c) => ({
    calendarId: "primary",
    timeMin: c.to + "T00:00:00Z",
    timeMax: shift(c.to, 1) + "T00:00:00Z",
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20
  }),
  shape: (raw, c) => {
    const rows = J.list(raw, ["items", "events"]).map(e => {
      const o = obj(e)
      const s = obj(o.start)
      const en = obj(o.end)
      return {
        title: text(o.summary) || "(no title)",
        start: text(s.dateTime || s.date),
        end: text(en.dateTime || en.date),
        where: text(o.location),
        people: arr(o.attendees).length,
        allDay: !text(s.dateTime)
      }
    }).filter(r => r.start).sort((a, b) => ms(a.start) - ms(b.start))

    const first = rows[0]
    const firstTimed = rows.findIndex(r => !r.allDay)
    return {
      state: rows.length ? "open" : "empty",
      sections: [{
        kicker: "Daybook",
        headline: !rows.length ? "A clear day" : rows.length + " on the day" + (first && !first.allDay ? ", first at " + clock(first.start, c.tz) : ""),
        deck: rows.length ? rows.slice(0, 2).map(r => r.title).join(" · ") : "Nothing on the calendar.",
        items: rows.slice(0, LIMIT).map((r, i) => ({
          time: r.allDay ? "All day" : clock(r.start, c.tz),
          title: r.title,
          detail: r.where || (r.people > 1 ? r.people + " going" : ""),
          tag: i === firstTimed ? "First" : ""
        }))
      }],
      meter: rows.length ? [{ label: "On the day", value: String(rows.length) }] : [],
      classifieds: rows.filter(r => !r.where).slice(0, 1).map(r => ({
        kind: "NOTICE", text: r.title + " — no place set."
      }))
    }
  }
}

const slack = {
  name: "Slack",
  toolkit: "slack",
  tool: "SLACK_SEARCH_MESSAGES",
  args: (c) => ({
    query: "after:" + shift(c.to, -1) + " before:" + shift(c.to, 1),
    count: 20,
    sort: "timestamp",
    sort_dir: "desc"
  }),
  shape: (raw, c) => {
    const rows = J.list(raw, ["messages", "matches"]).map(m => {
      const o = obj(m)
      return {
        who: J.person(o.username || o.user_name || o.user || o.real_name) || "Someone",
        text: text(o.text).replace(/\s+/g, " ").trim(),
        channel: text(o.channel_name || obj(o.channel).name),
        at: text(o.ts || o.timestamp)
      }
    }).filter(r => r.text)

    const rooms = new Map()
    for (const r of rows) if (r.channel) rooms.set(r.channel, (rooms.get(r.channel) || 0) + 1)
    const busiest = [...rooms.entries()].sort((a, b) => b[1] - a[1])[0]

    return {
      state: rows.length ? "open" : "empty",
      sections: [{
        kicker: "City desk",
        headline: !rows.length ? "No traffic" : rows.length + " messages since yesterday",
        deck: busiest ? "Busiest room: #" + busiest[0] + " with " + busiest[1] + "." : "No single room carried the day.",
        items: rows.slice(0, LIMIT).map(r => ({
          time: clock(r.at, c.tz), title: r.who, detail: r.text, tag: r.channel ? "#" + r.channel : ""
        }))
      }],
      meter: rows.length ? [
        { label: "Messages", value: String(rows.length) },
        { label: "Rooms", value: String(rooms.size) }
      ] : [],
      classifieds: rows.filter(r => r.text.indexOf("?") > -1).slice(0, 2).map(r => ({
        kind: "SEEKING", text: "An answer for " + r.who + ": " + r.text
      }))
    }
  }
}

const notion = {
  name: "Notion",
  toolkit: "notion",
  tool: "NOTION_SEARCH_NOTION_PAGE",
  args: () => ({
    filter_property: "object",
    filter_value: "page",
    timestamp: "last_edited_time",
    direction: "descending",
    page_size: 20
  }),
  shape: (raw, c) => {
    const since = c.from || shift(c.to, -1)
    const rows = J.list(raw, ["results", "pages"]).map(p => {
      const o = obj(p)
      return { title: titleOf(o), at: text(o.last_edited_time || o.lastEditedTime) }
    }).filter(r => r.title && (!ms(r.at) || r.at.slice(0, 10) >= since))

    return {
      state: rows.length ? "open" : "empty",
      sections: [{
        kicker: "Notebook",
        headline: !rows.length ? "Nothing touched" : rows.length + " pages this week",
        deck: rows.length ? "The most recently edited: " + rows[0].title + "." : "No page moved since the last edition.",
        items: rows.slice(0, LIMIT).map(r => ({
          time: ago(r.at, c.to), title: r.title, detail: "", tag: ""
        }))
      }],
      meter: rows.length ? [{ label: "Pages touched", value: String(rows.length) }] : [],
      classifieds: []
    }
  }
}

// A Notion page keeps its title in whichever property its database chose, so
// look for the property that says it is one before falling back to a bare
// title field.
function titleOf(o) {
  for (const v of Object.values(obj(o.properties))) {
    const p = obj(v)
    if (p.type === "title" || Array.isArray(p.title)) {
      const t = arr(p.title).map(x => text(obj(x).plain_text)).join("").trim()
      if (t) return t
    }
  }
  if (Array.isArray(o.title)) return arr(o.title).map(x => text(obj(x).plain_text)).join("").trim()
  return text(o.title)
}

const basecamp = {
  name: "Basecamp",
  toolkit: "basecamp",
  tool: "BASECAMP_GET_MY_ASSIGNMENTS",
  args: () => ({}),
  shape: (raw, c) => {
    const rows = J.list(raw, ["assignments", "todos", "items"]).map(t => {
      const o = obj(t)
      return {
        title: text(o.title || o.content || o.subject) || "(untitled)",
        due: text(o.due_on || o.dueDate || o.due),
        project: text(obj(o.bucket).name || o.project_name || o.project),
        at: text(o.updated_at || o.created_at)
      }
    }).filter(r => r.title !== "(untitled)")

    const late = rows.filter(r => r.due && r.due < c.to)
    // Late work first: the project desk is a list of loose ends, not a ledger.
    rows.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1)

    return {
      state: rows.length ? "open" : "empty",
      sections: [{
        kicker: "Project desk",
        headline: !rows.length ? "Nothing assigned" : late.length ? late.length + " past due" : rows.length + " on your plate",
        deck: rows.length ? "Assigned to you across " + new Set(rows.map(r => r.project).filter(Boolean)).size + " projects." : "No to-do is waiting on you.",
        items: rows.slice(0, LIMIT).map(r => ({
          time: r.due ? "Due " + r.due : "", title: r.title, detail: r.project, tag: r.due && r.due < c.to ? "Late" : ""
        }))
      }],
      meter: rows.length ? [
        { label: "Assigned", value: String(rows.length) },
        { label: "Past due", value: String(late.length) }
      ] : [],
      classifieds: late.slice(0, 2).map(r => ({ kind: "WANTED", text: r.title + (r.project ? " (" + r.project + ")" : "") }))
    }
  }
}

// Null prototype: a route like /desk/constructor must not find Object.prototype
// and pass it off as a desk.
const DESKS = Object.assign(Object.create(null), { gmail, slack, notion, calendar, basecamp })

function get(id) { return Object.hasOwn(DESKS, id) ? DESKS[id] : null }
function all() { return Object.keys(DESKS).map(id => Object.assign({ id }, DESKS[id])) }

export { get, all, DESKS, shift, ms, clock, day }
