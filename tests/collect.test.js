const test = require("node:test")
const assert = require("node:assert/strict")
const C = require("../lib/collect.js")

test("Codex's cumulative token count becomes one usage record", () => {
  const text = [
    '{"type":"session_meta","payload":{"id":"s","model":"gpt-5.1-codex"}}',
    '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1000,"cached_input_tokens":400,"output_tokens":200,"reasoning_output_tokens":50,"total_tokens":1200}}}}',
    '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":3000,"cached_input_tokens":1000,"output_tokens":500,"reasoning_output_tokens":100,"total_tokens":3500}}}}'
  ].join("\n")
  const u = C.parseCodexUsage(text, "2026-11-06")
  assert.equal(u.source, "codex")
  assert.equal(u.provider, "openai")
  assert.equal(u.model, "gpt-5.1-codex")
  assert.equal(u.input, 2000, "cached input is billed separately")
  assert.equal(u.cacheRead, 1000)
  assert.equal(u.output, 500)
  assert.equal(u.key, "2026-11-06")
})

test("a Codex session with no token count is left out", () => {
  assert.equal(C.parseCodexUsage('{"type":"turn_context","payload":{"model":"gpt-5.1-codex"}}', "2026-11-06"), null)
  assert.equal(C.parseCodexUsage("", "2026-11-06"), null)
})
