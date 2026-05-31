import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import dotenv from 'dotenv'

dotenv.config()

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880'
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || ''
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || ''

export const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

export const createToken = (roomName: string, participantName: string) => {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '10m',
  })
  
  at.addGrant({ roomJoin: true, room: roomName })
  
  return at.toJwt()
}

export const createRoom = async (roomName: string) => {
  try {
    await roomService.createRoom({ name: roomName })
    return true
  } catch (error) {
    console.error('Error creating room:', error)
    return false
  }
}