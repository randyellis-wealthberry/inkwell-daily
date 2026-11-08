# Inkwell Daily for macOS and Windows

A morning newspaper about yesterday on your machine. It's set from what actually happened: the Claude Code and Codex sessions you ran, the commits that landed in the repos you worked in, and the weather. It's laid over your own desktop picture, in light or dark to match your system, as one page you open in your browser over coffee.

Inkwell Daily is the desktop port of the [Omarchy plugin](https://github.com/wealthberrylabs/omarchy-daily-plugin). The builder is the same; the Omarchy bar, panel and sibling widgets (Elevation, Easel, Munger, Kickoff, Isobar, Carrel) aren't here, so their sections stay out of the page.

## What's on the page

- **The front page.** Yesterday's agent work, ranked by what came of it (commits, files edited, artifacts published), with the prompts you typed quoted.
- **The meter and the repo desk.** Prompts per agent, and short briefs on each repo's latest commits.
- **Weather.** Yesterday from Open-Meteo, with an hourly line, rain, wind, sunrise and sunset, and a two-day outlook.
- **Your week in agents.** Prompts typed per day for the last seven days.
- **The usage line.** A 14-day line of tokens — or prompts when there are no tokens — with a forecast for tomorrow and a plain-language blurb.
- **Your inkwell habit.** A five-week ledger of the mornings you opened the paper, with the run, the best run, and the month's count. Opening an edition with `inkwell-daily open` marks the morning; the next edition shows it.
- **The perks.** Milestone themes unlocked by the mornings you've opened the paper: First Light at 3, Sunday Paper at 7, Nocturne at 14, Sepia at 30, Gilt at 60, Century at 100. Themes stay unlocked; Auto-advance uses your newest earned theme, and Auto follows your Mac's light or dark.
- **The Pro preview.** Until Inkwell Pro is installed, the paper carries one “The Pro desks” standing feature after the front: five honest teasers for Gmail, Slack, Notion, Google Calendar and Basecamp, with an inactive **Open the desks with Pro** button and a **Coming soon** status. The button carries the `data-paywall="inkwell-daily-pro"` marker.
- **The model desk.** Yesterday's models and the month to date, ranked by tokens, with a price: OpenCode's own cost where it records one, otherwise estimated at published list prices. It reads Claude Code and Codex token counts, and OpenCode's own model, token and cost records. Any model and provider can appear.
- **The integration library.** With Inkwell Pro installed, the paper carries an **Integrations** button beside **All editions**. It opens a card library of the 25 most popular Composio integrations, each marked **Enabled** or **Not enabled**, with a link back to the paper.
- **The Code Desk and The Shelf.** When GitHub, Linear or Google Drive is connected, the paper prints a fold for what is waiting: assigned issues and review work, or the files touched yesterday. A fold appears only when its reader has something to say; a quiet connection still shows as a card in **The wires**.
- **The back page.** A jumble made from the day's names, an almanac (theme, wallpaper, free disk), and classifieds made of real loose ends: uncommitted changes, an expired `gh` sign-in.
- **Back issues, the Sunday magazine, corrections, the late-edition seal, the reading time and your streak**, all as in the original.

## Requirements

- Node.js 20 or later — only when installing with npm or from this checkout.
  The one-line installer and the Homebrew formula install it for you, and the
  downloadable standalone build needs no Node at all.
- macOS 14 or later for the menu bar app. The command itself runs on older
  macOS, Windows and Linux.
- `git`
- `curl` (built into macOS, and into Windows 10 1803 and later as `curl.exe`)
- Optional: ImageMagick (`magick`) for smaller photos. On a Mac, the built-in `sips` is used instead. Without either, the desktop picture goes in at full size if it's under 6 MB.
- Optional: the [Claude Code](https://claude.com/claude-code) CLI, only for the `prose` and `web` settings
- Optional: SQLite's `sqlite3` on your PATH, only to read OpenCode's history for the model desk. macOS ships it; without it the desk still reports Claude Code and Codex.

## Install

Pick the one that matches your machine. Every path ends with the same command
on your PATH and a morning run registered.

### macOS, one line

```bash
curl -fsSL https://raw.githubusercontent.com/randyellis-wealthberry/inkwell-daily/main/scripts/install.sh | sh
```

The script checks for Node.js 20 or later (and installs it with Homebrew if
it's missing), installs Inkwell Daily, schedules the 5am run, and opens the
first edition. To choose another hour or skip the browser:

```bash
curl -fsSL https://raw.githubusercontent.com/randyellis-wealthberry/inkwell-daily/main/scripts/install.sh | sh -s -- --hour 7 --no-open
```

Options: `--hour H`, `--no-open`, `--no-schedule`, `--version V`,
`--uninstall`.

### Homebrew

```bash
brew install randyellis-wealthberry/tap/inkwell-daily
inkwell-daily install        # the morning run, at 5 by default
inkwell-daily build          # today's edition, about yesterday, now
inkwell-daily open
```

If Homebrew refuses the third-party tap, trust it once first:

```bash
brew trust randyellis-wealthberry/tap
```

Homebrew installs Node for you, so npm is never involved. Upgrades and removal
go through `brew upgrade` / `brew uninstall`.

### npm

```bash
npm install -g inkwell-daily
inkwell-daily install
inkwell-daily build
inkwell-daily open
```

Requires Node.js 20 or later.

### Download, no Node needed

The [Releases](https://github.com/randyellis-wealthberry/inkwell-daily/releases)
page carries a self-contained macOS build:

- **InkwellDaily-x.y.z-macos-arm64.pkg** (or **-x64.pkg**, and the same as
  **.dmg**) — double-click, then allow it in System Settings → Privacy &
  Security if macOS warns that it's from an unidentified developer. It puts
  `inkwell-daily` in `/usr/local/bin`, sets the morning run for the person
  logged in, and opens the first edition.
- **inkwell-daily-macos-arm64.tar.gz** / **-x64.tar.gz** — the same executable
  without the installer; put it anywhere on your PATH after unpacking.

The downloadable builds are unsigned until the project has an Apple Developer
ID certificate, so expect that one-time Gatekeeper step.

### Windows

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/randyellis-wealthberry/inkwell-daily/main/scripts/install.ps1 | iex"
```

Checks for Node.js 20 (installing the LTS with winget if needed), installs the
command, schedules the morning run, and sets the first edition. Set
`$env:INKWELL_HOUR` before running to pick another hour, or
`$env:INKWELL_NO_OPEN = "1"` to keep the browser closed.

### From this checkout

```bash
git clone https://github.com/randyellis-wealthberry/inkwell-daily.git
cd inkwell-daily
npm install -g .
inkwell-daily install
inkwell-daily build
inkwell-daily open
```

`install` registers the morning run:

- **macOS.** A launchd agent at `~/Library/LaunchAgents/com.wealthberrylabs.inkwell-daily.plist`. If your Mac was asleep at the hour, it runs when the Mac wakes.
- **Windows.** A Task Scheduler task named `InkwellDaily`. It runs daily at the hour, at sign-in, and as soon as it can after a missed start.

The morning run sets today's edition once — dated today, reporting yesterday — shows a notification and, with `web` on, publishes it. Later runs that day do nothing. To pick another hour, run `inkwell-daily install --hour 7`.

`inkwell-daily uninstall` removes the schedule. Your editions stay where they are.

## Menu bar

The macOS `.pkg` installs a native menu bar app alongside the command. It
shows the newest edition and headline, opens today's paper, sets yesterday's
edition on demand, changes the theme, and has Settings and Launch at Login.

If your Mac hides the menu bar automatically, move the pointer to the top of
the screen to see it. The app is also attached to each release as
`InkwellDaily-menubar-macos-arm64.zip` or `-x64.zip`, and it requires macOS 14
or later. Homebrew installs the command only; use the `.pkg` or the zip for
the menu bar app.

## Commands

| Command | What it does |
| --- | --- |
| `inkwell-daily build [--date YYYY-MM-DD] [--prose] [--offline]` | Set an edition dated today, reporting yesterday. `--date` picks the cover date |
| `inkwell-daily open [YYYY-MM-DD]` | Read the newest edition, or that day's, in your browser |
| `inkwell-daily index` | Every edition |
| `inkwell-daily status` | `{"latest":…,"unread":…,"run":…,"checkedToday":…,"web":…}` |
| `inkwell-daily theme [id]` | The milestone themes you've unlocked; set one, `auto`, or `milestone` for auto-advance |
| `inkwell-daily font [id]` | List or set the paper's Google Font pairing |
| `inkwell-daily trend [--days N] [--date D] [--json]` | Tokens and prompts per day, with a forecast |
| `inkwell-daily publish [--dry-run]` | Put the newest edition on claude.ai |
| `inkwell-daily web` | The claude.ai link |
| `inkwell-daily config` | Where the settings file is, and what's in it |
| `inkwell-daily sources` | The plugin sources that will report |

## Settings

`config.json`, in the data folder (`inkwell-daily config` prints its path):

```json
{
  "hour": 5,
  "notify": true,
  "prose": false,
  "web": false,
  "theme": "milestone",
  "font": "inkwell",
  "repos": ["~/code/my-app"],
  "latitude": 51.51,
  "longitude": -0.13,
  "place": "London",
  "units": "auto"
}
```

| Setting | Default | Description |
| --- | --- | --- |
| `hour` | `5` | The hour the morning run sets today's edition. `install` writes it here too |
| `notify` | `true` | A notification when the paper arrives |
| `prose` | `false` | Asks Claude Code (`claude -p`, no tools) to rewrite the headlines from the facts. Numbers it adds that aren't in the facts are dropped |
| `web` | `false` | Publishes each edition to one private claude.ai link |
| `theme` | `milestone` | `milestone` (auto-advance to the newest earned theme), `auto`, or an unlocked milestone theme (`firstlight`, `sunday`, `nocturne`, `sepia`, `gilt`, `century`) |
| `font` | `inkwell` | A free Google Font pairing: `inkwell`, `broadsheet`, `gazette`, `modern`, `bodoni`, `weekend`, `literary` |
| `repos` | `[]` | Extra git repositories for the repo desk. Every repo an agent session ran in that week is included anyway |
| `latitude`, `longitude`, `place` | not set | Where the weather is for. Without them, wttr.in guesses from your IP address |
| `units` | `auto` | `metric`, `imperial`, or `auto` from your locale |

Only commits under each repo's own `git config user.email` count as yours.

### Perks

Opening the paper is the whole requirement. Every morning in the read ledger counts toward the next theme, and a theme is kept once earned, even if the run breaks.

```bash
inkwell-daily theme          # what's unlocked and what's next
inkwell-daily theme sunday   # use one; the next edition picks it up
inkwell-daily theme auto     # back to your Mac's light or dark
```

| Theme | Mornings to unlock |
| --- | --- |
| Auto | always |
| First Light | 3 |
| Sunday Paper | 7 |
| Nocturne | 14 |
| Sepia | 30 |
| Gilt | 60 |
| Century | 100 |

The command takes a name or an id (`sunday`, `Sunday Paper`, `sunday-paper`). Setting a theme you haven't earned is refused with the number of mornings still to go.

### Fonts

The paper's type is chosen with `font` in `config.json` or the `font` command. All seven pairings are free Google Fonts; the page loads only the chosen families and falls back to Georgia or your system's monospace if they can't be fetched.

| Pairing | Masthead | Body | Mono |
| --- | --- | --- | --- |
| `inkwell` | UnifrakturCook | Newsreader | JetBrains Mono |
| `broadsheet` | Playfair Display | Source Serif 4 | IBM Plex Mono |
| `gazette` | UnifrakturCook | Crimson Pro | Courier Prime |
| `modern` | DM Serif Display | Inter | JetBrains Mono |
| `bodoni` | Bodoni Moda | Lora | Space Mono |
| `weekend` | Abril Fatface | Lora | DM Mono |
| `literary` | Cormorant Garamond | EB Garamond | Inconsolata |

```bash
inkwell-daily font              # list the pairings
inkwell-daily font broadsheet   # set the next edition's type
inkwell-daily font inkwell      # the default blackletter masthead
```

Fonts and themes are independent: any pairing works with any palette.

### The paper on the web

This works as in the Omarchy version. A short background Claude Code session (`claude --bg`) gets only Read (inside the web copy's folder), Write (only on `web/link.txt`) and Artifact, in `dontAsk` mode. Before the first publish, run `claude` once in the data folder and accept the trust prompt. On Windows, use the native Claude Code install (`claude.exe`).

## Inkwell Pro

The free paper covers your agent logs, git and the weather. **Inkwell Pro** adds desks for the rest of your day: your mail first, then Slack, Notion, Google Calendar and Basecamp. Each one reads your own accounts through [Composio](https://composio.dev), and only through read-only tools: the session it runs in can fetch, list and search, and nothing else.

```bash
npm install -g <the Inkwell Pro package you're sent>
inkwell-pro activate <your license key> --url <your desks service>
inkwell-daily sources      # gmail  Gmail  (inkwell-pro)
```

The Composio project key never travels in the package — a published package is readable, so a key inside it would be everyone's key. It is held by a small desks service; the plugin keeps only your license key and that service's URL, and the service gives every license its own Composio identity. `server/README.md` in this repo is that service; `pro/README.md` is the plugin.

Turn a desk off in `config.json` with `"sources": { "gmail": { "enabled": false } }`.

Until Pro is installed, the free paper prints one “The Pro desks” preview after the front: five honest teasers for Gmail, Slack, Notion, Google Calendar and Basecamp, with an inactive **Open the desks with Pro** button and a **Coming soon** status. The button carries the `data-paywall="inkwell-daily-pro"` marker for the key desk that will follow.

### Writing your own source

Inkwell Pro uses the same plugin interface anyone can. List a package name or an absolute path in `config.json`'s `"plugins"`, and export:

```js
module.exports = {
  sources: [{
    id: "standup",
    name: "Standup",
    async collect({ key, from, to, net, config, dataDir }) {
      return {
        sections: [{ kicker: "Standup", headline: "3 blockers raised", deck: "", items: [{ time: "9:30 am", title: "Ada", detail: "Waiting on the API key", tag: "Blocked" }] }],
        meter: [{ label: "Blockers", value: "3" }],
        classifieds: [{ kind: "WANTED", text: "An API key for Ada." }]
      }
    }
  }]
}
```

Everything a source returns is treated as untrusted: it's cut to size, kept to plain strings and escaped on the page. A source that throws becomes a note in its own section, never a failed paper. Its headlines and items are added to the facts that `prose` is checked against.

## Data

| | macOS | Windows |
| --- | --- | --- |
| Editions, index, settings, web copy, read ledger, price cache | `~/Library/Application Support/InkwellDaily` | `%LOCALAPPDATA%\InkwellDaily` |
| Morning run log | same folder, `morning.log` | Task Scheduler history |

It reads, but never writes: `~/.claude/projects`, `~/.codex/sessions`, `~/.local/share/opencode/opencode.db` (read-only, for the model desk), the git logs of your repos, and your wallpaper and dark-mode setting.

On macOS, everything the paper writes is readable only by you (folders 0700, files 0600). On Windows it lives under your own profile, which other standard users can't read.

## Privacy

The editions quote your prompts and commit subjects, so treat the data folder as you would your shell history. The read ledger (`reads.json`) keeps only the days you opened the paper, never what you read. The builder only goes to the network for public data: Open-Meteo, wttr.in when no place is set, and models.dev for prices when neither Inkwell nor OpenCode already has them. `--offline` keeps it entirely local. The page loads its typefaces from Google Fonts. With `prose` or `web` on, the edition's facts or the whole page go to Claude.

That network list is the free paper. With a Pro desk on, that account's content — mail, messages, pages, events, to-dos — leaves the machine for your desks service and Composio, which is a different promise. `--offline`, or a desk left off, is the way to keep it local.

The model desk reads only model ids, token counts and costs from your agents' records; it never keeps their message text. OpenCode's recorded cost is used where it has one; the rest are list prices, so a subscription or a discount won't show in those estimates.

## Status

[![test](https://github.com/randyellis-wealthberry/inkwell-daily/actions/workflows/test.yml/badge.svg)](https://github.com/randyellis-wealthberry/inkwell-daily/actions/workflows/test.yml)

Every push is tested on macOS, Windows and Ubuntu, on Node 20 and 22. On each, CI runs the unit tests, builds an edition offline, checks the data folder is where that OS keeps it, and runs `status`, `latest`, `config` and `publish --dry-run`. On macOS and Windows it also installs and uninstalls the morning schedule (launchd and Task Scheduler).

Not covered by CI yet, because the runners have no desktop session or Claude login: notifications, the wallpaper and dark-mode lookup, your display name, and publishing to claude.ai. Those need a try on a real Mac and PC.

## Tests

```bash
npm test
```

## Building a release

```bash
npm run menubar:open  # build and install the menu bar app in /Applications
npm run menubar       # dist/macos/Inkwell Daily.app
npm run bundle        # dist/standalone/inkwell-daily, no Node needed at runtime
npm run pkg           # .pkg, .dmg, and InkwellDaily-menubar-<arch>.zip
```

`npm run pkg` needs macOS and builds for the machine's CPU; it builds the
standalone command and the menu bar app first. On a machine with no Apple
Developer ID certificate the package is unsigned; set
`SIGN_IDENTITY="Developer ID Installer: …"` to sign it, then notarize with
`notarytool` and staple the ticket. Set `APP_SIGN_IDENTITY="Developer ID
Application: …"` to sign the app bundle.

The GitHub release workflow builds the standalone binaries for macOS (arm64
and x64), Windows and Linux, publishes the npm package through trusted
publishing (OIDC), and attaches the `.pkg`/`.dmg` and the menu bar app zip.

The app icon lives in `menubar/Icon/AppIcon.icon`; edit it in Icon Composer,
then run `npm run icon` and `menubar/tools/icon_review.sh`. The menu bar mark
is drawn in `menubar/Sources/InkwellDaily/InkwellGlyph.swift`.

The Homebrew formula is generated and pushed separately; see
`packaging/homebrew/README.md` and `scripts/update-tap.sh`.

To ship a version, tag it and push the tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release workflow runs the tests, builds and attaches the standalone
archives and the macOS installers, publishes to npm through trusted
publishing (OIDC, configured for `release.yml`), and updates the Homebrew tap
when `HOMEBREW_TAP_TOKEN` is set.

## License

MIT
