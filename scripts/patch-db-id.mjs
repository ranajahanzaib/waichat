/**
 * Workaround for: https://github.com/cloudflare/workers-sdk/issues/13632
 *
 * When deploying via GitHub / Cloudflare Workers Builds, `wrangler deploy`
 * auto-provisions the D1 database but does NOT write the database_id back
 * to wrangler.jsonc on disk. This means the subsequent `wrangler d1 migrations apply`
 * fails with "missing database_id".
 *
 * This script fetches the real UUID from the Cloudflare API via `wrangler d1 list`
 * and patches the empty database_id in wrangler.jsonc before migrations run.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

const DB_NAME = "waichat-db";
const CONFIG_FILE = "wrangler.jsonc";

console.log(`Looking up database_id for "${DB_NAME}"...`);

let dbs;
try {
  const output = execSync("npx wrangler d1 list --json", { encoding: "utf8" });
  dbs = JSON.parse(output);
} catch (err) {
  console.error("Failed to run `wrangler d1 list --json`:", err.message);
  process.exit(1);
}

const db = dbs.find((d) => d.name === DB_NAME);

if (!db?.uuid) {
  console.error(`Could not find "${DB_NAME}" in wrangler d1 list output.`);
  console.error("Available databases:", dbs.map((d) => d.name).join(", "));
  process.exit(1);
}

const config = readFileSync(CONFIG_FILE, "utf8");

if (!config.includes('"database_id": ""')) {
  console.log(`database_id already set in ${CONFIG_FILE}, skipping patch.`);
  process.exit(0);
}

const patched = config.replace(/"database_id":\s*""/, `"database_id": "${db.uuid}"`);

writeFileSync(CONFIG_FILE, patched);
console.log(`✓ Patched ${CONFIG_FILE} with database_id: ${db.uuid}`);
