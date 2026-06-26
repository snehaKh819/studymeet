import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'; 
import pg from 'pg';                         
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter }); 

const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', service: 'user-auth-service', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', service: 'user-auth-service', error: error.message });
  }
});

app.use('/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`Auth Microservice safely listening on port ${PORT}`);
});