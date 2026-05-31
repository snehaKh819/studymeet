import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import roomRoutes from './routes/rooms'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
})

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/rooms', roomRoutes)

// Socket.IO for chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id)
  
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId)
    console.log(`User ${socket.id} joined room ${roomId}`)
  })
  
  socket.on('send-message', (data: { roomId: string, message: string, userName: string }) => {
    io.to(data.roomId).emit('receive-message', {
      message: data.message,
      userName: data.userName,
      timestamp: new Date().toISOString()
    })
  })
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 4000

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})