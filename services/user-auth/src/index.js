import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import prisma from './lib/prisma.js';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;
app.use(cors({
  origin: ['http://localhost', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', service: 'user-auth-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', service: 'user-auth-service', error: error.message });
  }
});

app.use('/', authRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Auth Microservice safely listening on http://0.0.0.0:${PORT}`);
});