const express=require('express');
const {createServer}=require('http');
const {Server}=require('socket.io');
const Redis=require('ioredis');
const jwt=require('jsonwebtoken');

const app=express();
const httpServer=createServer(app);

const publisher=new Redis({
    host: process.env.REDIS_HOST || redis,
    port: 6397
});
const subscriber=new Redis({
    host: process.env.REDIS_HOST || redis,
    port: 6397
});

const io=new Server(httpServer,{
    cors: {
        origin: '*',
        methods: ['GET','POST']
    }
});

io.use((socket,next)=>{
    const token=socket.handshake.query.token;
    if(!token){
        return next(new Error('No token provided'));
    }
    try{
        const decoded=jwt.verify(token,process.env.JWT_SECRET);
        socket.user=decoded;
        next();
    }
    catch(err){
        next(new Error('Invalid token'));
    }
});

subscriber.on('message',(channel,message)=>{
    const roomId=channel.replace('room:','');
    const parsedMessage=JSON.parse(message);
    io.to(roomId).emit('message',parsedMessage);
});

io.on('connection',(socket)=>{
    console.log(`User connected: ${socket.user.username} (${socket.id})`);
    socket.on('joinRoom',(roomId)=>{
        socket.join(roomId);
        subscriber.subscribe(`room:${roomId}`);
        console.log(`${socket.user.username} joined room ${roomId}`);
        socket.to(roomId).emit('user_joined',{
            username: socket.user.username,
            timestamp: new Date().toISOString()
        })
    });
});

socket.on('message',({roomId,text})=>{
    const messagePayload={
        username: socket.user.username,
        text,
        roomId,
        timestamp: new Date().toISOString()
    };
    publisher.publish(`room:${roomId}`,JSON.stringify(messagePayload));
});

socket.on('leave_room',(roomId)=>{
    socket.leave(roomId);
    socket.to(roomId).emit('user_left',{
        username: socket.user.username,
        timestamp: new Date().toISOString()
    });
    console.log(`${socket.user.username} left room ${roomId}`);
    socket.on('disconnect',()=>{
        console.log(`User disconnected: ${socket.user.username}`);
    });
});

app.get('/health',(req,res)=>res.json({status:'ok'}));

const PORT=process.env.PORT || 3002;
httpServer.listen(PORT,()=>{
    console.log(`Chat service running on port ${PORT}`);
});