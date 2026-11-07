const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const BIN = path.join(__dirname, "..", "bin")

function modes(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.lstatSync(p)
    out.push([p, st.isDirectory(), st.mode & 0o777])
    if (st.isDirectory()) modes(p, out)
  }
  return out
}

test("the paper and its web copy are private under a umask of 022, and old files are tightened", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "daily-test-"))
  try {
    // What an older version left behind: readable by everyone.
    const data = path.join(home, ".local/share/inkwell-daily")
    fs.mkdirSync(path.join(data, "editions"), { recursive: true, mode: 0o755 })
    fs.chmodSync(data, 0o755)
    fs.writeFileSync(path.join(data, "editions/2026-10-12.json"), "{}\n", { mode: 0o644 })

    const env = Object.assign({}, process.env, { HOME: home, XDG_DATA_HOME: "" })
    const run = "umask 022 && node \"$1\" build --offline --date 2026-10-14 >/dev/null && node \"$1\" publish --dry-run >/dev/null"
    execFileSync("sh", ["-c", run, "sh", path.join(BIN, "inkwell-daily.js")], { env: env, timeout: 60000 })

    const all = modes(data, [[data, true, fs.statSync(data).mode & 0o777]])
    for (const want of ["editions/2026-10-14.html", "editions/2026-10-14.json", "editions/index.html", "editions.json", "latest.html", "web/index.html", "web/img"]) {
      assert.ok(all.some(([p]) => p === path.join(data, want)), want + " was written")
    }
    for (const [p, dir, mode] of all) assert.equal(mode, dir ? 0o700 : 0o600, path.relative(home, p) + " is " + mode.toString(8))
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
