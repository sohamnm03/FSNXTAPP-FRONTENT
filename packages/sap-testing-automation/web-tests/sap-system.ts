/**
 * Resolves the target SAP system from ../config/sap-systems.json.
 *
 * config/sap-systems.json is the single source of truth for BOTH test lanes:
 * the sap-gui MCP server reads it through scripts/sync-sap-systems.ps1, and the
 * web lane reads it here. Endpoints and user names live in that file; the
 * password never does - it is named there and resolved from the environment.
 *
 * SAP_WEB_USER / SAP_WEB_PASSWORD, if set, override the registry's user and
 * the resolved password for this run only. The desktop app's Web Lane sidebar
 * sets these when the user types their own SAP credentials there instead of
 * using the registry's account; unattended/model-driven runs never set them,
 * so they keep using the registry account exactly as before.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));

// Local override file for running outside Claude Code. Gitignored.
dotenv.config({ path: resolve(here, '.env'), quiet: true });

type SapSystem = {
  id: string;
  label: string;
  enabled: boolean;
  systemId: string;
  client: string;
  language: string;
  credentials: { user: string; passwordEnvVar: string };
  web?: {
    enabled: boolean;
    baseUrl: string;
    flpPath: string;
    webguiPath: string;
    ignoreHttpsErrors?: boolean;
  };
};

type Registry = { defaultSystem: string; systems: SapSystem[] };

const registryPath = resolve(here, '..', 'config', 'sap-systems.json');
const registry: Registry = JSON.parse(readFileSync(registryPath, 'utf8'));

/** Which system to drive. Override with SAP_SYSTEM_ID=<id>. */
const wantedId = process.env.SAP_SYSTEM_ID ?? registry.defaultSystem;

const system = registry.systems.find((s) => s.id === wantedId);
if (!system) {
  throw new Error(
    `System '${wantedId}' is not in ${registryPath}. ` +
      `Known ids: ${registry.systems.map((s) => s.id).join(', ')}`,
  );
}
if (!system.enabled) {
  throw new Error(`System '${system.id}' is disabled in the registry.`);
}
if (!system.web?.enabled) {
  throw new Error(
    `System '${system.id}' has no enabled 'web' block - it cannot be driven by the web lane.`,
  );
}

const overrideUser = process.env.SAP_WEB_USER?.trim();
const overridePassword = process.env.SAP_WEB_PASSWORD;

const password = overridePassword || process.env[system.credentials.passwordEnvVar];
if (!password) {
  throw new Error(
    `Password not found. Set ${system.credentials.passwordEnvVar} in the environment ` +
      `(Claude Code reads .claude/settings.local.json) or in web-tests/.env. ` +
      `See docs/web-testing-setup.md.`,
  );
}

/**
 * Guard rail, mirroring non-negotiable #1 in CLAUDE.md: this workspace never
 * drives production. The registry has no production system in it, but an
 * environment override could still point somewhere it should not.
 */
const baseUrl = process.env.SAP_BASE_URL ?? system.web.baseUrl;

// No word boundaries: the production hosts embed their SYSID in the hostname
// (dev is vhnlqDS4ap01, production is vhnlqPS4ap01), so \bps4\b never matches.
const PRODUCTION_MARKERS = /ps4|prd|prod/i;
if (PRODUCTION_MARKERS.test(baseUrl)) {
  throw new Error(
    `Refusing to run: base URL '${baseUrl}' looks like a production system. ` +
      `This workspace targets development systems only.`,
  );
}

export const sapSystem = {
  id: system.id,
  label: system.label,
  systemId: system.systemId,
  client: system.client,
  language: system.language,
  user: overrideUser || system.credentials.user,
  password,
  baseUrl,
  flpUrl: baseUrl + system.web.flpPath,
  webguiUrl: baseUrl + system.web.webguiPath,
  ignoreHttpsErrors: system.web.ignoreHttpsErrors ?? false,
};
