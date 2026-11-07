// The paper quotes your own Claude and Codex prompts, so everything it
// writes is for your account only. Both entry points call privately() on
// the paper's folder before writing anything.

"use strict"

const fs = require("node:fs")
const path = require("node:path")

// A private umask makes every folder and file born 0700 and 0600, including
// those of the claude the builder starts. Then whatever an older version left
// readable to others is tightened, so upgrading closes the gap on one build.
function privately(dir) {
  process.umask(0o077)
  tighten(dir)
}

function tighten(p) {
  let st
  try { st = fs.lstatSync(p) } catch (e) { return }
  if (st.isDirectory()) {
    if (st.mode & 0o077) fs.chmodSync(p, 0o700)
    for (const name of fs.readdirSync(p)) tighten(path.join(p, name))
  } else if (st.isFile() && st.mode & 0o077) {
    fs.chmodSync(p, 0o600)
  }
}

module.exports = { privately }
