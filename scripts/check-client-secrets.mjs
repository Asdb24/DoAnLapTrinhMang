import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PUBLIC_RUNTIME_KEYS } from './prepare-standalone.mjs';

const sensitiveName = /(SECRET|PASSWORD|PRIVATE_KEY|SMTP.*(?:KEY|TOKEN)|ACCESS_TOKEN|SERVICE_ROLE|ADMIN.*(?:KEY|TOKEN)|JWT|DOWNLOAD.*SIGN|DATABASE_URL)/i;
const allowed = new Set(PUBLIC_RUNTIME_KEYS);

/** @param {string} root @param {Record<string, string | undefined>} environment */
export async function checkArtifacts(root = process.cwd(), environment = process.env) {
  const config = {};
  for (const name of ['.env', '.env.production', '.env.local', '.env.production.local', '.env.server.local']) {
    const file = path.join(root, name);
    if (existsSync(file)) Object.assign(config, parseEnv(readFileSync(file, 'utf8')));
  }
  Object.assign(config, environment);
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith('NEXT_PUBLIC_') && sensitiveName.test(key) && value) throw new Error(`Privileged public variable: ${key}`);
  }
  const secrets = Object.entries(config).filter(([key, value]) => !key.startsWith('NEXT_PUBLIC_') && sensitiveName.test(key) && value && String(value).length >= 8).map(([, value]) => String(value));
  let files = 0;
  function inspect(name, bytes) {
    files++;
    const content = bytes.toString('utf8');
    // Credential literals are forbidden. Server-side process.env references are safe.
    if (secrets.some(secret => content.includes(secret)) || /sb_secret_[A-Za-z0-9_-]{12,}/.test(content) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) throw new Error(`Privileged credential found in artifact: ${name}`);
    for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      try {
        if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') throw new Error(`Privileged credential found in artifact: ${name}`);
      } catch (error) { if (error.message.startsWith('Privileged credential')) throw error; }
    }
    if (/^\.env(?:\.|$)/.test(path.basename(name))) {
      for (const key of Object.keys(parseEnv(content))) if (!allowed.has(key)) throw new Error(`Non-public environment variable in artifact ${name}: ${key}`);
    }
  }
  async function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Uninspectable symbolic link in artifact: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.asar')) {
        const asar = await import('@electron/asar');
        for (const member of asar.listPackage(file)) {
          const relative = member.replace(/^[/\\]/, '');
          const stat = asar.statFile(file, relative);
          if ('files' in stat) continue;
          if ('link' in stat) throw new Error(`Uninspectable archive link in artifact: ${file}`);
          inspect(`${file}/${relative}`, asar.extractFile(file, relative));
        }
      } else inspect(file, readFileSync(file));
    }
  }
  if (!existsSync(path.join(root, '.next', 'static'))) throw new Error('Build artifacts missing: run npm run build before the secret gate.');
  for (const directory of ['.next/static', '.next/standalone', 'release']) {
    const full = path.join(root, directory);
    if (existsSync(full)) await walk(full);
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(`Verified ${await checkArtifacts()} browser/standalone/distribution artifacts: no privileged credentials present.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
