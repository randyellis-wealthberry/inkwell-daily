# inkwell-pro

The five Pro desks for Inkwell Daily: mail, city, notebook, daybook and project.

This package is thin on purpose. It sends one GET per desk to the desks service, which holds the Composio project key and reads your own Gmail, Slack, Notion, Google Calendar and Basecamp accounts. Nothing here knows a toolkit slug, a tool slug or an OAuth scope, so a provider change never needs a new release of this package.

It plugs into the free paper through the same interface anyone can use: `module.exports = { sources: [...] }`, listed in `config.json`'s `"plugins"`. `inkwell-daily` loads it automatically by name.

## Install and activate

```bash
npm install -g inkwell-pro
inkwell-pro activate <your license key> --url https://your-desks-host
inkwell-daily sources        # gmail  Gmail  (inkwell-pro)
```

`activate` writes two things to `pro.json` beside the editions — the license and the URL — with mode `0600`:

| | macOS | Windows |
| --- | --- | --- |
| `pro.json` | `~/Library/Application Support/InkwellDaily` | `%LOCALAPPDATA%\InkwellDaily` |

The URL must be **https**. Plain http is accepted only for `127.0.0.1` and `localhost`, so a local service is easy to run and a remote one cannot put your license and your mail on the wire.

For CI or a test harness, `INKWELL_PRO_LICENSE` and `INKWELL_PRO_API` are read instead. They are not a supported place for a real license.

## What each desk shows

| Desk | Source | Reads | Window |
| --- | --- | --- | --- |
| front's mail | `gmail` | Arrivals, unread count, senders and subjects | The 24 hours before the edition |
| city | `slack` | Messages across your rooms, busiest room, questions | The 24 hours before the edition |
| notebook | `notion` | Pages touched, most recent first | The paper's week |
| daybook | `calendar` | The day's meetings, first up, places | The edition's day |
| project | `basecamp` | Your assignments, late ones first | Everything assigned to you |

Turn one off in `config.json` without uninstalling:

```json
{ "sources": { "slack": { "enabled": false } } }
```

And point at a different service without re-activating:

```json
{ "sources": { "gmail": { "url": "http://localhost:8787" } } }
```

## States

A desk is never a failed paper. Each one reports:

- `open` — something to print.
- `empty` — connected, and there was nothing. Prints as "A quiet box", "No traffic", and so on.
- `closed` — not set up, or the license was refused. Carries a Connect Link when the service could make one.
- `expired` — the provider's token was revoked. Carries a Reconnect Link.
- `offline` — `--offline` was used, or the service could not be reached. No request is made at all when the edition is offline.

## Privacy

With a desk on, that account's content leaves your machine and passes through the desks service and Composio. The free paper's "the builder only goes to the network for public data" line is about the free paper; it stops being true here. Use `--offline`, or leave a desk off, if that is not what you want.

The license is the only credential this package holds. There is no Composio key here to leak.

## Tests

```bash
cd pro && npm test
```

The tests start a stub HTTP server and assert what the plugin sends, and that every failure becomes a state rather than a thrown error.
