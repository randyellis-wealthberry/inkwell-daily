// The paper's integration sections: one GET, shaped by the service. Like the
// library, this is optional and any failure simply means no folds.

"use strict"

const Integrations = require("./integrations.js")

async function library(cfg, ctx, net) {
  const body = await Integrations.get(cfg, "/sections", { date: ctx.date, tz: ctx.tz }, net)
  if (!body || !Array.isArray(body.sections)) return null
  return body
}

module.exports = { library }
