import path from 'node:path';
import { ChatFlowGateway } from './server.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const gateway = new ChatFlowGateway({
  port: PORT,
  uploadDir: UPLOAD_DIR,
  heartbeatIntervalMs: 25000,
  supabaseUrl: SUPABASE_URL,
  supabasePublicKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  downloadSecret: process.env.GATEWAY_DOWNLOAD_SECRET,
  transferLimits: {
    globalConcurrent: Number(process.env.GATEWAY_MAX_UPLOADS || 32),
    globalBytes: Number(process.env.GATEWAY_STORAGE_BYTES || 10 * 1024 * 1024 * 1024),
  },
  rateLimitMaxMessages: 10,
  rateLimitWindowMs: 5000,
  maxTextFrameBytes: 64 * 1024,
});

gateway.start().catch((err) => {
  console.error('[Gateway] Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n[Gateway] Shutting down gracefully...');
  await gateway.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Gateway] Received SIGTERM...');
  await gateway.stop();
  process.exit(0);
});
