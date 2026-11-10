const test = require("node:test")
const assert = require("node:assert/strict")
const { USAGE } = require("../lib/usage.js")
const P = require("../lib/platform.js")

test("help text names every command", () => {
  for (const cmd of ["build", "morning", "open", "index", "latest", "status", "theme", "font", "publish", "install", "uninstall", "config", "sources"]) {
    assert.match(USAGE, new RegExp("inkwell-daily " + cmd + "\\b"), "help is missing " + cmd)
  }
})

test("a standalone build's launchd job runs the executable itself", () => {
  const plist = P.launchdPlist("/Applications/Inkwell.app/inkwell-daily", "", 5, "/tmp/inkwell")
  assert.match(plist, /<string>\/Applications\/Inkwell\.app\/inkwell-daily<\/string>/)
  assert.match(plist, /<string>morning<\/string>/)
  assert.doesNotMatch(plist, /<string><\/string>/, "no empty program argument")
})

test("a standalone build's Task Scheduler action has no script path", () => {
  const xml = P.taskXml("C:\\Inkwell\\inkwell-daily.exe", "", 5)
  assert.match(xml, /<Command>C:\\Inkwell\\inkwell-daily\.exe<\/Command>/)
  assert.match(xml, /<Arguments>morning<\/Arguments>/)
})

test("an npm install still gets node and the script path", () => {
  const plist = P.launchdPlist("/usr/local/bin/node", "/usr/local/lib/inkwell/bin/inkwell-daily.js", 5, "/tmp/inkwell")
  assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/)
  assert.match(plist, /<string>\/usr\/local\/lib\/inkwell\/bin\/inkwell-daily\.js<\/string>/)
})

test("a Homebrew node is scheduled through its stable symlink", () => {
  assert.equal(
    P.stableNode("/opt/homebrew/Cellar/node/24.22.0/bin/node"),
    "/opt/homebrew/bin/node"
  )
  assert.equal(P.stableNode("/usr/local/bin/node"), "/usr/local/bin/node")
  assert.equal(P.stableNode("C:\\Program Files\\nodejs\\node.exe"), "C:\\Program Files\\nodejs\\node.exe")
})

test("a Homebrew install is scheduled through its linked command", () => {
  assert.equal(
    P.stableScript("/opt/homebrew/Cellar/inkwell-daily/1.0.1/libexec/bin/inkwell-daily.js"),
    "/opt/homebrew/bin/inkwell-daily"
  )
  assert.equal(
    P.stableScript("/Users/a/.nvm/versions/node/v24.22.0/lib/node_modules/inkwell-daily/bin/inkwell-daily.js"),
    "/Users/a/.nvm/versions/node/v24.22.0/lib/node_modules/inkwell-daily/bin/inkwell-daily.js"
  )
})
