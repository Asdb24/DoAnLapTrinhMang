import { describe, expect, it } from 'vitest';
import { resolveAppOrigin } from '@/lib/public-url.mjs';

describe('canonical public application URL', () => {
  it('uses the configured origin instead of a request host', () => {
    expect(resolveAppOrigin('https://chat.example.test/', 'production', 'http://localhost:3100')).toBe('https://chat.example.test');
  });
  it.each([undefined, '', 'http://chat.example.test', 'https://localhost:3100', 'https://localhost.', 'https://a.localhost', 'https://127.0.0.1', 'https://[::1]', 'https://192.168.1.2', 'https://a.local', 'https://machine'])('refuses unsafe or missing production origin %s', value => {
    expect(() => resolveAppOrigin(value, 'production', 'https://untrusted.example.test')).toThrow();
  });
  it.each(['https://user:password@chat.example.test', 'https://chat.example.test/path', 'https://chat.example.test/?token=secret', 'https://chat.example.test/#token', 'javascript:alert(1)'])('refuses non-origin configuration %s', value => {
    expect(() => resolveAppOrigin(value, 'production')).toThrow();
  });
  it('allows request origins only in local development/test', () => {
    expect(resolveAppOrigin(undefined, 'development', 'http://localhost:3100')).toBe('http://localhost:3100');
    expect(resolveAppOrigin(undefined, 'test', 'http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100');
  });
});
