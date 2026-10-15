import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createPackage } from '@electron/asar';
import { prepareStandalone, publicRuntimeConfig, PUBLIC_RUNTIME_KEYS } from '../../scripts/prepare-standalone.mjs';
import { checkArtifacts } from '../../scripts/check-client-secrets.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatflow-package-')); roots.push(root);
  fs.mkdirSync(path.join(root, '.next', 'static'), { recursive: true });
  fs.mkdirSync(path.join(root, '.next', 'standalone'), { recursive: true });
  return root;
}
const fakeSecret = 'fixture-secret-marker-never-a-real-key';

describe('standalone public configuration', () => {
  it('emits only exact allowlisted public keys with production/process precedence and removes traced env files', async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, '.env'), 'NEXT_PUBLIC_APP_URL=https://base.example.test\n');
    fs.writeFileSync(path.join(root, '.env.local'), `NEXT_PUBLIC_APP_URL=https://local.example.test\nNEXT_PUBLIC_SUPABASE_URL=https://project.example.test\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture\nSUPABASE_SECRET_KEY=${fakeSecret}\nSMTP_PASSWORD=${fakeSecret}\nJWT_SECRET=${fakeSecret}\nDOWNLOAD_SIGNING_SECRET=${fakeSecret}\nNEXT_PUBLIC_UNKNOWN=unknown\nCHATFLOW_RUNTIME=electron\n`);
    fs.writeFileSync(path.join(root, '.next', 'standalone', '.env.production'), `SUPABASE_SERVICE_ROLE_KEY=${fakeSecret}`);
    fs.writeFileSync(path.join(root, '.next', 'static', 'app.js'), 'public runtime');
    prepareStandalone(root, { NEXT_PUBLIC_APP_URL: 'https://process.example.test', CHATFLOW_ACCOUNT_API_URL: 'https://process.example.test/api/account', CHATFLOW_ACCOUNT_API_ALLOWED_ORIGINS: 'https://process.example.test' });
    const emitted = parseEnv(fs.readFileSync(path.join(root, '.next', 'standalone', '.env.local'), 'utf8'));
    expect(Object.keys(emitted).every(key => PUBLIC_RUNTIME_KEYS.includes(key))).toBe(true);
    expect(emitted.NEXT_PUBLIC_APP_URL).toBe('https://process.example.test');
    expect(emitted.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('sb_publishable_fixture');
    expect(fs.existsSync(path.join(root, '.next', 'standalone', '.env.production'))).toBe(false);
    expect(await checkArtifacts(root, {})).toBeGreaterThan(0);
  });
  it.each([fakeSecret, 'sb_secret_fixturecredential123456'])('rejects privileged aliases and unsafe expansion without echoing values', marker => {
    const root = fixture();
    const value = marker === fakeSecret ? '$SUPABASE_SECRET_KEY' : marker;
    expect(() => publicRuntimeConfig(root, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value })).toThrow(/configuration/);
  });
  it('rejects a service-role JWT wrongly placed in a public key', () => {
    const root = fixture();
    const token = `eyJfixture.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.fixture`;
    expect(() => publicRuntimeConfig(root, { NEXT_PUBLIC_SUPABASE_ANON_KEY: token })).toThrow('Privileged key');
  });
});

describe('distribution secret gate', () => {
  it.each(['.next/static/app.js', '.next/standalone/server.js', 'release/win-unpacked/resources/payload.json'])('detects literal markers in %s and reports no value', async file => {
    const root = fixture(); const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, fakeSecret);
    let message = '';
    try { await checkArtifacts(root, { SUPABASE_SECRET_KEY: fakeSecret }); } catch (error) { message = (error as Error).message; }
    expect(message).toContain('Privileged credential'); expect(message).not.toContain(fakeSecret);
  });
  it('rejects non-public env assignments without treating server JS variable references as credentials', async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, '.next', 'standalone', 'server.js'), 'const key=process.env.SUPABASE_SECRET_KEY; const smtp=process.env.SMTP_PASSWORD;');
    expect(await checkArtifacts(root, {})).toBe(1);
    fs.writeFileSync(path.join(root, '.next', 'standalone', '.env.local'), 'SUPABASE_SECRET_KEY=short');
    await expect(checkArtifacts(root, {})).rejects.toThrow('Non-public environment variable');
  });
  it('inspects compressed ASAR contents as well as unpacked distribution files', async () => {
    const root = fixture(); const input = path.join(root, 'archive-input');
    fs.mkdirSync(input); fs.writeFileSync(path.join(input, 'payload.js'), fakeSecret);
    fs.mkdirSync(path.join(root, 'release')); await createPackage(input, path.join(root, 'release', 'app.asar'));
    await expect(checkArtifacts(root, { DOWNLOAD_SIGNING_SECRET: fakeSecret })).rejects.toThrow('Privileged credential');
  });
  it('requires build artifacts and rejects a secret using NEXT_PUBLIC_', async () => {
    const root = fixture();
    await expect(checkArtifacts(root, { NEXT_PUBLIC_SERVICE_ROLE_KEY: fakeSecret })).rejects.toThrow('Privileged public variable');
    fs.rmdirSync(path.join(root, '.next', 'static'));
    await expect(checkArtifacts(root, {})).rejects.toThrow('Build artifacts missing');
  });
});
