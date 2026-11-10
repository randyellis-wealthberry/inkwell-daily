// Everything that differs between macOS, Windows and Linux: where the paper
// lives, who you are, your wallpaper, how a page is opened and a toast shown,
// and how the morning run is scheduled. Each function takes the platform as
// an argument where it can, so tests can ask about the others.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const APP_ID = "com.wealthberrylabs.inkwell-daily"
const TASK_NAME = "InkwellDaily"

function home() { return os.homedir() }

function run(cmd, args, opts) {
  try {
    return execFileSync(cmd, args, Object.assign({ encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }, opts || {}))
  } catch (e) {
    return ""
  }
}

// Where editions, the index and the web copy are kept.
function dataDir(platform, env, homeDir) {
  platform = platform || process.platform
  env = env || process.env
  homeDir = homeDir || home()
  if (platform === "darwin") return path.posix.join(homeDir, "Library/Application Support/InkwellDaily")
  if (platform === "win32") return path.win32.join(env.LOCALAPPDATA || path.win32.join(homeDir, "AppData", "Local"), "InkwellDaily")
  return path.posix.join(env.XDG_DATA_HOME || path.posix.join(homeDir, ".local/share"), "inkwell-daily")
}

function configFile(platform, env, homeDir) {
  return path.join(dataDir(platform, env, homeDir), "config.json")
}

// Settings live in one small JSON file beside the editions.
const DEFAULTS = { hour: 5, notify: true, prose: false, web: false, theme: "milestone", font: "inkwell", style: "table", repos: [], plugins: [], sources: {}, latitude: null, longitude: null, place: "", units: "auto" }

function readConfig(file) {
  let c = {}
  try { c = JSON.parse(fs.readFileSync(file || configFile(), "utf8")) } catch (e) {}
  const out = Object.assign({}, DEFAULTS)
  if (c && typeof c === "object") {
    if (Number.isInteger(c.hour) && c.hour >= 0 && c.hour <= 23) out.hour = c.hour
    for (const k of ["notify", "prose", "web"]) if (typeof c[k] === "boolean") out[k] = c[k]
    if (Array.isArray(c.repos)) out.repos = c.repos.filter(r => typeof r === "string" && r).slice(0, 200)
    if (isFinite(Number(c.latitude)) && c.latitude !== null && Math.abs(Number(c.latitude)) <= 90) out.latitude = Number(c.latitude)
    if (isFinite(Number(c.longitude)) && c.longitude !== null && Math.abs(Number(c.longitude)) <= 180) out.longitude = Number(c.longitude)
    if (Array.isArray(c.plugins)) out.plugins = c.plugins.filter(p => typeof p === "string" && p).slice(0, 20)
    if (c.sources && typeof c.sources === "object" && !Array.isArray(c.sources)) out.sources = c.sources
    if (typeof c.place === "string") out.place = c.place.slice(0, 80)
    if (["auto", "metric", "imperial"].includes(c.units)) out.units = c.units
    if (typeof c.theme === "string" && c.theme.trim()) out.theme = c.theme.trim().slice(0, 40)
    if (typeof c.font === "string" && c.font.trim()) out.font = c.font.trim().slice(0, 40)
    if (["flat", "table"].includes(c.style)) out.style = c.style
    if (c.headlines && typeof c.headlines === "object" && !Array.isArray(c.headlines)) out.headlines = c.headlines
    // For whoever builds Inkwell: print the paper as Pro does, without the plugin.
    if (c.developer && c.developer.pro === true) out.developer = { pro: true }
  }
  return out
}

// Your full name, for the masthead: the account's display name when the
// system keeps one, else the user name.
function fullName(platform) {
  platform = platform || process.platform
  const user = (() => { try { return os.userInfo().username } catch (e) { return process.env.USER || process.env.USERNAME || "" } })()
  let full = ""
  if (platform === "darwin") full = run("id", ["-F"]).trim()
  else if (platform === "win32") full = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "try { ([adsi]('WinNT://./' + $env:USERNAME + ',user')).FullName } catch { '' }"]).trim()
  else full = (run("getent", ["passwd", user]).split(":")[4] || "").split(",")[0]
  return { full: full, user: user }
}

// The desktop picture's path, so the paper can be laid over it.
function wallpaper(platform) {
  platform = platform || process.platform
  let p = ""
  if (platform === "darwin") {
    p = run("osascript", ["-e", 'tell application "System Events" to tell every desktop to get picture']).trim().split(", ")[0]
  } else if (platform === "win32") {
    const out = run("reg", ["query", "HKCU\\Control Panel\\Desktop", "/v", "WallPaper"])
    const m = /WallPaper\s+REG_SZ\s+(.+)/i.exec(out)
    p = m ? m[1].trim() : ""
    // Slideshows and some themes leave the value empty; Windows keeps a copy.
    if (!p && process.env.APPDATA) p = path.join(process.env.APPDATA, "Microsoft", "Windows", "Themes", "TranscodedWallpaper")
  }
  try { return p && fs.statSync(p).isFile() ? p : "" } catch (e) { return "" }
}

// Whether the system is set to dark mode; the page follows it.
function darkMode(platform) {
  platform = platform || process.platform
  if (platform === "darwin") return /dark/i.test(run("defaults", ["read", "-g", "AppleInterfaceStyle"]))
  if (platform === "win32") return /0x0\b/.test(run("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "/v", "AppsUseLightTheme"]))
  return true
}

// A palette for the page, in the shape Model.parseColors returns.
function palette(dark) {
  return dark
    ? { mode: "dark", foreground: "#e6e1d6", background: "#1b1a18", accent: "#d4a24c", muted: "#9a9488", darkBackground: "#121110", brightForeground: "#f4efe4", darkForeground: "#9a9488", red: "#d9645a", green: "#8fb573", yellow: "#d4a24c" }
    : { mode: "light", foreground: "#1d1b17", background: "#f6f1e7", accent: "#8a5a12", muted: "#6b665c", darkBackground: "#ebe4d6", brightForeground: "#000000", darkForeground: "#6b665c", red: "#a8322a", green: "#3f6b2a", yellow: "#8a5a12" }
}

// Free and total bytes on the disk that holds your home folder.
function disk(homeDir) {
  try {
    const s = fs.statfsSync(homeDir || home())
    return { free: s.bavail * s.bsize, size: s.blocks * s.bsize }
  } catch (e) {
    return { free: NaN, size: NaN }
  }
}

function hasCommand(cmd, platform, env) {
  platform = platform || process.platform
  env = env || process.env
  const sep = platform === "win32" ? ";" : ":"
  const exts = platform === "win32" ? String(env.PATHEXT || ".EXE;.CMD;.BAT").split(";").concat([""]) : [""]
  for (const dir of String(env.PATH || env.Path || "").split(sep)) {
    if (!dir) continue
    for (const ext of exts) {
      try { fs.accessSync(path.join(dir, cmd + ext), platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK); return true } catch (e) {}
    }
  }
  return false
}

// curl ships with macOS and with Windows 10 (1803) and later, as curl.exe.
function curlCommand(platform) {
  return (platform || process.platform) === "win32" ? "curl.exe" : "curl"
}

function openCommand(target, platform) {
  platform = platform || process.platform
  if (platform === "darwin") return ["open", String(target)]
  // `start` treats its first quoted argument as a window title.
  if (platform === "win32") return ["cmd.exe", "/c", "start", '""', String(target)]
  return ["xdg-open", String(target)]
}

// PowerShell and AppleScript each get the text as data: it goes in through
// the environment, never spliced into the script.
function toastCommand(title, body, platform) {
  platform = platform || process.platform
  if (platform === "darwin") {
    return { argv: ["osascript", "-e", 'display notification (system attribute "QD_BODY") with title (system attribute "QD_TITLE")'], env: { QD_TITLE: String(title), QD_BODY: String(body) } }
  }
  if (platform === "win32") {
    const ps = [
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
      "$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
      "$t = $x.GetElementsByTagName('text')",
      "$t.Item(0).AppendChild($x.CreateTextNode($env:QD_TITLE)) | Out-Null",
      "$t.Item(1).AppendChild($x.CreateTextNode($env:QD_BODY)) | Out-Null",
      "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))"
    ].join("; ")
    return { argv: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps], env: { QD_TITLE: String(title), QD_BODY: String(body) } }
  }
  return { argv: ["notify-send", "--app-name", "Inkwell", String(title), String(body)], env: {} }
}

function spawnDetached(argv, extraEnv) {
  try {
    const child = require("node:child_process").spawn(argv[0], argv.slice(1), { detached: true, stdio: "ignore", windowsHide: true, env: Object.assign({}, process.env, extraEnv || {}) })
    child.on("error", () => {})
    child.unref()
    return true
  } catch (e) {
    return false
  }
}

// ---- The morning run ---------------------------------------------------------------

function xmlEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// launchd runs a missed calendar job when the Mac next wakes, so an edition
// due while the lid was shut arrives on opening it.
function launchdPlist(node, script, hour, logDir) {
  const argv = (script ? [node, script, "morning"] : [node, "morning"])
  const args = argv.map(a => "    <string>" + xmlEsc(a) + "</string>").join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${APP_ID}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${Number(hour)}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEsc(path.posix.join(logDir, "morning.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEsc(path.posix.join(logDir, "morning.log"))}</string>
</dict>
</plist>
`
}

function launchdPath(homeDir) {
  return path.posix.join(homeDir || home(), "Library/LaunchAgents", APP_ID + ".plist")
}

// Homebrew runs node from /opt/homebrew/Cellar/node/<version>/bin/node. That
// path is deleted by the next `brew upgrade node`, so a scheduled job should
// use the stable prefix/bin/node symlink instead.
function stableNode(execPath) {
  const m = String(execPath).match(/^(.*)\/Cellar\/[^/]+\/[^/]+\/bin\/node$/)
  return m ? path.posix.join(m[1], "bin", "node") : execPath
}

// The same applies to the package itself: its Cellar path changes on
// `brew upgrade inkwell-daily`, while prefix/bin/inkwell-daily is relinked.
function stableScript(script) {
  const m = String(script).match(/^(.*)\/Cellar\/inkwell-daily\/[^/]+\/libexec\/bin\/inkwell-daily\.js$/)
  return m ? path.posix.join(m[1], "bin", "inkwell-daily") : script
}

// Task Scheduler: daily at the hour, at logon, and as soon as possible after
// a missed start. The morning command itself skips a day already set.
function taskXml(node, script, hour) {
  const h = String(hour).padStart(2, "0")
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Sets yesterday's Inkwell.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger><StartBoundary>2026-01-01T${h}:00:00</StartBoundary><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
    <LogonTrigger><Delay>PT2M</Delay></LogonTrigger>
  </Triggers>
  <Settings>
    <StartWhenAvailable>true</StartWhenAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  </Settings>
  <Actions>
    <Exec><Command>${xmlEsc(node)}</Command><Arguments>${xmlEsc(script ? '"' + script + '" morning' : "morning")}</Arguments></Exec>
  </Actions>
</Task>
`
}

module.exports = {
  APP_ID, TASK_NAME, DEFAULTS, home, run, dataDir, configFile, readConfig, fullName, wallpaper, darkMode, palette, disk,
  hasCommand, curlCommand, openCommand, toastCommand, spawnDetached, launchdPlist, launchdPath, stableNode, stableScript, taskXml
}
