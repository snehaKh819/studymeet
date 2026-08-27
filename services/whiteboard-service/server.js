import express from 'express';
import http from 'http';
import cors from 'cors';
import {Server} from 'socket.io';

const app= express();

app.use(cors({
    origin: true,
    credentials: true
}));

const server = http.createServer(app);

const io=new Server(server,{
    cors:{
        origin: true,
        credentials: true
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'whiteboard-service'
    });
});

const whiteboard=io.of('/whiteboard');

whiteboard.on('connection', (socket) => {
    console.log("Whiteboard client connected: ", socket.id);

    socket.on("disconnect", () => {
        console.log("Whiteboard client disconnected: ", socket.id);
    });
});

const PORT=process.env.PORT||3003;

server.listen(PORT, () => {
    console.log(`Whiteboard service listening on port ${PORT}`);
});