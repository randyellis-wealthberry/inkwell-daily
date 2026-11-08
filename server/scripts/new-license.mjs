#!/usr/bin/env node
// Prints one strong license key and nothing else:
//
//   node scripts/new-license.mjs
//
// Put it in INKWELL_LICENSES (comma separated) or in the INKWELL_LICENSE_FILE,
// and give the same value to one customer. Rotating a key changes that
// customer's Composio user id, so they will reconnect their accounts once.

import { randomBytes } from "node:crypto"

process.stdout.write(randomBytes(32).toString("base64url") + "\n")
