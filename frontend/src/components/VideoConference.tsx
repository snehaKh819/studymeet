import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react'
import '@livekit/components-styles'

interface VideoConferenceProps {
  token: string
  livekitUrl: string
}

export default function VideoConferenceComponent({ token, livekitUrl }: VideoConferenceProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      video={true}
      audio={true}
      className="h-full"
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}