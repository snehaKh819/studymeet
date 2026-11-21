import 'dotenv/config';
import { createServer } from './server.js';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set');
  process.exit(1);
}

const PORT = process.env.PORT || 5004;
const { server, collab } = createServer();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Workspace service listening on port ${PORT} (REST + live collaboration)`);
});

// Save any unsaved live edits before the container stops.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(`${signal} received, saving open workspaces...`);
    await collab.shutdown().catch((err) => console.error('shutdown error:', err.message));
    process.exit(0);
  });
}
