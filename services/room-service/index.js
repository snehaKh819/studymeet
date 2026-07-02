import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { AccessToken } from 'livekit-server-sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(` Room Microservice running on port ${PORT}`);
});