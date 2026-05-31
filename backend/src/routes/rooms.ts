import { Router } from 'express'
import { prisma } from '../db'
import { createRoom, createToken } from '../services/livekit'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

// Create a new room
router.post('/create', async (req, res) => {
  try {
    const { name } = req.body
    const roomId = uuidv4()
    
    // Create in LiveKit
    await createRoom(roomId)
    
    // Save to database
    const room = await prisma.room.create({
      data: {
        id: roomId,
        name: name || `Study Room ${roomId.slice(0, 6)}`
      }
    })
    
    res.json({ roomId: room.id, name: room.name })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to create room' })
  }
})

// Join an existing room
router.post('/join', async (req, res) => {
  try {
    const { roomId, participantName } = req.body
    
    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { id: roomId }
    })
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    
    // Add participant to database
    const participant = await prisma.participant.create({
      data: {
        name: participantName || `User_${Math.floor(Math.random() * 10000)}`,
        roomId: room.id
      }
    })
    
    // Generate LiveKit token
    const token = createToken(roomId, participant.name)
    
    res.json({
      token,
      roomId: room.id,
      participantName: participant.name,
      livekitUrl: process.env.LIVEKIT_URL
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to join room' })
  }
})

// Get room info
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: true }
    })
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    
    res.json(room)
  } catch (error) {
    res.status(500).json({ error: 'Failed to get room info' })
  }
})

export default router