#!/usr/bin/env node
/**
 * Fail loudly when the running dev server and the next build disagree about
 * VITE_AUTH_ENABLED.
 */
import { APP_ENV_ROUTE } from "./app-env-plugin.mjs";
import { isMainModule, mergeAppEnv, projectRoot, readAppEnv } from "./with-app-env.mjs";

const DEFAULT_DEV_URL = "http://127.0.0.1:8080";

export function authEnabledFromEnvValue(value) { return value !== "false"; }

export function compareAuthInvariant({ devAuthEnabled, buildAuthEnabled }) {
  const label = (value) => (value ? "on" : "off");
  if (devAuthEnabled === null || devAuthEnabled === undefined) {
    return { status: "indeterminate", message: "[auth-invariant] could not read the dev server's resolved VITE_AUTH_ENABLED" };
  }
  if (devAuthEnabled === buildAuthEnabled) {
    return { status: "ok", message: `[auth-invariant] dev and build agree: sign-in ${label(devAuthEnabled)}` };
  }
  return {
    status: "diverged",
    message:
      `[auth-invariant] dev server has sign-in ${label(devAuthEnabled)} but the next ` +
      `build has it ${label(buildAuthEnabled)}. Start the app with \`npm run dev\` — ` +
      "invoking vite directly skips scripts/with-app-env.mjs, so the dev server and " +
      "the built output may resolve workspace environment differently.",
  };
}

export async function probeDevAuthEnabled(devUrl, fetchImpl = fetch) {
  let env;
  try {
    const response = await fetchImpl(new URL(APP_ENV_ROUTE, devUrl).href);
    if (!response.ok) return null;
    env = JSON.parse(await response.text());
  } catch { return null; }
  if (env === null || typeof env !== "object") return null;
  return authEnabledFromEnvValue(env.VITE_AUTH_ENABLED);
}
export function authInvariantWarnings(result) { return result.status === "diverged" ? [result.message] : []; }
export function buildAuthEnabled(root = projectRoot(), processEnv = process.env) {
  const env = mergeAppEnv(readAppEnv(root), processEnv);
  return authEnabledFromEnvValue(env.VITE_AUTH_ENABLED);
}

async function main(argv) {
  const devUrlFlag = argv.indexOf("--dev-url");
  const devUrl = devUrlFlag === -1 ? DEFAULT_DEV_URL : argv[devUrlFlag + 1];
  const result = compareAuthInvariant({ devAuthEnabled: await probeDevAuthEnabled(devUrl), buildAuthEnabled: buildAuthEnabled() });
  if (result.status === "ok") {
    console.log(result.message);
    process.exit(0);
  }
  console.error(result.message);
  process.exit(result.status === "diverged" ? 1 : 2);
}
if (isMainModule(import.meta.url)) await main(process.argv.slice(2));
