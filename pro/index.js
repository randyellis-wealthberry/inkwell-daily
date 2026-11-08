// The package inkwell-daily loads from its plugin slot. It exports sources and
// nothing else: no CLI side effects, no config writes, no network at require
// time, so `inkwell-daily build --offline` stays offline even with Pro
// installed.

"use strict"

const { sources, DESKS, zone } = require("./lib/desks")

module.exports = {
  status: "five read-only desks through Composio: mail, city, notebook, daybook, project",
  sources,
  DESKS,
  zone
}
