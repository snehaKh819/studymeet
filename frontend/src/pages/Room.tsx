import { useLocation, useParams } from 'react-router-dom'
import VideoConferenceComponent from '../components/VideoConference'
import Chat from '../components/Chat'

export default function Room() {
  const { roomId } = useParams()
  const location = useLocation()
  const { token, livekitUrl, participantName } = location.state || {}

  if (!token) {
    return <div className="text-center p-8">No token found. Please go back and join a room.</div>
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-gray-900 text-white p-4">
        <h1 className="text-xl">Room: {roomId}</h1>
        <p className="text-sm text-gray-400">Logged in as: {participantName}</p>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          <VideoConferenceComponent token={token} livekitUrl={livekitUrl} />
        </div>
        <div className="w-80 border-l border-gray-700">
          <Chat roomId={roomId!} userName={participantName} />
        </div>
      </div>
    </div>
  )
}