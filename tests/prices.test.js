const test = require("node:test")
const assert = require("node:assert/strict")
const { normalize, priceOf } = require("../lib/prices.js")

test("the price catalog reads both models.dev shapes", () => {
  const catalog = normalize({
    anthropic: {
      models: {
        "claude-opus-4-5-20251101": {
          name: "Claude Opus 4.5",
          cost: { text: { input: { price: 5, cache: { read: 0.5, write: { "5m": 6.25, "1h": 10 } } }, output: { price: 25 } } }
        }
      }
    },
    openai: {
      models: {
        "gpt-6-luna": { name: "GPT-6 Luna", cost: { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 } }
      }
    },
    free: {
      models: { "free-model": { name: "Free Model", cost: { input: 0, output: 0 } } }
    }
  })
  assert.equal(catalog["anthropic/claude-opus-4-5-20251101"].input, 5)
  assert.equal(catalog["anthropic/claude-opus-4-5-20251101"].output, 25)
  assert.equal(catalog["anthropic/claude-opus-4-5-20251101"].cacheRead, 0.5)
  assert.equal(catalog["anthropic/claude-opus-4-5-20251101"].cacheWrite, 6.25)
  assert.equal(catalog["openai/gpt-6-luna"].cacheRead, 0.01)
  assert.equal(catalog["openai/gpt-6-luna"].cacheWrite, 0.125)
  assert.equal(catalog["free/free-model"].input, 0, "a free model is priced, not skipped")
  assert.equal(priceOf(0), 0)
  assert.equal(priceOf({ price: 2 }), 2)
  assert.equal(priceOf({ "5m": 1.5, "1h": 3 }), 1.5)
  assert.equal(priceOf(undefined), null)
  assert.deepEqual(normalize({}), {})
  assert.deepEqual(normalize({ x: { models: { m: { cost: 3 } } } }), {})
})
