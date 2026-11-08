// The five standing features, as the paper sees them.
//
// Each source is one desk and one GET. `collect` receives the paper's context
// ({ key, from, to, net, config, dataDir }) and returns the desk payload the
// service shaped: { state, lastSet, action, sections, meter, classifieds }.
// lib/sources.js in inkwell-daily cuts it to size and escapes it, so nothing
// here has to trust the answer.

"use strict"

const Settings = require("./settings")
const Client = require("./client")

const DESKS = [
  { id: "gmail", name: "Gmail", desk: "mail" },
  { id: "slack", name: "Slack", desk: "city" },
  { id: "notion", name: "Notion", desk: "notebook" },
  { id: "calendar", name: "Google Calendar", desk: "daybook" },
  { id: "basecamp", name: "Basecamp", desk: "project" }
]

// The zone the paper is being read in, so the service can print "9:30 am"
// rather than a UTC timestamp. Falls back to the machine's zone, then to UTC.
function zone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } catch (e) { return "UTC" }
}

function sourceFor(meta) {
  return {
    id: meta.id,
    name: meta.name,
    desk: meta.desk,
    async collect(ctx) {
      ctx = ctx || {}
      const merged = Object.assign(Settings.read(ctx.dataDir), ctx.config || {})
      // `inkwell-pro activate` writes `url`; the menu bar app writes `proxyUrl`
      // into config.json. They mean the same service, so accept either.
      const settings = { license: merged.license, url: merged.url || merged.proxyUrl }
      if (!settings.license || !settings.url) {
        return {
          state: "closed",
          note: "Inkwell Pro is installed but not activated. Run `inkwell-pro activate <your license key>`."
        }
      }
      // --offline means no network at all, the same promise the free paper makes.
      if (ctx.net === false) return { state: "offline", note: "Skipped: the edition was built offline." }

      try {
        const body = await Client.get(settings, "/desk/" + meta.id, {
          date: ctx.key,
          from: ctx.from,
          to: ctx.to,
          tz: zone()
        })
        return body && typeof body === "object" ? body : { state: "error", note: "The desks service returned nothing." }
      } catch (e) {
        return { state: Client.stateOf(e), note: String(e && e.message || e).slice(0, 300) }
      }
    }
  }
}

// `status` is printed by the paper's loader when this plugin loads.
const sources = DESKS.map(sourceFor)

module.exports = { sources, DESKS, zone }
