# Inkwell Daily for macOS and Windows

A morning newspaper about yesterday on your machine. It's set from what actually happened: the Claude Code and Codex sessions you ran, the commits that landed in the repos you worked in, and the weather. It's laid over your own desktop picture, in light or dark to match your system, as one page you open in your browser over coffee.

Inkwell Daily is the desktop port of the [Omarchy plugin](https://github.com/wealthberrylabs/omarchy-daily-plugin). The builder is the same; the Omarchy bar, panel and sibling widgets (Elevation, Easel, Munger, Kickoff, Isobar, Carrel) aren't here, so their sections stay out of the page.

## What's on the page

- **The front page.** Yesterday's agent work, ranked by what came of it (commits, files edited, artifacts published), with the prompts you typed quoted.
- **The meter and the repo desk.** Prompts per agent, and short briefs on each repo's latest commits.
- **Weather.** Yesterday from Open-Meteo, with an hourly line, rain, wind, sunrise and sunset, and a two-day outlook.
- **Your week in agents.** Prompts typed per day for the last seven days.
- **The back page.** A jumble made from the day's names, an almanac (theme, wallpaper, free disk), and classifieds made of real loose ends: uncommitted changes, an expired `gh` sign-in.
- **Back issues, the Sunday magazine, corrections, the late-edition seal, the reading time and your streak**, all as in the original.

## Requirements

- Node.js 20 or later
- `git`
- `curl` (built into macOS, and into Windows 10 1803 and later as `curl.exe`)
- Optional: ImageMagick (`magick`) for smaller photos. On a Mac, the built-in `sips` is used instead. Without either, the desktop picture goes in at full size if it's under 6 MB.
- Optional: the [Claude Code](https://claude.com/claude-code) CLI, only for the `prose` and `web` settings

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
| `inkwell-daily status` | `{"latest":…,"unread":…,"web":…}` |
| `inkwell-daily publish [--dry-run]` | Put the newest edition on claude.ai |
| `inkwell-daily web` | The claude.ai link |
| `inkwell-daily config` | Where the settings file is, and what's in it |

## Settings

`config.json`, in the data folder (`inkwell-daily config` prints its path):

```json
{
  "hour": 5,
  "notify": true,
  "prose": false,
  "web": false,
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
| `repos` | `[]` | Extra git repositories for the repo desk. Every repo an agent session ran in that week is included anyway |
| `latitude`, `longitude`, `place` | not set | Where the weather is for. Without them, wttr.in guesses from your IP address |
| `units` | `auto` | `metric`, `imperial`, or `auto` from your locale |

Only commits under each repo's own `git config user.email` count as yours.

### The paper on the web

This works as in the Omarchy version. A short background Claude Code session (`claude --bg`) gets only Read (inside the web copy's folder), Write (only on `web/link.txt`) and Artifact, in `dontAsk` mode. Before the first publish, run `claude` once in the data folder and accept the trust prompt. On Windows, use the native Claude Code install (`claude.exe`).

## Data

| | macOS | Windows |
| --- | --- | --- |
| Editions, index, settings, web copy | `~/Library/Application Support/InkwellDaily` | `%LOCALAPPDATA%\InkwellDaily` |
| Morning run log | same folder, `morning.log` | Task Scheduler history |

It reads, but never writes: `~/.claude/projects`, `~/.codex/sessions`, the git logs of your repos, and your wallpaper and dark-mode setting.

On macOS, everything the paper writes is readable only by you (folders 0700, files 0600). On Windows it lives under your own profile, which other standard users can't read.

## Privacy

The editions quote your prompts and commit subjects, so treat the data folder as you would your shell history. The builder only goes to the network for public data: Open-Meteo, and wttr.in when no place is set. `--offline` keeps it entirely local. The page loads its typefaces from Google Fonts. With `prose` or `web` on, the edition's facts or the whole page go to Claude.

## Status

This is a port. The builder, scheduler files and settings are covered by `npm test` on Linux. The macOS and Windows parts (launchd, Task Scheduler, notifications, wallpaper and name lookup) haven't run on real hardware yet.

## Tests

```bash
npm test
```

## License

MIT
