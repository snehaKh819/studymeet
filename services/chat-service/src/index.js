const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');

const app = express();
const httpServer = createServer(app);

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = Number(process.env.REDIS_PORT || 6379);

const publisher = new Redis({
  host: redisHost,
  port: redisPort,
});

const subscriber = new Redis({
  host: redisHost,
  port: redisPort,
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...value] = cookie.trim().split('=');
    if (name) {
      acc[name] = decodeURIComponent(value.join('='));
    }
    return acc;
  }, {});

const getTokenFromSocket = (socket) => {
  const queryToken = socket.handshake.query.token;
  if (queryToken) {
    return queryToken;
  }

  const cookies = parseCookies(socket.handshake.headers.cookie || '');
  return cookies.token;
};

io.use((socket, next) => {
  const token = getTokenFromSocket(socket);

  if (!token) {
    socket.user = { username: `guest-${socket.id.slice(0, 6)}` };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

subscriber.on('message', (channel, message) => {
  const roomId = channel.replace('room:', '');
  const parsedMessage = JSON.parse(message);
  io.to(roomId).emit('message', parsedMessage);
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);

  socket.on('joinRoom', (roomId) => {
    if (!roomId) return;

    socket.join(roomId);
    subscriber.subscribe(`room:${roomId}`);
    console.log(`${socket.user.username} joined room ${roomId}`);

    socket.to(roomId).emit('user_joined', {
      username: socket.user.username,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('message', ({ roomId, text }) => {
    if (!roomId || !text) return;

    const messagePayload = {
      username: socket.user.username,
      text,
      roomId,
      timestamp: new Date().toISOString(),
    };

    publisher.publish(`room:${roomId}`, JSON.stringify(messagePayload));
  });

  socket.on('leave_room', (roomId) => {
    if (!roomId) return;

    socket.leave(roomId);
    socket.to(roomId).emit('user_left', {
      username: socket.user.username,
      timestamp: new Date().toISOString(),
    });
    console.log(`${socket.user.username} left room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username}`);
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat service running on port ${PORT}`);
});