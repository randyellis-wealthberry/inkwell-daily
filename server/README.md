# The desks service

Inkwell Pro's five desks, read through [Composio](https://composio.dev) and returned already shaped for the paper.

```
inkwell-daily  →  inkwell-pro  →  this service  →  Composio  →  Gmail, Slack,…
   (paper)        (plugin)        (holds the key)   (sessions)    (the user's own accounts)
```

The Composio project key lives here and nowhere else. A published npm package is readable, so shipping the key inside `inkwell-pro` would hand it to every customer and put every mailbox in one project. The plugin gets a license key and a URL; this service gets the key.

Needs Node **22.22.3** or later — that is `@composio/core`'s own floor, and it is why this package is ESM. The free paper still runs on Node 20; only the service needs the newer runtime.

## Run it

```bash
cd server
cp .env.example .env          # then edit it
node scripts/new-license.mjs  # print a key for INKWELL_LICENSES
npm install
node --env-file=.env index.js # Node 20.6+; or export the vars yourself
```

Check it:

```bash
curl -s localhost:8787/health
export LICENSE=...            # the key you put in INKWELL_LICENSES
curl -s -H "Authorization: Bearer $LICENSE" localhost:8787/status
```

`/status` says `{"ok":true,"connected":false,"status":"missing"}` until Gmail is authorized. Ask for a Connect Link:

```bash
curl -s -X POST -H "Authorization: Bearer $LICENSE" \
  -H "content-type: application/json" -d '{"toolkit":"gmail"}' \
  localhost:8787/connect
```

Open the `url` it returns, finish the provider's consent screen, then ask `/status` again. The Pro sheet in the menu bar app does exactly these two calls.

A desk, once connected:

```bash
curl -s -H "Authorization: Bearer $LICENSE" \
  "localhost:8787/desk/gmail?to=2026-11-07&tz=Europe/London" | jq
```

## Routes

| Route | Answer |
| --- | --- |
| `GET /health` | `{ ok: true }`. No license. For a load balancer. |
| `GET /status` | `{ ok, connected, status }`. `status` is `missing`, `ACTIVE`, or `error` with an `error` string. `?toolkit=` defaults to `gmail`. |
| `POST /connect` | `{ ok, url }`. Body `{ "toolkit": "gmail" }`. The `url` is Composio's Connect Link. |
| `GET /connect?t=` | No license. Verifies a signed token from an integrations card, then redirects to Composio. |
| `GET /desk/:id` | One desk, shaped. `id` is `gmail`, `slack`, `notion`, `calendar` or `basecamp`. |
| `GET /integrations` | `{ ok, integrations, total, connected }`. The 25 most popular Composio toolkits, each with `connected`. |
| `?to=YYYY-MM-DD` | The edition's date. Defaults to today (UTC). |
| `?from=YYYY-MM-DD` | The start of the desk's window. Notion uses it; the rest fix their own. |
| `?tz=Area/City` | How times are printed. The plugin sends the reader's zone. |

`/status` and `/connect` are the contract `menubar/Sources/InkwellCore/HostedDeskClient.swift` already speaks, and `server/test/router.test.js` mirrors the Swift tests. Change one and change the other.

Every desk answers with the shape `inkwell-daily`'s `lib/sources.js` already cleans:

```json
{
  "state": "open | empty | expired | offline | error | closed",
  "note": "why, when it is not open",
  "action": { "label": "Connect Gmail", "href": "https://…" },
  "sections": [{ "kicker": "", "headline": "", "deck": "", "items": [{ "time": "", "title": "", "detail": "", "tag": "" }] }],
  "meter": [{ "label": "Unread", "value": "4" }],
  "classifieds": [{ "kind": "NOTICE", "text": "" }]
}
```

A `closed` or `expired` desk carries an `action` whose `href` is Composio's own Connect Link. The plugin's `safeHref` only lets `https://` and `inkwell-daily://` through, so nothing else can be clicked from a desk.

## What the session may do

One Composio session per license, reused for ten minutes, narrowed to five toolkits and, inside each, to one read-only tool:

| Desk | Toolkit | Tool | Docs |
| --- | --- | --- | --- |
| mail | `gmail` | `GMAIL_FETCH_EMAILS` | [gmail](https://docs.composio.dev/toolkits/gmail) |
| daybook | `googlecalendar` | `GOOGLECALENDAR_EVENTS_LIST` | [googlecalendar](https://docs.composio.dev/toolkits/googlecalendar) |
| city | `slack` | `SLACK_SEARCH_MESSAGES` | [slack](https://docs.composio.dev/toolkits/slack) |
| notebook | `notion` | `NOTION_SEARCH_NOTION_PAGE` | [notion](https://docs.composio.dev/toolkits/notion) |
| project | `basecamp` | `BASECAMP_GET_MY_ASSIGNMENTS` | [basecamp](https://docs.composio.dev/toolkits/basecamp) |

Three further limits, in `lib/composio.js`:

- `toolkits.enable` lists only those five, so no other app is reachable.
- `tools.<toolkit>.enable` lists one slug, so no send, no delete, no create.
- `tags.disable: ["destructiveHint"]` blocks deleting tools outright.

The sandbox is off: it runs arbitrary code and sits outside Composio's zero-data-retention coverage. A newspaper does not need it. Add tools to a desk by adding the slug to both the enable list and `lib/desks.js`, and check the toolkit page first — slugs are not guessable.

### Scopes

The allowlist above keeps *us* from calling a writing tool. It does not narrow the OAuth grant. Composio's managed Gmail auth asks for Composio's own scopes, which can include modify — the token would allow more than the paper promises, even though we never use it.

Create one auth config per toolkit in the dashboard with read scopes only (`gmail.readonly`, `calendar.readonly`, `channels:history` and `search:read` for Slack, Notion's read content scopes, read-only Basecamp) and put each id in `COMPOSIO_AUTH_CONFIG_<TOOLKIT>`. The session then asks for those instead.

Set `INKWELL_REQUIRE_CUSTOM_AUTH=1` in production. Without a config for a toolkit, the service then refuses to create a session and names what is missing, rather than silently using the wider managed grant. A deploy that forgets one fails loudly instead of quietly over-reaching.

## Licenses and limits

There is no user database. A key is hashed with SHA-256 and the hash is the Composio `user_id` (`ink_<24 hex>`). The raw key is never stored, logged, or sent to Composio, and it is compared in constant time.

Two sources are merged:

- `INKWELL_LICENSES`, comma separated, fixed for the life of the process.
- `INKWELL_LICENSE_FILE`, a JSON array or `{ "licenses": [...] }`, re-read whenever its mtime or size changes.

To issue a key, run `node scripts/new-license.mjs` and add the result to either; it works on the next request. A key shorter than 16 characters, or one that starts with `dev`, `test`, `example`, `change`, `your`, `sample` or `demo`, is treated as a placeholder: accepted while developing, and **dropped when `NODE_ENV=production`**. A copied example therefore leaves the service with no valid keys instead of a free account, and the startup log says so. To revoke a key, remove it from the file: the next request is refused, on every instance, with no restart. The service also drops that license's cached Composio session at that moment, and sessions otherwise live ten minutes, so a revoked key has no way back in.

That ten minutes is the point. A session is cheap to recreate and carries the user's identity, so its lifetime is the longest a revocation can lag behind. It is what makes revocation work on more than one instance without a shared store.

Each license gets `INKWELL_RATE_LIMIT` calls an hour (default 60) and `INKWELL_MAX_IN_FLIGHT` desk calls open at once (default 2). Over budget, the answer is `429` with a `Retry-After`. The buckets are in memory, so with several instances a license gets one budget per instance — approximate rather than wrong at this scale, and the first thing to move to a shared store if it grows.

Replace `lib/licenses.js` when licenses need expiry, seats or a Stripe webhook. Keep the `check(key) → { ok, userId }` contract and the rest of the service is unchanged.

A license is looked up by hash in a set, so a request costs the same whether you have ten customers or ten thousand. Failed attempts are capped separately: `INKWELL_AUTH_FAILURES` (default 20) per address per ten minutes, after which every request from that address is a `429` with `Retry-After` — including one with a good key, so a shared address cannot be used to grind. Brute force against a 256-bit key is impractical either way; the cap is there so the attempts cost nothing.

Behind a proxy, set `INKWELL_TRUST_PROXY=1`. The cap then keys on the last `X-Forwarded-For` hop — the address your proxy itself saw — not the first, which a client can invent.

## Logs

One JSON line per request goes to stdout:

```json
{"at":"2026-11-08T06:40:11.204Z","ip":"203.0.113.7","method":"GET","path":"/desk/gmail","user":"ink_9f2c…","outcome":"desk:open","status":200,"ms":412}
```

`user` is the hashed license, so an incident can answer "who read which desk, when" without the key ever being in a log. There is no body, no subject line, no token. `INKWELL_AUDIT=0` silences it; `INKWELL_AUDIT_FILE` writes a `0600` file instead.

## Before you ship this

Not done yet, and each one matters:

1. **A real callback.** `INKWELL_PRO_CALLBACK` must point at a page you own, otherwise a user lands wherever Composio's default sends them after consent.
2. **Read-only auth configs, and the strict switch.** Composio's managed auth asks for wider scopes than the paper promises; see [Scopes](#scopes). Set all five `COMPOSIO_AUTH_CONFIG_*` values and `INKWELL_REQUIRE_CUSTOM_AUTH=1` before a customer.
3. **TLS in front.** This process speaks plain http. Terminate TLS at the proxy, and keep the proxy's read timeout above the plugin's 20 seconds.
4. **A privacy line the reader can believe.** Their mail, messages and pages pass through this service and Composio. Say so in the paper's Privacy section, and turn on zero-data-retention for the project if you are promising it.
5. **Set `INKWELL_SIGNING_SECRET`.** It signs the Connect links on the integrations page. Production refuses to start without it; without a stable value, every link dies on restart.
6. **Keep the audit log.** It writes one line per request to stdout already. Ship it somewhere with a retention period, and keep the rule: never a body, a token, a license, or a subject.

## Tests

```bash
cd server && npm test
```

The tests use fixtures, not the network: `lib/desks.js` and `lib/json.js` are pure, and `index.js` takes an injected `composio` so routing and auth run without `COMPOSIO_API_KEY` and without `@composio/core` installed.
