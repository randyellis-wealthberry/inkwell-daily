// The text `inkwell-daily help` prints. It lives in its own module so the
// bundled, standalone build never has to read the executable it runs from.

"use strict"

const USAGE = `Inkwell Daily for macOS and Windows: a morning newspaper about yesterday's
agent work and commits, set from your own machine.

  inkwell-daily build [--date YYYY-MM-DD] [--prose] [--offline] [--print-prompt] [--out DIR]
  inkwell-daily morning              set yesterday's edition if it isn't yet, toast, publish
  inkwell-daily open [YYYY-MM-DD]    read the newest (or that) edition in your browser
  inkwell-daily index                every edition, in your browser
  inkwell-daily latest               the newest edition's path
  inkwell-daily status               {"latest": …, "unread": …, "web": …}
  inkwell-daily theme [id]           the milestone themes you've unlocked
  inkwell-daily font [id]            the type pairing for the paper
  inkwell-daily style [flat|table]   a flat page, or the paper lying on a table
  inkwell-daily restyle [--date D]   put the newest (or that) edition in today's theme and font, at once
  inkwell-daily trend [--days N] [--date D] [--json]
                                     prompts and tokens per day, with a forecast
  inkwell-daily portrait [good|bad [YYYY-MM-DD] | test]
                                     Pro: rate an edition's portrait, try the generator, or see how each does
  inkwell-daily publish [--date D] [--dry-run]   put an edition on claude.ai
  inkwell-daily install [--hour H]   set the paper each morning (launchd / Task Scheduler)
  inkwell-daily uninstall            stop the morning run
  inkwell-daily config               where the settings file is, and what's in it
  inkwell-daily sources              the plugin sources that will report (Inkwell Pro and others)
`

module.exports = { USAGE }
