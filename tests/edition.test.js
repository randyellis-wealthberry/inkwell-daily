const test = require("node:test")
const assert = require("node:assert/strict")
const { compose, factsText, prosePrompt } = require("../lib/compose.js")
const { renderEdition, renderIndex, renderIntegrations, renderShareCard, plainText } = require("../lib/render.js")
const { webCopy } = require("../lib/web.js")
const Model = require("../Model.js")

const at = (key, h, m) => { const d = Model.parseDateKey(key); d.setHours(h, m || 0); return d.getTime() }

function gathering(over) {
  const key = "2026-10-15"
  return Object.assign({
    key: key,
    home: "/home/a",
    reader: { name: "Ada" },
    theme: { theme: "Tokyo Night", wallpaper: "Winding Road", palette: Model.parseColors('background = "#1a1b26"\nforeground = "#a9b1d6"\naccent = "#7aa2f7"\nyellow = "#e0af68"') },
    wallpaperImage: "",
    kickoff: [],
    kickoffWeek: [],
    elevation: { name: "Casa Milà", architect: "Antoni Gaudí", year: "1912", place: "Barcelona, Spain", style: "Modernisme", note: "No straight walls.", position: 141, total: 189, remaining: 48, extract: "Casa Milà is a building. It has no straight walls.", image: "", imageAlt: "Casa Milà", problem: "" },
    elevationTomorrow: null,
    easel: { title: "Portrait of Constance Pipelet", artist: "Jean Baptiste François Désoria", date: "1797", medium: "Oil on canvas", size: "", department: "", accession: "1939.533", image: "" },
    easelTomorrow: null,
    munger: { text: "Invert, always invert.", tag: "Thinking", card: 3 },
    mungerTomorrow: null,
    sessions: [{
      id: "s1", agent: "Claude Code", cwd: "/home/a/Work", files: ["/x"], commits: 2, published: 0, installs: 0, outputTokens: 1200, model: "claude-opus-5-5",
      prompts: [{ at: at(key, 16, 19), key: key, text: "make me a beautiful weather plugin" }, { at: at(key, 17, 2), key: key, text: "add places" }],
      days: { [key]: 2 }, firstAt: at(key, 16, 19), lastAt: at(key, 17, 2)
    }],
    usage: [],
    desk: [{ id: "atsokolas.isobar", name: "Isobar", tracked: true, dirty: false, commits: [{ at: at(key, 17, 14), key: key, subject: "Isobar: the weather, drawn in your theme" }] }],
    carrel: { total: 0, lists: {} },
    weather: { raw: null, place: "", source: "", imperial: true, places: [] },
    almanac: { since: "2026-09-26", diskFree: 51e9, diskSize: 68e9, bindings: Model.parseKeybindings("SUPER + O   → Pop window out\nSUPER SHIFT + F   → File manager") },
    looseEnds: [],
    week: {},
    index: []
  }, over || {})
}

// Five desks in every state the paper has to hold: open, expired, empty,
// error and offline.
function deskSet() {
  const section = (desk, source, headline, deck, note, items) => ({ desk, source, kicker: source, headline, deck, note, items: items || [] })
  const mail = section("mail", "Gmail", "29 emails, 3 waiting on you", "Two are from the same client.", "4 newsletters left out.",
    [{ time: "9:14 am", title: "Ada", detail: "Re: launch: Wants a date", tag: "Reply" }])
  const city = section("city", "Slack", "The connection has lapsed", "", "Slack stopped answering on Thursday evening.")
  const notebook = section("notebook", "Notion", "A quiet notebook", "No pages changed yesterday.", "The notebook is open and answering.")
  const project = section("project", "Basecamp", "Basecamp didn't report", "", "The desk answered with an error: 429 Too Many Requests.")
  const daybook = section("daybook", "Calendar", "Yesterday's copy", "", "This edition was built without a network.",
    [{ time: "9:30", title: "Standup", detail: "#eng", tag: "Room 2" }])
  const desks = [
    { id: "gmail", name: "Gmail", desk: "mail", state: "open", lastSet: "6:40 am", action: { label: "Manage Gmail", href: "inkwell-daily://desk?desk=gmail" }, section: mail },
    { id: "slack", name: "Slack", desk: "city", state: "expired", lastSet: "Thursday, 6:12 am", action: { label: "Reconnect Slack", href: "inkwell-daily://desk?desk=slack" }, section: city },
    { id: "notion", name: "Notion", desk: "notebook", state: "empty", lastSet: "Wednesday, 6:20 am", action: { label: "Open Notion", href: "inkwell-daily://desk?desk=notion" }, section: notebook },
    { id: "basecamp", name: "Basecamp", desk: "project", state: "error", lastSet: "Saturday, 6:31 am", action: { label: "Retry Basecamp", href: "inkwell-daily://desk?desk=basecamp" }, section: project },
    { id: "calendar", name: "Calendar", desk: "daybook", state: "offline", lastSet: "Saturday, 6:30 am", action: { label: "Manage Calendar", href: "inkwell-daily://desk?desk=calendar" }, section: daybook }
  ]
  return { sections: [mail, city, notebook, project, daybook], desks, meter: [], classifieds: [] }
}

test("a day of your own work leads the paper", () => {
  const ed = compose(gathering())
  assert.equal(ed.lead.kind, "desk")
  assert.equal(ed.lead.headline, "1 commit landed")
  assert.equal(ed.desk, null)
  assert.equal(ed.title, "Ada's Inkwell")
  assert.match(ed.lead.paragraphs[0], /^At 4:19 pm, you asked Claude Code:$/)
  assert.equal(ed.lead.quote.text, "make me a beautiful weather plugin")
  assert.equal(ed.lead.quote.by, "You · 4:19 pm")
  assert.match(ed.lead.paragraphs[1], /^It ran to 2 prompts by 5:02 pm/)
  assert.equal(ed.week.days.length, 7)
  assert.equal(ed.week.days[6].count, 2)
})

test("with several repos, the session says where it ran", () => {
  const g = gathering()
  g.desk = g.desk.concat([{ id: "other.isobar", name: "Other", tracked: true, dirty: false, commits: [{ at: at("2026-10-15", 18, 0), key: "2026-10-15", subject: "Other: a change" }] }])
  const ed = compose(g)
  assert.equal(ed.lead.headline, "2 commits landed in Isobar and Other")
  assert.match(ed.lead.paragraphs[0], /^At 4:19 pm, in ~\/Work, you asked Claude Code:$/)
})

test("the prompt is a pull quote, not a wall of text", () => {
  const html = renderEdition(compose(gathering()))
  assert.match(html, /<blockquote class="promptquote"><p>make me a beautiful weather plugin<\/p><cite>You · 4:19 pm<\/cite><\/blockquote>/)
  assert.ok(!/you asked Claude Code: “make me/.test(html), "the prompt is not inline")
  assert.match(factsText(compose(gathering())), /make me a beautiful weather plugin/)
})

test("goals lead a day without your work, and the desk keeps its place", () => {
  const key = "2026-10-15"
  const ed = compose(gathering({
    sessions: [], desk: [],
    kickoff: [{ at: at(key, 14, 18), key: key, summary: "Paris Saint-Germain 0-2", body: "Manchester City v PSG" }, { at: at(key, 14, 35), key: key, summary: "Paris Saint-Germain 0-3", body: "" }]
  }))
  assert.equal(ed.lead.kind, "kickoff")
  assert.equal(ed.lead.headline, "2 goals on the Kickoff wire")
  assert.ok(ed.desk && ed.desk.quiet)
  assert.equal(ed.desk.headline, "No agent work on file")
})

test("the paper is dated the morning it is read, and reports the day before", () => {
  const g = gathering({ key: "2026-10-15", editionKey: "2026-10-16" })
  const ed = compose(g)
  const page = plainText(renderEdition(ed))

  assert.equal(ed.key, "2026-10-15", "content stays on the reported day")
  assert.equal(ed.editionKey, "2026-10-16")
  assert.equal(ed.longDate, Model.longDate("2026-10-16"))
  assert.equal(ed.editionNo, Model.editionNumber("2026-10-16"))
  assert.match(page, /Friday, 16 October 2026/, "the cover carries the morning")
  assert.match(page, /Reporting Thursday, 15 October/, "and says what it reports")
})

test("the Sunday paper carries the weekend edition, reporting Saturday", () => {
  const g = gathering({ key: "2026-10-17", editionKey: "2026-10-18" })
  const ed = compose(g)
  assert.equal(ed.weekend, true, "built Sunday morning from Saturday's work")
  assert.match(ed.title, /Sunday/)
  assert.equal(ed.longDate, Model.longDate("2026-10-18"))
})

test("with no bar widgets the weather and week fill the row", () => {
  const ed = compose(gathering({ tomorrow: { elevation: null, easel: null, munger: null, day: "Friday" } }))
  const page = renderEdition(ed)
  assert.match(page, /class="ahead duo"/, "no dead third column")
  assert.doesNotMatch(page, /Coming Friday/, "nothing invented to fill it")
})

test("the integration library is a card per app, and says which are on", () => {
  const palette = Model.parseColors('background = "#1a1b26"\nforeground = "#a9b1d6"\naccent = "#7aa2f7"\nyellow = "#e0af68"')
  const html = renderIntegrations({
    integrations: [
      { slug: "gmail", name: "Gmail", category: "email", description: "Gmail is a mail service.", connected: true },
      { slug: "slack", name: "<script>x</script>", category: "chat", description: "Chat.", connected: false, connect: "http://127.0.0.1:8787/connect?t=abc" }
    ]
  }, palette, "Ada", undefined, "2026-11-08")

  assert.match(html, /class="int-card on"/)
  assert.match(html, /class="int-card off"/)
  assert.match(html, />Enabled</)
  assert.match(html, />Not enabled</)
  assert.match(html, /A mail service\./, "the blurb loses the name it already sits under")
  assert.doesNotMatch(html, /Gmail is a mail service/, "no repetition")
  assert.match(html, /class="int-cta" href="http:\/\/127\.0\.0\.1:8787\/connect\?t=abc"/, "a card has a Connect link")
  assert.match(html, /class="int-cta on" href="https:\/\/app\.composio\.dev"[^>]*>Manage →/, "an enabled card has a Manage link")
  assert.match(html, /href="2026-11-08.html"/, "a way back to the paper")
  assert.ok(!html.includes("<script>x"), "a toolkit name is escaped")
})

test("the library is grouped into pre-cut sections and refreshes itself", () => {
  const palette = Model.parseColors('background = "#1a1b26"\nforeground = "#a9b1d6"\naccent = "#7aa2f7"\nyellow = "#e0af68"')
  const html = renderIntegrations({
    state: "http://127.0.0.1:8787/integrations?t=abc",
    integrations: [
      { slug: "gmail", name: "Gmail", category: "email", connected: true },
      { slug: "slack", name: "Slack", category: "chat", connected: false, connect: "http://x/connect?t=1" },
      { slug: "linear", name: "Linear", category: "project management", connected: false }
    ]
  }, palette, "Ada", undefined, "2026-11-08")

  assert.match(html, /class="lib-head">email</)
  assert.match(html, /class="lib-head">chat</)
  assert.match(html, /class="lib-head">project management</)
  assert.match(html, /data-slug="gmail"/)
  assert.match(html, /data-state="http:\/\/127\.0\.0\.1:8787\/integrations\?t=abc"/)
  assert.match(html, /setInterval\(tick, 4000\)/, "the page asks again without a rebuild")
})

test("a connected integration gets a card in the paper, marked new", () => {
  const ed = compose(gathering({
    wireState: { github: { isNew: true } },
    integrations: {
      ok: true,
      integrations: [
        { slug: "github", name: "GitHub", category: "developer tools", connected: true },
        { slug: "slack", name: "Slack", category: "chat", connected: false }
      ]
    }
  }))
  const page = renderEdition(ed)

  assert.equal(ed.wires.length, 1, "only what is connected")
  assert.match(page, /<h2>The wires<\/h2>/)
  assert.equal((page.match(/class="wire-card"/g) || []).length, 1)
  assert.match(page, /wire-body"><b>GitHub<\/b>/)
  assert.match(page, /class="wire-new" data-slug="github"/)
  assert.match(page, /localStorage/, "the chip can be dismissed")
})

test("a tool connected a while ago has no New chip", () => {
  const ed = compose(gathering({
    wireState: { github: { isNew: false } },
    integrations: { ok: true, integrations: [{ slug: "github", name: "GitHub", connected: true }] }
  }))
  const page = renderEdition(ed)
  assert.equal((page.match(/class="wire-card"/g) || []).length, 1)
  assert.doesNotMatch(page, /class="wire-new"/)
})

test("no connected integrations means no wires fold", () => {
  const ed = compose(gathering())
  assert.equal(ed.wires.length, 0)
  assert.doesNotMatch(renderEdition(ed), /class="wire-card"/)
})

test("subpages put a way home at the top, not only at the bottom", () => {
  const palette = Model.parseColors('background = "#1a1b26"\nforeground = "#a9b1d6"\naccent = "#7aa2f7"\nyellow = "#e0af68"')

  const lib = renderIntegrations({ integrations: [] }, palette, "Ada", undefined, "2026-11-08")
  assert.ok(lib.indexOf('class="topnav"') > -1 && lib.indexOf('class="topnav"') < lib.indexOf('class="plate"'))
  assert.match(lib, /href="2026-11-08.html">← Back to the paper/)

  const idx = renderIndex([{ date: "2026-10-14", headline: "Paimio", minutes: 3, weekend: false, late: false }], palette, "Ada")
  assert.ok(idx.indexOf('class="topnav"') > -1 && idx.indexOf('class="topnav"') < idx.indexOf('class="plate"'))
  assert.match(idx, /href="2026-10-14.html">← Back to the paper/)
})

test("a filled section becomes a fold in the paper", () => {
  const ed = compose(gathering({
    sections: {
      ok: true,
      sections: [{
        id: "code",
        title: "The Code Desk",
        apps: ["GitHub", "Linear"],
        headline: "2 things waiting",
        items: [
          { time: "9:12 AM", app: "GitHub", title: "org/repo", detail: "Fix the ledger", tag: "Review" },
          { time: "8:40 AM", app: "Linear", title: "ENG-12", detail: "Ship the shelf", tag: "In Progress" }
        ]
      }]
    }
  }))
  const page = renderEdition(ed)

  assert.equal(ed.sections.length, 1)
  assert.match(page, /<h2>The Code Desk<\/h2>/)
  assert.match(page, /2 things waiting/)
  assert.match(page, /<b>org\/repo<\/b> — Fix the ledger <em>Review<\/em>/)
  assert.doesNotMatch(page, /<b>GitHub<\/b>/, "the fold already names the app")
})

test("no sections, no folds", () => {
  const page = renderEdition(compose(gathering()))
  assert.doesNotMatch(page, /class="wires-section"/)
})

test("the paper links to the library only when it has one", () => {
  const withLib = compose(gathering({ integrations: { ok: true, integrations: [{ slug: "gmail" }] } }))
  assert.equal(withLib.integrations, 1)
  assert.match(renderEdition(withLib), /href="integrations.html"/)

  const without = compose(gathering())
  assert.equal(without.integrations, 0)
  assert.doesNotMatch(renderEdition(without), /href="integrations.html"/)
})

test("a caller with only a key keeps the old same-day behaviour", () => {
  const ed = compose(gathering())
  assert.equal(ed.editionKey, ed.key)
  assert.equal(ed.longDate, Model.longDate(ed.key))
})

test("a quiet day lets the building lead, with its own story", () => {
  const ed = compose(gathering({ sessions: [], desk: [] }))
  assert.equal(ed.lead.kind, "pick")
  assert.equal(ed.lead.headline, "Casa Milà")
  assert.ok(ed.lead.paragraphs.length)
})

test("Saturday's news becomes the Sunday magazine", () => {
  const ed = compose(gathering({ key: "2026-10-17" }))
  assert.equal(ed.weekend, true)
  assert.equal(ed.title, "Ada's Inkwell Sunday")
  assert.equal(ed.magazine.days.length, 7)
  assert.equal(ed.magazine.days[4].prompts, 2, "Thursday's prompts appear in the week")
})

test("back issues, a year ago, the streak and corrections", () => {
  const index = [{ date: "2026-10-14", headline: "Paimio", minutes: 3 }, { date: "2026-10-13", headline: "Strata", minutes: 3 }, { date: "2025-10-15", headline: "A year ago", minutes: 2 }]
  const raw = JSON.stringify({ daily: { time: ["2026-10-15"], weather_code: [3], temperature_2m_max: [14], temperature_2m_min: [11], precipitation_sum: [0] }, hourly: { time: [], temperature_2m: [] } })
  const ed = compose(gathering({ index: index, previous: { forecastTomorrow: { max: 17, min: 11, precip: 0 } }, weather: { raw: raw, place: "Rivertown", source: "Isobar", imperial: true, places: [] } }))
  assert.equal(ed.issues.prev.date, "2026-10-14")
  assert.equal(ed.issues.next, null)
  assert.equal(ed.issues.yearAgo.headline, "A year ago")
  assert.equal(ed.streak, "Your 4th edition · 3 mornings running")
  assert.deepEqual(ed.corrections, ["We forecast a high of 63°; it reached 57°."])
})

test("an Elevation cache twin is owned up to in the corrections", () => {
  const g = gathering()
  g.elevation = Object.assign({}, g.elevation, { problem: "Elevation's cache holds the same photo for Paimio Sanatorium and Villa Savoye." })
  assert.match(compose(g).corrections[0], /Villa Savoye\. This edition uses the photo from Wikimedia instead\.$/)
})

test("Claude's headlines replace the set ones, the facts stay", () => {
  const g = gathering()
  const facts = factsText(compose(g))
  g.prose = Model.cleanProse({ leadHeadline: "Isobar's weather arrives in your theme" }, facts)
  const ed = compose(g)
  assert.equal(ed.lead.headline, "Isobar's weather arrives in your theme")
  assert.equal(ed.proseUsed, true)
  assert.match(prosePrompt(ed), /Do not add any fact/)
})

test("the paper prices the models that did the work", () => {
  const usage = [{ key: "2026-10-15", source: "claude", provider: "anthropic", model: "claude-opus-4-5-20251101", input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0, calls: 1 }]
  const prices = { "anthropic/claude-opus-4-5-20251101": { name: "Claude Opus 4.5", input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } }
  const ed = compose(gathering({ modelUsage: usage, prices: prices }))
  assert.equal(ed.models.day.cost, 30)
  const html = renderEdition(ed)
  assert.ok(html.includes('class="models"'))
  assert.ok(html.includes("The model desk"))
  assert.ok(html.includes("Claude Opus 4.5"))
  assert.ok(html.includes("$30.00"))
})

test("the model desk stays out of a paper with no usage", () => {
  const html = renderEdition(compose(gathering()))
  assert.ok(!html.includes('class="models"'))
})

test("the paper can set its type from a font pairing", () => {
  const broadsheet = renderEdition(compose(gathering({ font: "broadsheet" })))
  assert.ok(broadsheet.includes("Playfair+Display"))
  assert.ok(broadsheet.includes('--f-plate: "Playfair Display", "Times New Roman", Georgia, serif'))
  assert.ok(!broadsheet.includes("UnifrakturCook"))
  const inkwell = renderEdition(compose(gathering()))
  assert.ok(inkwell.includes("UnifrakturCook"))
  assert.ok(inkwell.includes('--f-serif: "Newsreader"'))
})

test("the paper prints the milestone themes the habit has earned", () => {
  const days = {}
  for (const k of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]) days[k] = 1
  const theme = Object.assign({}, gathering().theme, { chosen: "sunday" })
  const ed = compose(gathering({ reads: { version: 1, days: days }, theme: theme }))
  assert.equal(ed.habit.total, 7)
  assert.equal(ed.perks.unlocked, 2)
  assert.equal(ed.perks.next.id, "nocturne")
  assert.equal(ed.perks.themes.find(t => t.id === "sunday").active, true)
  const html = renderEdition(ed)
  assert.ok(html.includes("The perks"))
  assert.ok(html.includes("First Light"))
  assert.ok(html.includes("Sunday Paper"))
  assert.ok(html.includes('class="perk on active"'))
})

test("the paper prints the habit ledger and its run", () => {
  const days = {}
  for (const k of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) days[k] = 1
  const ed = compose(gathering({ reads: { version: 1, days: days } }))
  assert.equal(ed.habit.run, 4)
  assert.equal(ed.habit.headline, "4 mornings running")
  const html = renderEdition(ed)
  assert.ok(html.includes('class="habit"'))
  assert.ok(html.includes("Your inkwell habit"))
  assert.ok(html.includes("4 mornings running"))
  assert.equal((html.match(/class="cell/g) || []).length, 35)
})

test("the page escapes what it prints and carries every section", () => {
  const g = gathering()
  g.sessions[0].prompts[0].text = "<script>alert(1)</script> & co"
  const html = renderEdition(compose(g))
  assert.ok(!html.includes("<script>alert(1)"))
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co"))
  for (const s of ['class="front"', 'class="fold"', 'class="ahead', 'class="back"', "Unscramble yesterday", "@media print", "Reading time"]) assert.ok(html.includes(s), s)
  assert.ok(!/\bColor\./.test(html))
  assert.ok(plainText(html).split(/\s+/).length > 200)
})

test("the masthead escapes the reader's name", () => {
  const html = renderEdition(compose(gathering({ reader: { name: "<img src=x onerror=alert(1)>" } })))
  assert.ok(!html.includes("<img src=x"))
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;&#39;s <span>Inkwell</span>"))
})

test("without the daily picks, the page leaves out the fold and today's picks", () => {
  const html = renderEdition(compose(gathering({ elevation: null, easel: null, easelInstalled: false, munger: null, elevationTomorrow: null, easelTomorrow: null, mungerTomorrow: null })))
  assert.ok(!html.includes("Below the fold"))
  assert.ok(!html.includes("isn't installed"))
  assert.ok(!html.includes("Today on the bar"))
  assert.ok(!html.includes("MUNGER"))
})

test("the late seal and the theme's own colours", () => {
  const html = renderEdition(compose(gathering({ late: { at: 1, time: "4:12 pm" } })))
  assert.ok(html.includes('class="seal"'))
  assert.ok(html.includes("4:12 pm"))
  assert.ok(html.includes("--accent: #7aa2f7"))
})

test("the index lists every edition with a link", () => {
  const html = renderIndex([{ date: "2026-10-14", headline: "Paimio", minutes: 3, weekend: false, late: true }], null, "Ada")
  assert.ok(html.includes('href="2026-10-14.html"'))
  assert.ok(html.includes("Late"))
})

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

test("what the APIs and decks say is printed as text, never as markup", () => {
  const evil = '"><img src=x onerror=alert(1)><font color=red>'
  const g = gathering()
  Object.assign(g.elevation, { name: evil, architect: evil, place: evil, style: evil, extract: evil + ". Two." })
  Object.assign(g.easel, { title: evil, artist: evil, medium: evil, accession: evil })
  Object.assign(g.munger, { text: evil, tag: evil })
  g.theme.wallpaper = evil
  const html = renderEdition(compose(g))
  assert.ok(!html.includes("<img src=x"))
  assert.ok(!html.includes("<font"))
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;&lt;font color=red&gt;"))
})

test("only the builder's own pictures and numbers reach the page", () => {
  const g = gathering()
  g.elevation.image = 'https://evil.example/x.jpg" onerror="alert(1)'
  g.easel.image = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
  g.wallpaperImage = 'x") ; } body { background: url("https://evil.example/'
  g.elevation.position = '1"><script>alert(1)</script>'
  g.munger.card = "<b>9</b>"
  let html = renderEdition(compose(g))
  assert.ok(!html.includes("evil.example"))
  // The page's own grain and wood are SVG in the stylesheet; a picture
  // handed in from outside never is.
  assert.ok(!html.includes("PHN2Zz48L3N2Zz4="), "the outside SVG is dropped")
  assert.ok(!/<img[^>]+image\/svg/.test(html))
  assert.ok(!html.includes("<script>alert(1)"))
  assert.ok(!html.includes("<b>9</b>"))
  assert.ok(html.includes("--wall: none"))
  g.elevation.image = PNG
  g.wallpaperImage = PNG
  html = renderEdition(compose(g))
  assert.ok(html.includes('<img src="' + PNG + '"'))
  assert.ok(html.includes('--wall: url("' + PNG + '")'))
})

test("the index prints minutes as a number", () => {
  const html = renderIndex([{ date: "2026-10-14", headline: "<i>Lakeside</i>", minutes: "<b>3</b>", weekend: false, late: false }], null, "Ada")
  assert.ok(!html.includes("<b>3</b>") && !html.includes("<i>Lakeside"))
})

test("a free paper prints the Pro preview and its inactive CTA", () => {
  const ed = compose(gathering())
  assert.equal(ed.pro.installed, false)
  assert.equal(ed.pro.cta, "Open the desks with Pro")
  const html = renderEdition(ed)
  assert.ok(html.includes('class="pro-preview"'))
  assert.ok(html.includes("Your other desks, set in type"))
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*>Open the desks with Pro<\/button>/)
  assert.ok(html.includes('data-paywall="inkwell-daily-pro"'))
  for (const name of ["The Mail Bag", "The City Desk", "The Notebook", "The Day Book", "The Project Desk"]) assert.ok(html.includes(name), name + " is previewed")
  assert.ok(html.includes("With Pro"))
  assert.ok(html.includes("Coming soon"))
})

test("an installed Inkwell Pro takes the preview's place", () => {
  const html = renderEdition(compose(gathering({ proInstalled: true })))
  assert.ok(!html.includes('class="pro-preview"'))
  assert.ok(!html.includes("Your other desks, set in type"))
})

test("plugin sections are printed escaped, with their meter and classifieds, and counted in the facts", () => {
  const extras = { sections: [{ source: "Mail", kicker: "The mail desk", headline: "29 threads, 3 waiting on you", deck: "", note: "", items: [{ time: "9:14 am", title: "<script>x</script>", detail: "Re: launch", tag: "reply" }] }],
    meter: [{ label: "Threads", value: "29" }], classifieds: [{ kind: "WANTED", text: "A reply to Ada.", code: "" }] }
  const ed = compose(gathering({ extras: extras }))
  const html = renderEdition(ed)
  assert.ok(html.includes("29 threads, 3 waiting on you"))
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"))
  assert.ok(!html.includes("<script>x</script>"))
  assert.ok(html.includes("A reply to Ada."))
  assert.ok(!html.includes("from your agent logs and git, Mail"), "a desk's name stays out of the colophon")
  assert.match(factsText(ed), /29 threads, 3 waiting on you/)
})

test("the five desks print in their beats, with a directory on the back page", () => {
  const html = renderEdition(compose(gathering({ extras: deskSet(), proInstalled: true })))
  const front = html.indexOf('<section class="front">'), mail = html.indexOf('id="mail-h"')
  const city = html.indexOf('id="city-h"'), notebook = html.indexOf('id="notebook-h"')
  const project = html.indexOf('id="project-h"'), daybook = html.indexOf('id="daybook-h"')
  assert.ok(front >= 0 && mail > front, "the mail bag follows the front page")
  assert.ok(city > mail, "the city desk follows the mail bag")
  assert.ok(notebook > city && project > notebook, "the notebook and project desk sit below the fold")
  assert.ok(daybook > project, "the day book sits beside the week")
  assert.match(html, /Wire live · 6:40 am/)
  assert.match(html, /Wire closed/)
  assert.match(html, /Set offline/)
  assert.match(html, /Wire down/)
  assert.match(html, /id="dir-h"/)
  assert.match(html, /The Mail Bag/)
  assert.match(html, /The City Desk/)
  assert.match(html, /inkwell-daily:\/\/desk\?desk=gmail/)
  assert.match(html, /inkwell-daily:\/\/desk\?desk=slack/)
})

test("a closed desk leaves no slot and appears only in the directory", () => {
  const extras = deskSet()
  extras.desks[1] = Object.assign({}, extras.desks[1], { state: "closed", section: null })
  const html = renderEdition(compose(gathering({ extras: extras, proInstalled: true })))
  assert.ok(!html.includes('id="city-h"'), "no slot for a closed desk")
  assert.match(html, /The City Desk/)
  assert.match(html, /Not connected/)
  assert.match(html, /Connect →/)
})

test("the free paper carries no desk and no directory", () => {
  const html = renderEdition(compose(gathering()))
  assert.ok(!/class="slot(?:\s|")/.test(html), "no desk slot")
  assert.ok(!html.includes('class="directory'), "no desk directory")
  assert.ok(!html.includes("pro:start"), "no Pro markers")
  assert.ok(html.includes('class="pro-preview"'), "the free paper carries the Pro preview")
})

test("desk content is escaped in its slot", () => {
  const extras = deskSet()
  extras.desks[0].section.headline = "<b>29</b> emails"
  extras.desks[0].section.items[0].title = "<script>x</script>"
  const html = renderEdition(compose(gathering({ extras: extras, proInstalled: true })))
  assert.ok(html.includes("&lt;b&gt;29&lt;/b&gt; emails"))
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"))
  assert.ok(!html.includes("<script>x</script>"))
})

test("the web copy and the share card never carry a desk", () => {
  const ed = compose(gathering({ extras: deskSet(), proInstalled: true }))
  const web = webCopy(renderEdition(ed)).html
  assert.ok(!/The Mail Bag|29 emails|Reconnect Slack|Standing notices|Basecamp|pro:start/.test(web), "no desk in the web copy")
  const card = renderShareCard(ed)
  assert.ok(!/The Mail Bag|29 emails|Basecamp/.test(card), "no desk in the share card")
})

test("the free paper's web copy keeps the Pro preview", () => {
  const web = webCopy(renderEdition(compose(gathering()))).html
  assert.ok(web.includes("The Pro desks"))
  assert.ok(web.includes("Coming soon"))
  assert.ok(!web.includes("pro:start"))
})

test("Pro's portrait sits under the lead with good and bad buttons", () => {
  const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  const portrait = { image: "data:image/png;base64," + PIXEL, filtered: false, mood: "quiet", caption: "Pictured: <the developer>.", provider: "halftone", photo: "q.png", date: "2026-10-15" }
  const html = renderEdition(compose(gathering({ portrait: portrait })))
  assert.match(html, /<figure class="portrait screen" data-date="2026-10-15" data-provider="halftone">/)
  assert.match(html, /data-verdict="good"[^>]*aria-label="Good picture"/)
  assert.match(html, /data-verdict="bad"[^>]*aria-label="Bad picture"/)
  assert.match(html, /Pictured: &lt;the developer&gt;\./)
  assert.ok(!/class="portrait/.test(renderEdition(compose(gathering()))), "no photo, no figure")
})

test("the day's picture carries its quote in the paper's own type", () => {
  const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  const pic = { image: "data:image/png;base64," + PIXEL, scene: "a lighthouse", quote: "Begin, be <bold>.", author: "Horace", provider: "recraft", drawnBy: "Recraft", date: "2026-10-15" }
  const html = renderEdition(compose(gathering({ portrait: pic })))
  assert.match(html, /<figure class="portrait inspiration" data-date="2026-10-15" data-provider="recraft">/)
  assert.match(html, /<blockquote class="overquote"><p>Begin, be &lt;bold&gt;\.<\/p><cite>Horace<\/cite><\/blockquote>/)
  assert.match(html, /Photograph made by Recraft: a lighthouse\./)
  assert.match(html, /data-verdict="good"/)
})

test("the Sunday magazine says the week in a sentence and lists only busy days", () => {
  const days = ["Sun 1 Nov", "Mon 2 Nov", "Tue 3 Nov", "Wed 4 Nov", "Thu 5 Nov", "Fri 6 Nov", "Sat 7 Nov"].map(day => ({ day: day, prompts: 0, commits: [], quote: "" }))
  days[6].prompts = 2
  const ed = compose(gathering())
  ed.magazine = { days: days, goals: [] }
  const html = renderEdition(ed)
  const mag = html.slice(html.indexOf('<section class="magazine">'), html.indexOf("</section>", html.indexOf('<section class="magazine">')))
  assert.match(mag, /2 prompts, all on Sat\. Nothing shipped\./)
  assert.ok(!/<table/.test(mag), "no table of zeros")
  assert.equal((mag.match(/<li>/g) || []).length, 1, "only Saturday is listed")
  assert.ok(!/No goals on the wire/.test(mag) && !/The week's lines/.test(mag), "empty corners stay out")
})

test("the Pace box sits in the sidebar and stays quiet on a healthy day", () => {
  const ed = compose(gathering())
  ed.pace = { verdict: "Good pace: 2 focus blocks, nothing past 90 minutes.", rows: [{ id: "late", label: "Last prompt", value: "9:00pm", flag: false, note: "" }], healthy: true }
  const html = renderEdition(ed)
  assert.match(html, /<section class="pace" aria-labelledby="pace-h"><p class="kicker">Pace<\/p><h3 id="pace-h">Good pace: 2 focus blocks/)
  assert.ok(!/class="pace-row/.test(html), "nothing but the verdict")
  ed.pace = { verdict: "One sign to ease off.", rows: [{ id: "stretch", label: "Longest stretch", value: "3h", flag: true, note: "Step away sooner." }] }
  assert.match(renderEdition(ed), /<div class="pace-row flag"><span>Longest stretch<\/span><b>3h<\/b><p>Step away sooner\.<\/p><\/div>/)
})

test("a set page takes a new theme and font in place, keeping its wallpaper", () => {
  const { restyle, tokens } = require("../lib/render.js")
  const Fonts = require("../lib/fonts.js")
  const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  const html = renderEdition(compose(gathering({ wallpaperImage: "data:image/png;base64," + PIXEL })))
  const sepia = Model.parseColors('background = "#f4ecd8"\nforeground = "#5b4636"\naccent = "#a0522d"')
  const out = restyle(html, sepia, "broadsheet")
  assert.ok(out.includes("--paper: " + tokens(sepia).paper + ";"), "the new colours")
  assert.ok(out.includes(Fonts.get("broadsheet").url.replace(/&/g, "&amp;")), "the new font link")
  assert.equal(out.split(PIXEL).length, html.split(PIXEL).length, "the wallpaper stays")
  assert.equal(out.length - out.indexOf("</head>"), html.length - html.indexOf("</head>"), "the body is untouched")
  assert.equal(restyle("<html>no tokens</html>", sepia, "broadsheet"), "")
})

test("the paper lies on a table by default, and can go flat", () => {
  const { restyle, styleTokens } = require("../lib/render.js")
  const table = renderEdition(compose(gathering()))
  assert.match(table, /<html lang="en" data-style="table">/, "the table is the default")
  const flat = renderEdition(compose(gathering({ paperStyle: "flat" })))
  assert.match(flat, /<html lang="en" data-style="flat">/)
  assert.match(renderEdition(compose(gathering({ paperStyle: "glossy" }))), /data-style="table"/, "an unknown style gets the default")
  assert.match(restyle(flat, null, "inkwell", "table"), /<html lang="en" data-style="table">/)
  assert.match(restyle(table, null, "inkwell", "flat"), /<html lang="en" data-style="flat">/)
  assert.equal(styleTokens(null, "inkwell", "table").look, "table")
})

test("every scene is a real style with its own backdrop", () => {
  const { renderEdition, restyle, styleTokens } = require("../lib/render.js")
  for (const id of ["sky", "space", "nomad", "overlook", "tropical"]) {
    const page = renderEdition(compose(gathering({ paperStyle: id })))
    assert.match(page, new RegExp('<html lang="en" data-style="' + id + '">'), id + " lands on the page")
    assert.match(page, new RegExp('\\[data-style="' + id + '"\\] \\.sheet'), id + " has a sheet rule")
    assert.match(page, new RegExp('\\[data-style="' + id + '"\\] \\.card-body'), id + " has a share-card rule")
    assert.equal(styleTokens(null, "inkwell", id).look, id)
    assert.match(restyle(page, null, "inkwell", "table"), /data-style="table"/, "a scene can go back to the table")
  }
})

test("the share card carries counts and the headline, never prompts, commits or desks", () => {
  const { renderShareCard } = require("../lib/render.js")
  const g = gathering()
  const ed = compose(g)
  ed.extras = { sections: [{ source: "gmail", kicker: "Gmail", headline: "Mail from Ada", deck: "", items: [{ title: "Ada", detail: "secret contract" }] }] }
  const card = renderShareCard(ed)
  assert.ok(card.includes(Model.longDate(g.key)) || card.includes(ed.longDate))
  assert.ok(card.includes("<h1>" + renderEdition(ed).match(/<h1>([^<]*)<\/h1>/)[1] + "</h1>"), "the day's headline")
  for (const s of g.sessions) for (const p of s.prompts) assert.ok(!card.includes(p.text.slice(0, 30)), "no prompt text")
  for (const d of g.desk || []) for (const c of d.commits) assert.ok(!card.includes(c.subject), "no commit subjects")
  assert.ok(!/secret contract|Mail from Ada/.test(card), "no plugin desks")
  assert.ok(!/inkwell-daily:\/\/share/.test(card), "no share button on the card itself")
})

test("the share button links to the app and stays off the web copy", () => {
  const { webCopy } = require("../lib/web.js")
  const html = renderEdition(compose(gathering()))
  assert.match(html, /<a class="share" href="inkwell-daily:\/\/share\?date=2026-10-15"/)
  assert.ok(!/class="share"/.test(webCopy(html).html.replace(/\.share[^{]*\{[^}]*\}/g, "")))
})
