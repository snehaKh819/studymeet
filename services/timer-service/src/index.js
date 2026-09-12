const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();

const PORT = process.env.PORT || 5003;

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || 'http://user-auth:5001';

const JWT_SECRET =
  process.env.JWT_SECRET || 'fallback_secret';

const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
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

  io.to(roomId).emit('timer-state', {

    elapsedSeconds:
      getElapsedSeconds(timer),

    running:
      timer.running,

  });
}

function getTokenFromSocket(socket) {

  const authToken =
    socket.handshake.auth?.token;

  if (authToken) {
    return authToken;
  }

  const cookieHeader =
    socket.handshake.headers.cookie || '';

  const cookies =
    cookieHeader
      .split(';')
      .reduce((acc, cookie) => {

        const [name, ...value] =
          cookie.trim().split('=');

        if (name) {

          acc[name] =
            decodeURIComponent(
              value.join('=')
            );

        }

        return acc;

      }, {});


  return cookies.token;
}

io.use((socket, next) => {

  try {

    const token =
      getTokenFromSocket(socket);


    if (!token) {

      console.log(
        'Timer connection rejected: No token'
      );

      return next(
        new Error('Authentication required')
      );

    }


    jwt.verify(
      token,
      JWT_SECRET,
      (err, user) => {

        if (err) {

          console.log(
            'Timer connection rejected: Invalid token'
          );

          return next(
            new Error('Invalid or expired token')
          );

        }


        socket.user = user;


        console.log(
          'Timer user authenticated:',
          user.userId
        );


        next();

      }
    );

  } catch (error) {

    console.error(
      'Socket authentication error:',
      error
    );

    next(
      new Error('Authentication failed')
    );

  }

});

async function isRoomHost(
  socket,
  roomId
) {

  try {

    const userId =
      socket.user?.userId;


    if (!userId) {

      console.log(
        'Host check failed: No userId'
      );

      return false;

    }


    /*
      Ask user-auth service for the room.

      This endpoint is already protected
      by JWT authentication.
    */

    const response =
      await fetch(
        `${AUTH_SERVICE_URL}/rooms/${roomId}`,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Bearer ${getTokenFromSocket(socket)}`,
          },
        }
      );


    if (!response.ok) {

      console.log(
        'Unable to get room:',
        response.status
      );

      return false;

    }


    const data =
      await response.json();


    const room =
      data.room;


    if (!room) {

      return false;

    }


    console.log(
      'Host authorization:',
      {
        userId,
        roomHostId: room.hostId,
        isHost: room.hostId === userId,
      }
    );


    return room.hostId === userId;

  } catch (error) {

    console.error(
      'Host verification error:',
      error
    );

    return false;

  }

}

io.on('connection', (socket) => {

  console.log(
    'Timer client connected:',
    socket.id,
    'user:',
    socket.user?.userId
  );

  socket.on(
    'join-room-timer',
    ({ roomId }) => {

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

      const timer =
        getTimer(roomId);


      console.log(
        'Sending timer state:',
        roomId,
        {
          elapsedSeconds:
            getElapsedSeconds(timer),

          running:
            timer.running,
        }
      );


      socket.emit(
        'timer-state',
        {
          elapsedSeconds:
            getElapsedSeconds(timer),

          running:
            timer.running,
        }
      );

    }
  );

  socket.on(
    'start-timer',
    async ({ roomId }) => {

      console.log(
        'Start timer request:',
        roomId,
        'from:',
        socket.id,
        'user:',
        socket.user?.userId
      );


      if (!roomId) {
        return;
      }

      const authorized =
        await isRoomHost(
          socket,
          roomId
        );


      if (!authorized) {

        console.log(
          'START DENIED - user is not host:',
          socket.user?.userId
        );

        socket.emit(
          'timer-error',
          {
            message:
              'Only the room host can start the timer.',
          }
        );

        return;

      }

      const timer =
        getTimer(roomId);


      if (timer.running) {

        return;

      }

      timer.startedAt =
        Date.now();

      timer.running = true;

      console.log(
        'Timer started:',
        roomId,
        'by host:',
        socket.user?.userId
      );

      broadcastTimerState(
        roomId
      );

    }
  );

  socket.on(
    'stop-timer',
    async ({ roomId }) => {

      console.log(
        'Stop timer request:',
        roomId,
        'from:',
        socket.id,
        'user:',
        socket.user?.userId
      );

      if (!roomId) {
        return;
      }

      const authorized =
        await isRoomHost(
          socket,
          roomId
        );

      if (!authorized) {

        console.log(
          'STOP DENIED - user is not host:',
          socket.user?.userId
        );

        socket.emit(
          'timer-error',
          {
            message:
              'Only the room host can stop the timer.',
          }
        );

        return;

      }

      const timer =
        getTimer(roomId);

      if (!timer.running) {

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
        timer.elapsedSeconds,
        'by host:',
        socket.user?.userId
      );


      broadcastTimerState(
        roomId
      );

    }
  );

  socket.on('disconnect', (reason) => {

    console.log(
      'Timer client disconnected:',
      socket.id,
      reason
    );

  });

});

setInterval(() => {

  for (
    const [roomId, timer]
    of roomTimers
  ) {

    if (timer.running) {

      io.to(roomId).emit(
        'timer-tick',
        {
          elapsedSeconds:
            getElapsedSeconds(timer),
        }
      );

    }

  }

}, 1000);

app.get(
  '/health',
  (req, res) => {

    res.json({
      status: 'healthy',
      service: 'timer-service',
    });

  }
);

server.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `Timer Service listening on port ${PORT}`
    );

  }
);