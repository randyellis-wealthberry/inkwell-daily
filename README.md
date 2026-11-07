# Inkwell Daily for macOS and Windows

A morning newspaper about yesterday on your machine. It's set from what actually happened: the Claude Code and Codex sessions you ran, the commits that landed in the repos you worked in, and the weather. It's laid over your own desktop picture, in light or dark to match your system, as one page you open in your browser over coffee.

Inkwell Daily is the desktop port of the [Omarchy plugin](https://github.com/wealthberrylabs/omarchy-daily-plugin). The builder is the same; the Omarchy bar, panel and sibling widgets (Elevation, Easel, Munger, Kickoff, Isobar, Carrel) aren't here, so their sections stay out of the page.

## What's on the page

- **The front page.** Yesterday's agent work, ranked by what came of it (commits, files edited, artifacts published), with the prompts you typed quoted.
- **The meter and the repo desk.** Prompts per agent, and short briefs on each repo's latest commits.
- **Weather.** Yesterday from Open-Meteo, with an hourly line, rain, wind, sunrise and sunset, and a two-day outlook.
- **Your week in agents.** Prompts typed per day for the last seven days.
- **Your inkwell habit.** A five-week ledger of the mornings you opened the paper, with the run, the best run, and the month's count. Opening an edition with `inkwell-daily open` marks the morning; the next edition shows it.
- **The perks.** Milestone themes unlocked by the mornings you've opened the paper: First Light at 3, Sunday Paper at 7, Nocturne at 14, Sepia at 30, Gilt at 60, Century at 100. Themes stay unlocked; Auto follows your Mac's light or dark.
- **The model desk.** Yesterday's models and the month to date, ranked by tokens, with a price: OpenCode's own cost where it records one, otherwise estimated at published list prices. It reads Claude Code and Codex token counts, and OpenCode's own model, token and cost records. Any model and provider can appear.
- **The back page.** A jumble made from the day's names, an almanac (theme, wallpaper, free disk), and classifieds made of real loose ends: uncommitted changes, an expired `gh` sign-in.
- **Back issues, the Sunday magazine, corrections, the late-edition seal, the reading time and your streak**, all as in the original.

## Requirements

- Node.js 20 or later
- `git`
- `curl` (built into macOS, and into Windows 10 1803 and later as `curl.exe`)
- Optional: ImageMagick (`magick`) for smaller photos. On a Mac, the built-in `sips` is used instead. Without either, the desktop picture goes in at full size if it's under 6 MB.
- Optional: the [Claude Code](https://claude.com/claude-code) CLI, only for the `prose` and `web` settings
- Optional: SQLite's `sqlite3` on your PATH, only to read OpenCode's history for the model desk. macOS ships it; without it the desk still reports Claude Code and Codex.

## Install

```bash
git clone https://github.com/randyellis-wealthberry/inkwell-daily.git
cd inkwell-daily
npm install -g .          # puts `inkwell-daily` on your PATH
inkwell-daily install     # set the paper every morning at 5
inkwell-daily build       # set yesterday's edition now
inkwell-daily open
```

`install` registers the morning run:

- **macOS.** A launchd agent at `~/Library/LaunchAgents/com.wealthberrylabs.inkwell-daily.plist`. If your Mac was asleep at the hour, it runs when the Mac wakes.
- **Windows.** A Task Scheduler task named `InkwellDaily`. It runs daily at the hour, at sign-in, and as soon as it can after a missed start.

The morning run sets yesterday's edition once, shows a notification and, with `web` on, publishes it. Later runs that day do nothing. To pick another hour, run `inkwell-daily install --hour 7`.

`inkwell-daily uninstall` removes the schedule. Your editions stay where they are.

## Commands

| Command | What it does |
| --- | --- |
| `inkwell-daily build [--date YYYY-MM-DD] [--prose] [--offline]` | Set an edition (yesterday's by default) |
| `inkwell-daily open [YYYY-MM-DD]` | Read the newest edition, or that day's, in your browser |
| `inkwell-daily index` | Every edition |
| `inkwell-daily status` | `{"latest":…,"unread":…,"run":…,"checkedToday":…,"web":…}` |
| `inkwell-daily theme [id]` | The milestone themes you've unlocked; set one for the next edition |
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
  "theme": "auto",
  "repos": ["~/code/my-app"],
  "latitude": 51.51,
  "longitude": -0.13,
  "place": "London",
  "units": "auto"
}
```

| Setting | Default | Description |
| --- | --- | --- |
| `hour` | `5` | The hour the morning run sets yesterday's edition. `install` writes it here too |
| `notify` | `true` | A notification when the paper arrives |
| `prose` | `false` | Asks Claude Code (`claude -p`, no tools) to rewrite the headlines from the facts. Numbers it adds that aren't in the facts are dropped |
| `web` | `false` | Publishes each edition to one private claude.ai link |
| `theme` | `auto` | `auto`, or an unlocked milestone theme (`firstlight`, `sunday`, `nocturne`, `sepia`, `gilt`, `century`) |
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

### The paper on the web

This works as in the Omarchy version. A short background Claude Code session (`claude --bg`) gets only Read (inside the web copy's folder), Write (only on `web/link.txt`) and Artifact, in `dontAsk` mode. Before the first publish, run `claude` once in the data folder and accept the trust prompt. On Windows, use the native Claude Code install (`claude.exe`).

## Inkwell Pro

The free paper covers your agent logs, git and the weather. **Inkwell Pro** adds desks for the rest of your day: your mail first, then Slack, Notion and Basecamp. Each one is read through your own claude.ai connectors by a Claude Code session that can only read: it can search and open, and nothing else.

```bash
npm install -g <the Inkwell Pro package you're sent>
inkwell-pro activate <your license key>
inkwell-daily sources      # gmail  Gmail  (inkwell-pro)
```

Turn a desk off in `config.json` with `"sources": { "gmail": { "enabled": false } }`.

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

The model desk reads only model ids, token counts and costs from your agents' records; it never keeps their message text. OpenCode's recorded cost is used where it has one; the rest are list prices, so a subscription or a discount won't show in those estimates.

## Status

[![test](https://github.com/randyellis-wealthberry/inkwell-daily/actions/workflows/test.yml/badge.svg)](https://github.com/randyellis-wealthberry/inkwell-daily/actions/workflows/test.yml)

Every push is tested on macOS, Windows and Ubuntu, on Node 20 and 22. On each, CI runs the unit tests, builds an edition offline, checks the data folder is where that OS keeps it, and runs `status`, `latest`, `config` and `publish --dry-run`. On macOS and Windows it also installs and uninstalls the morning schedule (launchd and Task Scheduler).

Not covered by CI yet, because the runners have no desktop session or Claude login: notifications, the wallpaper and dark-mode lookup, your display name, and publishing to claude.ai. Those need a try on a real Mac and PC.

## Tests

```bash
npm test
```

## License

MIT
