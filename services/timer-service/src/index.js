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

const roomTimers = new Map();

function getTimer(roomId) {

  if (!roomTimers.has(roomId)) {

    roomTimers.set(roomId, {
      elapsedSeconds: 0,
      running: false,
      startedAt: null,
    });

  }

  return roomTimers.get(roomId);
}

function getElapsedSeconds(timer) {

  if (!timer.running || !timer.startedAt) {
    return timer.elapsedSeconds;
  }

  return (
    timer.elapsedSeconds +
    Math.floor(
      (Date.now() - timer.startedAt) / 1000
    )
  );
}

function broadcastTimerState(roomId) {

  const timer = getTimer(roomId);

  const elapsedSeconds =
    getElapsedSeconds(timer);

  io.to(roomId).emit('timer-state', {
    elapsedSeconds,
    running: timer.running,
  });
}


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

      console.log(
        'No roomId received'
      );

      return;
    }

    socket.join(roomId);

    const timer = getTimer(roomId);

    console.log(
      'Current timer:',
      roomId,
      {
        elapsedSeconds:
          getElapsedSeconds(timer),

        running:
          timer.running,
      }
    );

    socket.emit('timer-state', {

      elapsedSeconds:
        getElapsedSeconds(timer),

      running:
        timer.running,

    });

  });

  socket.on('start-timer', ({ roomId }) => {

    console.log(
      'Start timer request:',
      roomId,
      'from:',
      socket.id
    );

    if (!roomId) {
      return;
    }

    const timer = getTimer(roomId);

    if (timer.running) {

      console.log(
        'Timer already running:',
        roomId
      );

      return;
    }

    timer.startedAt = Date.now();

    timer.running = true;


    console.log(
      'Timer started:',
      roomId
    );


    broadcastTimerState(roomId);

  });

  socket.on('stop-timer', ({ roomId }) => {

    console.log(
      'Stop timer request:',
      roomId,
      'from:',
      socket.id
    );

    if (!roomId) {
      return;
    }

    const timer = getTimer(roomId);

    if (!timer.running) {

      console.log(
        'Timer already stopped:',
        roomId
      );

      return;
    }

    timer.elapsedSeconds =
      getElapsedSeconds(timer);

    timer.running = false;

    timer.startedAt = null;


    console.log(
      'Timer stopped:',
      roomId,
      'Elapsed:',
      timer.elapsedSeconds
    );


    broadcastTimerState(roomId);

  });

  socket.on('disconnect', () => {

    console.log(
      'Timer client disconnected:',
      socket.id
    );

  });

});

setInterval(() => {

  for (const [roomId, timer] of roomTimers) {

    if (timer.running) {

      io.to(roomId).emit('timer-tick', {

        elapsedSeconds:
          getElapsedSeconds(timer),

      });

    }

  }

}, 1000);

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