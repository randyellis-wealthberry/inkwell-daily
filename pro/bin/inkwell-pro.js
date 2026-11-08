#!/usr/bin/env node

// The only command this package needs: put a license key and the desks URL
// where the sources can find them. It writes nothing else.
//
//   inkwell-pro activate <key> [--url https://your-desks-host]
//   inkwell-pro status

"use strict"

const Settings = require("../lib/settings")
const { DESKS } = require("../lib/desks")

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : ""
}

function main() {
  const cmd = process.argv[2]

  if (cmd === "activate") {
    const license = process.argv[3]
    if (!license || license.startsWith("--")) {
      process.stderr.write("inkwell-pro: inkwell-pro activate <your license key> [--url <desks url>]\n")
      process.exit(2)
    }
    const existing = Settings.read()
    const url = arg("--url") || existing.url
    if (!url) {
      process.stderr.write("inkwell-pro: no desks URL yet. Add --url, or set INKWELL_PRO_API.\n")
      process.exit(2)
    }
    const file = Settings.write({ license: license, url: url })
    process.stdout.write("Activated. Settings saved to " + file + "\n")
    process.stdout.write("Desks: " + DESKS.map(d => d.name).join(", ") + "\n")
    return
  }

  if (cmd === "status") {
    const s = Settings.read()
    const file = Settings.file()
    if (!s.ok) {
      process.stdout.write("Not activated. Run `inkwell-pro activate <your license key> --url <desks url>`.\n")
      process.exit(1)
    }
    process.stdout.write("License: " + s.license.slice(0, 4) + "…" + s.license.slice(-4) + "\n")
    process.stdout.write("Desks:   " + s.url + "\n")
    process.stdout.write("Saved:   " + file + "\n")
    return
  }

  process.stdout.write("Usage:\n  inkwell-pro activate <key> [--url <desks url>]\n  inkwell-pro status\n")
}

main()
