import path from 'node:path';
import { ChatFlowGateway } from './server.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const gateway = new ChatFlowGateway({
  port: PORT,
  uploadDir: UPLOAD_DIR,
  heartbeatIntervalMs: 25000,
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
