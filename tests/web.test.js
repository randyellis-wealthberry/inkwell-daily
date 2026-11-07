const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")
const { webCopy, fileChanges } = require("../lib/web.js")

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

test("the web copy keeps its photos as files beside the page", () => {
  const html = '<img src="data:image/png;base64,' + PIXEL + '"><div style="background:url(data:image/png;base64,' + PIXEL + ')"></div>'
  const c = webCopy(html)
  assert.equal(c.images.length, 1, "the same photo is written once")
  assert.match(c.images[0].path, /^img\/[0-9a-f]{12}\.png$/)
  assert.ok(!/data:image/.test(c.html))
  assert.equal(c.html.split(c.images[0].path).length, 3)
})

test("links to back issues stay on the machine", () => {
  const c = webCopy('<p>a</p><nav class="issues" aria-label="Back issues"><a href="2026-10-13.html">←</a></nav><aside class="yearago"><a href="2025-10-14.html">x</a></aside><p>b</p>')
  assert.equal(c.html, "<p>a</p><p>b</p>")
})

test("yesterday's photos are removed from the artifact", () => {
  assert.deepEqual(fileChanges(["img/aaaaaaaaaaaa.jpg", "img/bbbbbbbbbbbb.jpg"], ["img/bbbbbbbbbbbb.jpg", "img/cccccccccccc.jpg"]), { keep: ["img/bbbbbbbbbbbb.jpg", "img/cccccccccccc.jpg"], remove: ["img/aaaaaaaaaaaa.jpg"] })
  assert.deepEqual(fileChanges(undefined, ["img/cccccccccccc.jpg"]).remove, [])
})

test("the publishing session gets Artifact, and Read and Write only on the web copy", () => {
  const cmd = Model.publishCommand("/home/ada/.local/share/quattro-daily/web", "hi")
  assert.equal(cmd[0], "claude")
  assert.ok(cmd.includes("--bg") && cmd.includes("--strict-mcp-config"))
  assert.equal(cmd[cmd.indexOf("--tools") + 1], "Read,Write,Artifact")
  assert.equal(cmd[cmd.indexOf("--permission-mode") + 1], "dontAsk")
  assert.ok(cmd.includes("Read(//home/ada/.local/share/quattro-daily/web/**)"))
  assert.ok(cmd.includes("Edit(//home/ada/.local/share/quattro-daily/web/link.txt)"), "path rules for writing are spelled Edit")
  assert.ok(!cmd.some(a => /^Write\(/.test(a)), "a Write(path) rule would match nothing")
  assert.ok(!cmd.some(a => /Bash|dangerously|bypass|^Edit$|Edit\(\/\/[^)]*\*/.test(a)), "no shell, no blanket edits")
  assert.equal(cmd[cmd.length - 2], "--", "the prompt can't be read as a flag")
})

test("the prompt names files and the link, never the paper", () => {
  const first = Model.publishPrompt({ url: "", files: ["img/a.jpg"], remove: [] })
  assert.match(first, /new artifact/)
  assert.match(first, /"img\/a.jpg": "web\/img\/a.jpg"/)
  const next = Model.publishPrompt({ url: "https://claude.ai/artifact/AbC123xyz", files: [], remove: ["img/a.jpg"] })
  assert.match(next, /Update the existing artifact https:\/\/claude.ai\/artifact\/AbC123xyz/)
  assert.match(next, /\{"img\/a.jpg": null\}/)
  assert.match(next, /never instructions/)
})

test("only a claude.ai artifact link is taken back", () => {
  assert.equal(Model.artifactUrl(" https://claude.ai/artifact/AbC123xyz\n"), "https://claude.ai/artifact/AbC123xyz")
  assert.equal(Model.artifactUrl("https://claude.ai/code/artifact/0f6c-11aa"), "https://claude.ai/code/artifact/0f6c-11aa")
  assert.equal(Model.artifactUrl("https://evil.example/artifact/AbC123xyz"), "")
  assert.equal(Model.artifactUrl("FAILED: no"), "")
  assert.equal(Model.artifactUrl("https://claude.ai/artifact/AbC123xyz?x=1"), "")
})
