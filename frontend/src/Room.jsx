import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoConference, useTrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { getLiveKitToken } from './lib/livekit';
import ChatPanel from './ChatPanel';
import api from './utils/api';

function RoomControls({ roomId, roomName, currentUser, onLeave }) {

const mic = useTrackToggle({
  source: Track.Source.Microphone,
});

const cam = useTrackToggle({
  source: Track.Source.Camera,
});

  return (
    <section className="room-header">
      <div>
        <p className="room-label">Room</p>
        <h2 className="room-title">{roomName || roomId}</h2>
        <p className="room-subtitle">{currentUser?.username || currentUser?.email || 'Guest'} is connected</p>
      </div>
      <div className="room-controls">

<button
  onClick={() => {
    mic.toggle();
  }}
  className={`control-button ${mic.enabled ? "mic-on" : "mic-off"}`}
  title={mic.enabled ? "Mute Microphone" : "Unmute Microphone"}
>
  {mic.enabled ? "🎤" : "🔇"}
</button>

<button
  onClick={() => {
    cam.toggle();
  }}
  className={`control-button ${cam.enabled ? "cam-on" : "cam-off"}`}
  title={cam.enabled ? "Turn Camera Off" : "Turn Camera On"}
>
   {cam.enabled ? "📹" : "📷"}
</button>

        <button onClick={onLeave} className="control-button disconnect">
          Leave Room
        </button>
      </div>
    </section>
  );
}

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('');
  
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && storedUser !== 'undefined') {
      try {
        return JSON.parse(storedUser);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    getLiveKitToken(roomId)
      .then((token) => {
        console.log('LiveKit token received');
        setToken(token);
      })
      .catch((err) => {
        console.error('Failed to get LiveKit token:', err);
        setError('Could not join room. Try again. 😓');
      });
  }, [roomId]);

  useEffect(() => {
    api.get(`/auth/rooms/${roomId}`)
      .then((response) => setRoomName(response.data.room?.roomName || ''))
      .catch(() => setRoomName(''));
  }, [roomId]);

  const handleLeave = () => {
    navigate('/dashboard');
  };

  if (error) {
    return (
      <div className="room-status-card room-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="room-status-card room-loading">
        <p>Connecting to room... Please wait.🤗</p>
      </div>
    );
  }

  return (
    <div className="room-page">
      <main className="room-main">
        <LiveKitRoom
          serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost/rtc/'}
          token={token}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={() => console.log('Disconnected from LiveKit')}
        >
          <RoomControls 
            roomId={roomId} 
            roomName={roomName}
            currentUser={currentUser || { username: 'Guest' }} 
            onLeave={handleLeave}
          />
          <div className="room-video">
            <VideoConference />
          </div>
        </LiveKitRoom>
      </main>
      <aside className="chat-panel-wrapper">
        <ChatPanel roomId={roomId} currentUser={currentUser || { username: 'Guest' }} />
      </aside>
    </div>
  );
}

export default Room;
