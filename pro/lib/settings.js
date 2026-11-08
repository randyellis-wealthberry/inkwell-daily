// Where this package keeps its two settings: the license key and the base URL
// of the service that holds the Composio key.
//
// The key is never in an environment variable in normal use; it lives in
// pro.json beside the editions, readable only by the person who ran
// `inkwell-pro activate`. The environment is a test and CI convenience, not a
// supported place for a license.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

// The same folder lib/platform.js in inkwell-daily computes. Duplicated on
// purpose: this package is installed and versioned on its own, so it must not
// reach into the free paper's internals.
function dataDir(platform, env, homeDir) {
  platform = platform || process.platform
  env = env || process.env
  homeDir = homeDir || os.homedir()
  if (platform === "darwin") return path.join(homeDir, "Library/Application Support/InkwellDaily")
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local"), "InkwellDaily")
  return path.join(env.XDG_DATA_HOME || path.join(homeDir, ".local/share"), "inkwell-daily")
}

const FILE = "pro.json"

function file(dir) { return path.join(dir || dataDir(), FILE) }

// Returns { url, license, ok }. A missing or unreadable file is not an error
// here; it is simply an unactivated install, which every source reports as a
// closed desk.
function read(dir) {
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(file(dir), "utf8")) } catch (e) { saved = {} }
  const license = str(saved.license) || str(process.env.INKWELL_PRO_LICENSE)
  const url = trimUrl(str(saved.url) || str(process.env.INKWELL_PRO_API))
  return { license, url, ok: !!(license && url) }
}

// 0600, in the paper's own folder. The folder itself is already 0700 on macOS.
function write(settings, dir) {
  const target = file(dir)
  const body = JSON.stringify({ url: trimUrl(settings.url), license: settings.license }, null, 2) + "\n"
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  fs.writeFileSync(target, body, { mode: 0o600 })
  try { fs.chmodSync(target, 0o600) } catch (e) { /* Windows ignores the mode */ }
  return target
}

function str(v) { return typeof v === "string" ? v.trim() : "" }

function trimUrl(u) { return str(u).replace(/\/+$/, "") }

module.exports = { dataDir, file, read, write }
