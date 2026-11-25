import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { AccessToken } from 'livekit-server-sdk';
import Redis from 'ioredis';

dotenv.config();

for (const name of ['JWT_SECRET', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) {
  if (!process.env[name]) {
    console.error(`FATAL: ${name} is not set`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 5002;

// Remembers who has joined which room so other services (workspace-service) can
// check room membership:  HSET room:<roomId>:members <userId> <displayName>
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: 2,
});
redis.on('error', (err) => console.error('Redis error:', err.message));
const MEMBERS_TTL_SECONDS = 12 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.use(cors());
app.use(express.json());

const getTokenFromRequest = (req) => {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...value] = cookie.trim().split('=');
    if (name) {
      acc[name] = decodeURIComponent(value.join('='));
    }
    return acc;
  }, {});

  return cookies.token;
};

const authenticateToken = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: 'Access Token Required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or Expired Token' });
    }
    req.user = user; 
    next();
  });
};

app.post('/join', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.body;
    
    const participantIdentity = req.user.username || req.user.email;

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: participantIdentity,
        ttl: '2h',
      }
    );

    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // Best effort: a Redis hiccup must never block someone from joining the call.
    if (UUID.test(roomId) && req.user.userId) {
      try {
        const key = `room:${roomId}:members`;
        await redis.multi().hset(key, req.user.userId, participantIdentity).expire(key, MEMBERS_TTL_SECONDS).exec();
      } catch (err) {
        console.error('Could not record room membership:', err.message);
      }
    }

    res.json({ 
      token, 
      room: roomId, 
      identity: participantIdentity 
    });

  } catch (error) {
    console.error(' Error generating LiveKit token:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});
// ---------------
app.get("/health",(req,res)=>{
  res.json({
    status:"healthy",
    service:"room-service"
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(` Room Microservice running on port ${PORT}`);
});