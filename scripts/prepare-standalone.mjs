import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

// Locations are public configuration; only Electron may set runtime trust markers.
export const PUBLIC_RUNTIME_KEYS = Object.freeze([
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_GATEWAY_URL', 'NEXT_PUBLIC_GIPHY_API_KEY',
  'CHATFLOW_ACCOUNT_API_URL', 'CHATFLOW_ACCOUNT_API_ALLOWED_ORIGINS',
]);

/** @param {string} root @param {Record<string, string | undefined>} environment */
export function publicRuntimeConfig(root, environment = process.env) {
  const config = {};
  for (const name of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) Object.assign(config, parseEnv(fs.readFileSync(file, 'utf8')));
  }
  Object.assign(config, environment);
  return Object.fromEntries(PUBLIC_RUNTIME_KEYS.filter(key => config[key]).map(key => {
    const value = String(config[key]);
    // Do not let Next expand a public alias into an operator secret.
    if (/[\r\n$"\\]/.test(value)) throw new Error(`Unsupported public configuration syntax: ${key}`);
    if (/^sb_secret_/i.test(value)) throw new Error(`Privileged key in public configuration: ${key}`);
    if (key.includes('SUPABASE') && key.includes('KEY') && value.split('.').length === 3) {
      try {
        if (JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'service_role') throw new Error(`Privileged key in public configuration: ${key}`);
      } catch (error) { if (error.message.startsWith('Privileged key')) throw error; }
    }
    return [key, value];
  }));
}

/** @param {string} root @param {Record<string, string | undefined>} environment */
export function prepareStandalone(root = process.cwd(), environment = process.env) {
  const standalone = path.join(root, '.next', 'standalone');
  if (!fs.existsSync(standalone)) return false;
  const config = publicRuntimeConfig(root, environment);
  // Remove env files traced by Next or left over from an earlier package build.
  function clean(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) clean(file);
      else if (/^\.env(?:\.|$)/.test(entry.name)) fs.unlinkSync(file);
    }
  }
  clean(standalone);
  for (const [source, destination] of [['.next/static', '.next/static'], ['public', 'public']]) {
    const from = path.join(root, source);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(standalone, destination), { recursive: true });
  }
  fs.writeFileSync(path.join(standalone, '.env.local'), Object.entries(config).map(([key, value]) => `${key}="${value}"`).join('\n') + '\n');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (prepareStandalone()) console.log('[standalone] Prepared static assets and allowlisted public runtime configuration.');
}
