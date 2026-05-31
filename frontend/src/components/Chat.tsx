import { useState, useEffect } from 'react'
import io from 'socket.io-client'

interface Message {
  message: string
  userName: string
  timestamp: string
}

interface ChatProps {
  roomId: string
  userName: string
}

const socket = io('http://localhost:4000')

export default function Chat({ roomId, userName }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    socket.emit('join-room', roomId)
    
    socket.on('receive-message', (message: Message) => {
      setMessages(prev => [...prev, message])
    })
    
    return () => {
      socket.off('receive-message')
    }
  }, [roomId])

  const sendMessage = () => {
    if (!input.trim()) return
    socket.emit('send-message', { roomId, message: input, userName })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-gray-800">
      <div className="p-4 bg-gray-900 text-white font-semibold">
        Chat
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-semibold text-blue-400">{msg.userName}: </span>
            <span className="text-gray-300">{msg.message}</span>
            <span className="text-gray-500 text-xs ml-2">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}