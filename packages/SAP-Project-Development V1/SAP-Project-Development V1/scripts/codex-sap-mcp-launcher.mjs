// Reuse the generated Claude MCP configuration without duplicating credentials.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['mcp-abap-abap-adt-api', 'sap-gui']);

export function resolveServer(name) {
  if (!allowed.has(name)) throw new Error('Unsupported SAP MCP server name.');
  const config = JSON.parse(readFileSync(resolve(workspace, '.mcp.json'), 'utf8').replace(/^\uFEFF/, ''));
  const server = config.mcpServers?.[name];
  if (!server?.command || !Array.isArray(server.args)) throw new Error('Missing MCP command or arguments.');
  let fallback;
  const interpolate = value => String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
    if (process.env[key]) return process.env[key];
    fallback ??= JSON.parse(readFileSync(resolve(workspace, '.claude/settings.local.json'), 'utf8').replace(/^\uFEFF/, '')).env ?? {};
    if (!fallback[key]) throw new Error(`Missing environment variable: ${key}`);
    return String(fallback[key]);
  });
  const command = interpolate(server.command);
  const args = server.args.map(interpolate);
  const env = { ...process.env };
  for (const [key, value] of Object.entries(server.env ?? {})) env[key] = interpolate(value);
  const cwd = resolve(workspace, server.cwd ? interpolate(server.cwd) : '.');
  if (!existsSync(cwd)) throw new Error('MCP working directory does not exist.');
  if (isAbsolute(command) && !existsSync(command)) throw new Error('MCP executable does not exist.');
  if (name === 'mcp-abap-abap-adt-api' && !existsSync(args[0])) throw new Error('ADT MCP entry point does not exist.');
  return { command, args, env, cwd };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const name = process.argv[2];
    const server = resolveServer(name);
    if (process.argv[3] === '--check') {
      process.stdout.write(JSON.stringify({ server: name, configurationValid: true, credentialsResolved: Boolean(server.env.SAP_PASSWORD) }) + '\n');
    } else {
      const child = spawn(server.command, server.args, {
        cwd: server.cwd, env: server.env, stdio: 'inherit', windowsHide: true, shell: false,
      });
      child.on('error', () => { process.stderr.write('SAP MCP process could not start.\n'); process.exitCode = 1; });
      child.on('exit', code => { process.exitCode = code ?? 1; });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    }
  } catch {
    // Configuration may contain credentials. Never echo parsed values or raw errors.
    process.stderr.write('SAP MCP configuration could not be resolved; check paths and credential availability.\n');
    process.exitCode = 1;
  }
}
