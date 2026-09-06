const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

const PORT = process.env.PORT || 5003;

const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const roomStartTimes = new Map();

io.on('connection', (socket) => {

  console.log(
    'Timer client connected:',
    socket.id
  );

  socket.on('join-room-timer', ({ roomId }) => {

    console.log(
      'Timer join request:',
      roomId,
      'from:',
      socket.id
    );

    if (!roomId) {
      console.log('No roomId received');
      return;
    }

    socket.join(roomId);

    if (!roomStartTimes.has(roomId)) {

      const startTime = Date.now();

      roomStartTimes.set(
        roomId,
        startTime
      );

      console.log(
        'Created timer:',
        roomId,
        startTime
      );
    }

    const startTime =
      roomStartTimes.get(roomId);

    console.log(
      'Sending timer-init:',
      roomId,
      startTime
    );

    socket.emit('timer-init', {
      startTime,
    });
  });

  socket.on('disconnect', () => {
    console.log(
      'Timer client disconnected:',
      socket.id
    );
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'timer-service',
  });
});

server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Timer Service listening on port ${PORT}`
    );
  }
);