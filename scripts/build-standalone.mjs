#!/usr/bin/env node
// Build a single self-contained `inkwell-daily` executable with Node's
// single-executable application support (SEA).
//
//   npm run bundle                 build for the machine you're on
//   NODE_BINARY=/path/to/node ...  build with a downloaded Node of the same
//                                  version for another CPU (release builds)
//
// The executable is written to dist/standalone/inkwell-daily (or .exe). It
// needs no Node install, no node_modules, and no package.json.

"use strict"

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import esbuild from "esbuild"
import { inject } from "postject"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "dist", "standalone")
const BUNDLE = path.join(OUT, "inkwell-daily.cjs")
const BLOB = path.join(OUT, "inkwell-daily.blob")
const CONFIG = path.join(OUT, "sea-config.json")
const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
const IS_WIN = process.platform === "win32"
const BINARY = path.join(OUT, "inkwell-daily" + (IS_WIN ? ".exe" : ""))

function run(cmd, args, opts) {
  return execFileSync(cmd, args, Object.assign({ stdio: "inherit" }, opts || {}))
}

function removeSignature(file) {
  if (process.platform !== "darwin") return
  try { execFileSync("codesign", ["--remove-signature", file], { stdio: "ignore" }) } catch (e) {}
}

function adhocSign(file) {
  if (process.platform !== "darwin") return
  execFileSync("codesign", ["--sign", "-", "--force", file], { stdio: "inherit" })
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  await esbuild.build({
    entryPoints: [path.join(ROOT, "bin", "inkwell-daily.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: BUNDLE,
    allowOverwrite: true,
    logLevel: "warning"
  })

  fs.writeFileSync(CONFIG, JSON.stringify({
    main: BUNDLE,
    output: BLOB,
    disableExperimentalSEAWarning: true
  }, null, 2) + "\n")

  run(process.execPath, ["--experimental-sea-config", CONFIG])

  const nodeBinary = process.env.NODE_BINARY || process.execPath
  fs.copyFileSync(nodeBinary, BINARY)
  fs.chmodSync(BINARY, 0o755)
  removeSignature(BINARY)

  await inject(BINARY, "NODE_SEA_BLOB", fs.readFileSync(BLOB), {
    sentinelFuse: SENTINEL,
    ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {})
  })
  adhocSign(BINARY)

  const check = execFileSync(BINARY, ["help"], { encoding: "utf8" })
  if (!/Inkwell/.test(check)) throw new Error("the standalone build did not print its help text")

  const size = (fs.statSync(BINARY).size / (1024 * 1024)).toFixed(1)
  process.stdout.write("Built " + BINARY + " (" + size + " MB)\n")
}

main().catch(e => {
  process.stderr.write(String(e && e.stack || e) + "\n")
  process.exit(1)
})
