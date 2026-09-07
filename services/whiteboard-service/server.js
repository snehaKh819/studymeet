import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { createClient } from 'redis';

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    },
    path: '/whiteboard/socket.io'
});

const redis = createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379
    }
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});

await redis.connect();

console.log('Connected to Redis');

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'whiteboard-service'
    });
});

const whiteboard = io.of('/whiteboard');

whiteboard.on('connection', (socket) => {

    console.log(
        'Whiteboard client connected:',
        socket.id
    );

    socket.on('join_whiteboard', async (roomId) => {

        if (!roomId) return;

        socket.join(roomId);

        console.log(
            `Socket ${socket.id} joined whiteboard room ${roomId}`
        );

        try {

            const key = `whiteboard:${roomId}`;

            const savedState = await redis.get(key);

            if (savedState) {

                console.log(
                    `Sending saved whiteboard state to ${socket.id}`
                );

                socket.emit(
                    'whiteboard_state',
                    JSON.parse(savedState)
                );

            } else {

                console.log(
                    `No saved whiteboard state for room ${roomId}`
                );

            }

        } catch (error) {

            console.error(
                'Failed to load whiteboard state:',
                error
            );

        }
    });

    socket.on(
        'whiteboard_change',
        async ({ roomId, state }) => {

            if (!roomId || !state) return;

            try {

                const key = `whiteboard:${roomId}`;

                await redis.set(
                    key,
                    JSON.stringify(state)
                );

                console.log(
                    `Whiteboard state saved for room ${roomId}`
                );

                socket
                    .to(roomId)
                    .emit(
                        'whiteboard_change',
                        state
                    );

            } catch (error) {

                console.error(
                    'Failed to save whiteboard state:',
                    error
                );

            }
        }
    );

    socket.on('leave_whiteboard', (roomId) => {

        if (!roomId) return;

        socket.leave(roomId);

        console.log(
            `Socket ${socket.id} left whiteboard room ${roomId}`
        );

    });

    socket.on('disconnect', () => {

        console.log(
            'Whiteboard client disconnected:',
            socket.id
        );

    });

});

const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {

    console.log(
        `Whiteboard service listening on port ${PORT}`
    );

});