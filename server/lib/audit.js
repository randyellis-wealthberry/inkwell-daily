// One JSON line per request: who read which desk, when, and what came of it.
//
// A service that reads mail should be able to answer "who read what" during an
// incident, and should never need to keep the content to do it. The path, the
// hashed user and the status are enough; a body, a token, a license or a
// subject line are not, and none of them are written here.
//
// stdout by default, so a platform's log collector picks it up. Set
// INKWELL_AUDIT=0 to silence it, or INKWELL_AUDIT_FILE for a file at 0600.

import fs from "node:fs"

function createAudit(opts) {
  opts = opts || {}
  const stream = opts.stream || process.stdout
  const file = opts.file || ""
  const handle = file ? fs.createWriteStream(file, { flags: "a", mode: 0o600 }) : null

  return {
    write(entry) {
      const line = JSON.stringify(entry) + "\n"
      if (handle) handle.write(line)
      else stream.write(line)
    }
  }
}

const silent = { write() {} }

export { createAudit, silent }
