import { fileURLToPath } from 'node:url';
import { resolveAppOrigin } from './src/lib/public-url.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
};

export default function config(phase) {
  if (phase === 'phase-production-build' || phase === 'phase-production-server') {
    resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL, 'production');
  }
  return nextConfig;
}
