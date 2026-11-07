// The usage line: tokens and prompts per day, with a simple forecast for
// tomorrow. Tokens lead when there are any; prompts are the fallback. Shared
// by the paper and the menu bar app.

"use strict"

const Model = require("../Model.js")

function keysEnding(endKey, days) {
  const out = []
  for (let i = days - 1; i >= 0; i--) out.push(Model.shiftDateKey(endKey, -i))
  return out
}

function countPrompts(sessions) {
  const counts = {}
  for (const s of sessions || []) {
    for (const p of s.prompts || []) {
      if (p && p.key) counts[p.key] = (counts[p.key] || 0) + 1
    }
  }
  return counts
}

function countTokens(usage) {
  const counts = {}
  for (const u of usage || []) {
    if (!u || !u.key) continue
    const n = (Number(u.input) || 0) + (Number(u.output) || 0) +
      (Number(u.cacheRead) || 0) + (Number(u.cacheWrite) || 0)
    counts[u.key] = (counts[u.key] || 0) + n
  }
  return counts
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

// A weighted average of the last seven days, nudged by whether the last three
// are above or below the four before them. It follows a real rise without
// letting one spike become the whole forecast.
function project(values) {
  if (!values.length || !values.some(v => v > 0)) return 0
  const window = values.slice(-7)
  const weights = [1, 1.15, 1.3, 1.5, 1.7, 1.9, 2.1].slice(-window.length)
  let sum = 0
  let total = 0
  window.forEach((v, i) => {
    sum += v * weights[i]
    total += weights[i]
  })
  const weighted = sum / total
  const recent = mean(window.slice(-3))
  const earlier = mean(window.slice(0, Math.max(0, window.length - 3)))
  const adjustment = earlier > 0 ? (recent - earlier) * 0.2 : 0
  return Math.max(0, weighted + adjustment)
}

function formatTokens(n) {
  if (!n) return "0"
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M"
  if (n >= 1e3) return Math.round(n / 1e3) + "k"
  return String(Math.round(n))
}

function busiestWeekday(rows, field) {
  const totals = {}
  for (const r of rows) {
    const w = Model.weekday(r.date)
    totals[w] = (totals[w] || 0) + r[field]
  }
  let best = ""
  let count = 0
  for (const w of Object.keys(totals)) {
    if (totals[w] > count) {
      best = w
      count = totals[w]
    }
  }
  return best
}

function directionOf(recent, previous, hasPrevious) {
  if (!hasPrevious) return "flat"
  if (recent > previous * 1.1 + 0.5) return "up"
  if (recent < previous * 0.9 - 0.5) return "down"
  return "flat"
}

function compute(sessions, usage, endKey, days) {
  const span = Math.max(7, Math.min(31, Number(days) || 14))
  const keys = keysEnding(endKey, span)
  const prompts = countPrompts(sessions)
  const tokens = countTokens(usage)
  const rows = keys.map(k => ({
    date: k,
    label: Model.weekday(k).slice(0, 3),
    prompts: prompts[k] || 0,
    tokens: tokens[k] || 0
  }))

  const promptValues = rows.map(r => r.prompts)
  const tokenValues = rows.map(r => r.tokens)
  const totalPrompts = promptValues.reduce((a, b) => a + b, 0)
  const totalTokens = tokenValues.reduce((a, b) => a + b, 0)
  const useTokens = totalTokens > 0
  const values = useTokens ? tokenValues : promptValues
  const field = useTokens ? "tokens" : "prompts"

  const recent = mean(values.slice(-7))
  const previousValues = values.slice(0, Math.max(0, values.length - 7))
  const previous = mean(previousValues)
  const hasPrevious = previousValues.length >= 3
  const direction = directionOf(recent, previous, hasPrevious)
  const deltaPercent = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : null

  const forecastPrompts = Math.round(project(promptValues))
  const forecastTokens = Math.round(project(tokenValues))
  const forecastValue = useTokens ? forecastTokens : forecastPrompts
  const peak = values.some(v => v > 0)
    ? rows.reduce((best, row) => row[field] > best[field] ? row : best, rows[0])
    : null
  const busiest = busiestWeekday(rows, field)
  const activeDays = rows.filter(r => r[field] > 0).length
  const nextDay = Model.weekday(Model.shiftDateKey(endKey, 1))
  const period = span === 14 ? "fortnight" : span + " days"

  const headline = !values.some(v => v > 0)
    ? "A clean page"
    : direction === "up"
      ? "The line is leaning up"
      : direction === "down"
        ? "The line is easing"
        : "The line holds steady"

  let blurb
  let teaser
  if (useTokens) {
    const change = direction === "up" && deltaPercent != null
      ? " Up " + Math.abs(deltaPercent) + "% on the week before."
      : direction === "down" && deltaPercent != null
        ? " Down " + Math.abs(deltaPercent) + "% on the week before."
        : ""
    const average = formatTokens(recent)
    const forecastText = forecastTokens === 0
      ? "a quiet one"
      : "about " + formatTokens(forecastTokens) + " tokens"
    const busyText = busiest ? " " + busiest + " has been your heaviest day." : ""
    const promptText = totalPrompts
      ? " You typed " + totalPrompts + (totalPrompts === 1 ? " prompt." : " prompts.")
      : ""
    blurb = "Your agents used " + formatTokens(totalTokens) + " tokens in the last " + period +
      ", about " + average + " a day." + change + " Tomorrow looks like " + forecastText + "." + busyText + promptText
    teaser = deltaPercent != null && direction !== "flat"
      ? (direction === "up" ? "Up " : "Down ") + Math.abs(deltaPercent) + "% · tomorrow ~" + formatTokens(forecastTokens)
      : "Steady · tomorrow ~" + formatTokens(forecastTokens)
  } else {
    const change = direction === "up" && deltaPercent != null
      ? " Up " + Math.abs(deltaPercent) + "% on the week before."
      : direction === "down" && deltaPercent != null
        ? " Down " + Math.abs(deltaPercent) + "% on the week before."
        : ""
    const average = recent > 0 ? Math.max(1, Math.round(recent)) : 0
    const forecastText = forecastPrompts === 0
      ? "a quiet one"
      : "about " + forecastPrompts + (forecastPrompts === 1 ? " prompt" : " prompts")
    const busyText = busiest ? " " + busiest + " has been your busiest day." : ""
    blurb = totalPrompts === 0
      ? "No prompts in the last " + period + ". Tomorrow is a clean page."
      : "You typed " + totalPrompts + " prompts in the last " + period +
        ", about " + average + " a day." + change + " Tomorrow looks like " + forecastText + "." + busyText
    teaser = totalPrompts === 0
      ? "A clean page"
      : deltaPercent != null && direction !== "flat"
        ? (direction === "up" ? "Up " : "Down ") + Math.abs(deltaPercent) + "% · tomorrow ~" + forecastPrompts
        : "Steady · tomorrow ~" + forecastPrompts
  }

  return {
    end: endKey,
    days: rows,
    totalPrompts,
    totalTokens,
    activeDays,
    metric: field,
    averagePrompts: mean(promptValues.slice(-7)),
    averageTokens: mean(tokenValues.slice(-7)),
    forecast: {
      day: nextDay,
      prompts: forecastPrompts,
      tokens: forecastTokens,
      direction,
      deltaPercent
    },
    peak,
    busiest,
    headline,
    teaser,
    blurb
  }
}

module.exports = { compute, formatTokens }
