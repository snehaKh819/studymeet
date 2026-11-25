import express from 'express';
import prisma from './lib/prisma.js';
import redis from './lib/redis.js';
import workspaceRoutes from './routes/workspaces.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '300kb' }));

  // No CORS: the browser reaches this service through the gateway (same origin).

  app.get('/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.error('Health check: database down:', err.message);
      return res.status(500).json({ status: 'unhealthy', service: 'workspace-service', database: 'down' });
    }
    let redisStatus = 'connected';
    try {
      await redis.ping();
    } catch {
      redisStatus = 'down';
    }
    res.json({ status: 'healthy', service: 'workspace-service', database: 'connected', redis: redisStatus });
  });

  app.use('/workspaces', workspaceRoutes);

  app.use((req, res) => res.status(404).json({ message: 'Not found' }));

  // Never leak internal error messages to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
