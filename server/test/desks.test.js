import test from "node:test"
import assert from "node:assert"

import * as J from "../lib/json.js"
import * as Desks from "../lib/desks.js"

// The fixtures are hand-written to the shapes the toolkit pages document
// (`data`, sometimes a JSON string, sometimes nested once). They are not
// recordings; when one disagrees with a live call, the fixture is what changes.
const ctx = { to: "2026-11-07", from: "2026-11-01", tz: "UTC" }

test("unwrap parses a JSON string, a nested data object, and refuses a failed tool", () => {
  assert.deepEqual(J.unwrap({ successful: true, data: '{"messages":[]}' }), { messages: [] })
  assert.deepEqual(J.unwrap({ successful: true, data: { data: { items: [1] } } }), { items: [1] })
  assert.equal(J.unwrap({ resultType: "blocked" }), null)
  assert.throws(() => J.unwrap({ successful: false, error: "401 invalid_grant" }), /invalid_grant/)
})

test("gmail counts unread and prints names, not addresses", () => {
  const raw = {
    messages: [
      { messageId: "1", sender: "Ada Lovelace <ada@example.com>", subject: "Ledger", messageTimestamp: "2026-11-07T09:30:00Z", labelIds: ["INBOX", "UNREAD"] },
      { messageId: "2", sender: "bob@example.com", subject: "Notes", messageTimestamp: "2026-11-07T08:00:00Z", labelIds: ["INBOX"] }
    ]
  }
  const out = Desks.get("gmail").shape(raw, ctx)
  assert.equal(out.state, "open")
  assert.equal(out.sections[0].headline, "1 still unread")
  assert.equal(out.sections[0].items[0].title, "Ada Lovelace")
  assert.equal(out.sections[0].items[0].time, "9:30 AM")
  assert.equal(out.sections[0].items[0].tag, "Unread")
  assert.equal(out.sections[0].items[1].title, "bob")
  assert.deepEqual(out.meter, [{ label: "Unread", value: "1" }, { label: "In the box", value: "2" }])
})

test("an empty mailbox is empty, not closed", () => {
  const out = Desks.get("gmail").shape({ messages: [] }, ctx)
  assert.equal(out.state, "empty")
  assert.equal(out.sections[0].headline, "A quiet box")
})

test("calendar reads start.dateTime and start.date", () => {
  const raw = {
    items: [
      { summary: "Standup", start: { dateTime: "2026-11-07T09:30:00Z" }, end: { dateTime: "2026-11-07T09:45:00Z" }, location: "Room 4", attendees: [{}, {}] },
      { summary: "Conference", start: { date: "2026-11-07" } }
    ]
  }
  const out = Desks.get("calendar").shape(raw, ctx)
  // An all-day event sorts at midnight, so it leads the day and there is no
  // "first at" time to print.
  assert.equal(out.sections[0].headline, "2 on the day")
  assert.equal(out.sections[0].items[0].time, "All day")
  assert.equal(out.sections[0].items[1].time, "9:30 AM")
  assert.equal(out.sections[0].items[1].detail, "Room 4")
  assert.equal(out.sections[0].items[1].tag, "First")
  assert.equal(out.classifieds[0].kind, "NOTICE")
})

test("slack reads epoch timestamps and finds the busiest room", () => {
  const raw = {
    messages: [
      { user: "ada", text: "Ship it?", channel_name: "launch", ts: "1762509600.000100" },
      { user: "bob", text: "shipped", channel_name: "launch", ts: "1762509000.000100" },
      { user: "ada", text: "thanks", channel_name: "random", ts: "1762508000.000100" }
    ]
  }
  const out = Desks.get("slack").shape(raw, ctx)
  assert.equal(out.state, "open")
  assert.match(out.sections[0].deck, /#launch with 2/)
  assert.equal(out.sections[0].items[0].time, "10:00 AM")
  assert.equal(out.classifieds[0].kind, "SEEKING")
})

test("notion finds the title property whatever the database calls it", () => {
  const raw = {
    results: [
      { id: "p1", last_edited_time: "2026-11-06T10:00:00Z", properties: { Name: { type: "title", title: [{ plain_text: "Q4 plan" }] } } },
      { id: "p2", last_edited_time: "2026-10-01T10:00:00Z", properties: { Title: { type: "title", title: [{ plain_text: "Old page" }] } } }
    ]
  }
  const out = Desks.get("notion").shape(raw, ctx)
  assert.equal(out.sections[0].items.length, 1, "a page older than the window is not a page this week")
  assert.equal(out.sections[0].items[0].title, "Q4 plan")
  assert.equal(out.sections[0].items[0].time, "yesterday")
})

test("basecamp puts late work first and says so", () => {
  const raw = {
    assignments: [
      { title: "Write the brief", due_on: "2026-11-20", bucket: { name: "Launch" } },
      { title: "Fix the invoice", due_on: "2026-11-01", bucket: { name: "Office" } }
    ]
  }
  const out = Desks.get("basecamp").shape(raw, ctx)
  assert.equal(out.sections[0].headline, "1 past due")
  assert.equal(out.sections[0].items[0].title, "Fix the invoice")
  assert.equal(out.sections[0].items[0].tag, "Late")
  assert.deepEqual(out.meter, [{ label: "Assigned", value: "2" }, { label: "Past due", value: "1" }])
})

test("every desk declares one toolkit and one read-only tool", () => {
  for (const d of Desks.all()) {
    assert.ok(d.toolkit, d.id + " has a toolkit")
    assert.match(d.tool, /_(FETCH|LIST|SEARCH|GET)(_|$)/, d.id + " calls a read-only tool")
    assert.equal(typeof d.args({ to: "2026-11-07" }), "object")
  }
})
