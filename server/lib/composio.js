// The one place the Composio SDK is touched.
//
// A session is created per license and reused, because a session carries the
// user's identity and connection state. It is narrowed twice: to the five
// toolkits the desks need, and inside each to a single read-only tool. A
// session cannot run anything this project did not name here, even if a future
// contributor asks it to.

"use strict"

// A session carries the user's identity and connection state, and it is cheap
// to recreate. Its lifetime is therefore the longest a revoked license could
// keep reading, which is why it is ten minutes and not a day: revocation works
// on every instance without a shared store, and one morning run still creates
// a single session.
import { normalize, withState } from "./integrations.js"

const TTL_MS = 10 * 60 * 1000

// Verified against docs.composio.dev/toolkits/<toolkit> — see server/README.md
// before changing any slug. A read-only slug keeps the whole integration
// read-only from the provider's side, not just from ours.
const TOOLS = {
  gmail: { enable: ["GMAIL_FETCH_EMAILS"] },
  googlecalendar: { enable: ["GOOGLECALENDAR_EVENTS_LIST"] },
  slack: { enable: ["SLACK_SEARCH_MESSAGES"] },
  notion: { enable: ["NOTION_SEARCH_NOTION_PAGE"] },
  basecamp: { enable: ["BASECAMP_GET_MY_ASSIGNMENTS"] }
}

// The tool allowlist stops us calling a writing tool. It does not narrow the
// OAuth grant: managed auth asks for Composio's own scopes, and Gmail's may
// include modify. Point these at auth configs created with read-only scopes so
// the grant matches the paper's promise, not just our code path.
const AUTH_ENV = {
  gmail: "COMPOSIO_AUTH_CONFIG_GMAIL",
  googlecalendar: "COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR",
  slack: "COMPOSIO_AUTH_CONFIG_SLACK",
  notion: "COMPOSIO_AUTH_CONFIG_NOTION",
  basecamp: "COMPOSIO_AUTH_CONFIG_BASECAMP"
}

function sessionConfig(env) {
  env = env || process.env
  const authConfigs = {}
  for (const [toolkit, name] of Object.entries(AUTH_ENV)) {
    const id = String(env[name] || "").trim()
    if (id) authConfigs[toolkit] = id
  }
  const config = {
    toolkits: { enable: Object.keys(TOOLS) },
    tools: TOOLS,
    // Belt and braces: even if a slug were mis-tagged in the enable lists, a
    // deleting tool would not be reachable.
    tags: { disable: ["destructiveHint"] },
    // The sandbox runs arbitrary code and is outside Composio's zero-data-
    // retention coverage. A newspaper does not need it.
    sandbox: { enable: false }
  }
  if (Object.keys(authConfigs).length) config.authConfigs = authConfigs
  return config
}

// Toolkits that would fall back to managed (possibly wider) scopes.
function missingAuthConfigs(env) {
  const set = sessionConfig(env).authConfigs || {}
  return Object.keys(TOOLS).filter(t => !set[t])
}

// Lazy so the shaping tests and the plugin tests run without @composio/core
// installed, and so a missing key is a request error rather than a crash when
// this module is imported.
//
// The SDK is ESM-only and declares Node >= 22.22.3. The free paper still runs
// on Node 20; only this service needs the newer runtime.
let Sdk = null
async function sdk() {
  if (!Sdk) Sdk = await import("@composio/core")
  return new Sdk.Composio()
}

// A missing or invalid project key is the operator's problem, not the user's.
// Swallowing it would show a Connect button that can never work.
function isConfigError(e) {
  const s = String((e && e.name || "") + " " + (e && e.message || e)).toLowerCase()
  return /no_api_key|no composio api key|composio_api_key|invalid api key|auth config|auth_config/.test(s)
}

function create(opts) {
  opts = opts || {}
  let composio = opts.composio || null
  const callbackUrl = opts.callbackUrl || process.env.INKWELL_PRO_CALLBACK || undefined
  const now = opts.now || Date.now
  const ttl = Math.max(1000, Number(opts.sessionTtlMs) || TTL_MS)
  const env = opts.env || process.env
  const config = opts.session || sessionConfig(env)
  const strict = opts.requireCustomAuth === true ||
    (opts.requireCustomAuth === undefined && String(env.INKWELL_REQUIRE_CUSTOM_AUTH || "") === "1")
  // Per service, not per module: two servers in one process (the tests) must
  // not share a session cache.
  const sessions = new Map()
  // The catalogue is the same for every reader and changes slowly; a day is
  // short enough. Connection state is per reader and is never cached here.
  let catalog = null
  let catalogAt = 0

  async function client() {
    if (!composio) composio = await sdk()
    return composio
  }

  async function integrationCatalog() {
    if (catalog && Date.now() - catalogAt < 24 * 60 * 60 * 1000) return catalog
    const raw = await (await client()).toolkits.get({ limit: 60 })
    catalog = normalize(raw)
    catalogAt = Date.now()
    return catalog
  }

  // A session id can be deleted out from under us (dashboard cleanup, a
  // redeploy). One retry after dropping the cache is enough; a second failure
  // is a real one.
  async function withSession(userId, fn) {
    let session = await sessionFor(userId)
    try {
      return await fn(session)
    } catch (e) {
      if (!/session|not found/i.test(String(e && e.message))) throw e
      sessions.delete(userId)
      session = await sessionFor(userId)
      return fn(session)
    }
  }

  async function sessionFor(userId) {
    const hit = sessions.get(userId)
    if (hit && now() - hit.at < ttl) return hit.session
    if (hit) sessions.delete(userId)
    if (strict) {
      const missing = missingAuthConfigs(env)
      if (missing.length) {
        throw new Error("No read-only auth config for " + missing.join(", ") +
          ". Set COMPOSIO_AUTH_CONFIG_* or unset INKWELL_REQUIRE_CUSTOM_AUTH.")
      }
    }
    // The SDK reads COMPOSIO_API_KEY from the environment; it is never passed in.
    const session = await (await client()).sessions.create(userId, config)
    sessions.set(userId, { session, at: now() })
    // A long-running process should not accumulate a session per user forever.
    if (sessions.size > 5000) {
      const t = now()
      for (const [k, v] of sessions) if (t - v.at >= ttl) sessions.delete(k)
    }
    return session
  }

  return {
    sessionFor,

    // The 25 most popular integrations and whether this reader has each one.
    async integrations(userId, limit) {
      const items = await integrationCatalog()
      const accounts = await (await client()).connectedAccounts.list({ userId })
      const list = Array.isArray(accounts) ? accounts : (accounts && accounts.items) || []
      const on = new Set(list.filter(a => a && a.status === "ACTIVE" && a.toolkit).map(a => a.toolkit.slug))
      return withState(items, on, limit)
    },

    async execute(userId, slug, args) {
      return withSession(userId, s => s.execute(slug, args))
    },

    // Toolkit slugs the user has actually authorized. Used to decide between a
    // desk and a Connect button, without attempting a tool call that would 401.
    async connected(userId) {
      const out = new Set()
      try {
        const page = await withSession(userId, s => s.toolkits())
        for (const item of (page && page.items) || []) {
          const slug = String(item && item.slug || "").toLowerCase()
          const active = item && item.connection && (item.connection.isActive === true || item.connection.is_active === true)
          if (slug && active) out.add(slug)
        }
      } catch (e) {
        if (isConfigError(e)) throw e
        // An unknown connection state reads as "not connected", which shows a
        // Connect button rather than pretending the desk is empty.
      }
      return out
    },

    // A connect link can be for any toolkit, not only the five desks, so it
    // gets its own short-lived session scoped to that one toolkit. The
    // connection belongs to the user, not to the session that opened it.
    async connectLink(userId, toolkit) {
      try {
        const base = sessionConfig(env)
        const config = {
          toolkits: { enable: [toolkit] },
          tags: base.tags,
          sandbox: { enable: false }
        }
        if (base.tools[toolkit]) config.tools = { [toolkit]: base.tools[toolkit] }
        if (base.authConfigs && base.authConfigs[toolkit]) config.authConfigs = { [toolkit]: base.authConfigs[toolkit] }

        const session = await (await client()).sessions.create(userId, config)
        const request = await session.authorize(toolkit, callbackUrl ? { callbackUrl } : undefined)
        return String(request && (request.redirectUrl || request.redirect_url) || "")
      } catch (e) {
        if (isConfigError(e)) throw e
        return ""
      }
    },

    forget(userId) { sessions.delete(userId) }
  }
}

export { create, sessionConfig, missingAuthConfigs, TOOLS, TTL_MS }