import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoConference, useLocalParticipant, useTrackToggle } from '@livekit/components-react';
import '@livekit/components-styles';
import { getLiveKitToken } from './lib/livekit';
import ChatPanel from './ChatPanel';
import { Track } from 'livekit-client';
import api from './utils/api';

function RoomControls({ roomId, roomName, currentUser, onLeave }) {
  const { isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const micToggle = useTrackToggle({ source: Track.Source.Microphone });
  const camToggle = useTrackToggle({ source: Track.Source.Camera });

  const handleMicToggle = () => {
    if (micToggle.toggle) {
      micToggle.toggle();
    }
  };

  const handleCamToggle = () => {
    if (camToggle.toggle) {
      camToggle.toggle();
    }
  };

  return (
    <section className="room-header">
      <div>
        <p className="room-label">Room</p>
        <h2 className="room-title">{roomName || roomId}</h2>
        <p className="room-subtitle">{currentUser?.username || currentUser?.email || 'Guest'} is connected</p>
      </div>
      <div className="media-controls">
        <button onClick={handleMicToggle} className={`control-button ${isMicrophoneEnabled ? 'active' : ''}`}>
          {isMicrophoneEnabled ? '🎤' : '🔇'}
        </button>
        <button onClick={handleCamToggle} className={`control-button ${isCameraEnabled ? 'active' : ''}`}>
          {isCameraEnabled ? '📷' : '📹'}
        </button>
        <button onClick={onLeave} className="control-button disconnect">
          Leave
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
      .then(setToken)
      .catch(() => setError('Could not join room. Try again. 😓'));
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
        >
          <RoomControls 
            roomId={roomId} 
            roomName={roomName}
            currentUser={currentUser || { username: 'Guest' }} 
            onLeave={handleLeave}
          />
          <div className="room-video">
            <VideoConference showControls={false} />
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
