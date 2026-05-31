import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function JoinRoom() {
  const [roomId, setRoomId] = useState('')
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const navigate = useNavigate()

  const createRoom = async () => {
    setIsCreating(true)
    try {
      const response = await fetch('http://localhost:4000/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Study Room' })
      })
      const data = await response.json()
      navigate(`/room/${data.roomId}`, { state: { participantName: name || 'Anonymous' } })
    } catch (error) {
      console.error('Error creating room:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const joinRoom = async () => {
    if (!roomId) return
    try {
      const response = await fetch('http://localhost:4000/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, participantName: name || 'Anonymous' })
      })
      const data = await response.json()
      if (data.token) {
        navigate(`/room/${roomId}`, { 
          state: { 
            token: data.token,
            livekitUrl: data.livekitUrl,
            participantName: data.participantName
          } 
        })
      }
    } catch (error) {
      console.error('Error joining room:', error)
      alert('Room not found!')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-96">
        <h1 className="text-3xl font-bold text-center mb-8">StudyMeet</h1>
        
        <div className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <input
              type="text"
              placeholder="Room ID (to join)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <button
            onClick={joinRoom}
            className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition"
          >
            Join Room
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>
          
          <button
            onClick={createRoom}
            disabled={isCreating}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create New Room'}
          </button>
        </div>
      </div>
    </div>
  )
}