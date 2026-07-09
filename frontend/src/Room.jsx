import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LiveKitRoom, VideoConference, useDisconnectButton, useLocalParticipant, useTrackToggle } from '@livekit/components-react';
import '@livekit/components-styles';
import { getLiveKitToken } from './lib/livekit';
import ChatPanel from './ChatPanel';
import {Track} from 'livekit-client';

function RoomControls({ roomId, currentUser }) {
  const { isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const { buttonProps: micButtonProps, enabled: micEnabled } = useTrackToggle({ source: Track.Source.Microphone });
  const { buttonProps: camButtonProps, enabled: camEnabled } = useTrackToggle({ source: Track.Source.Camera });
  const { buttonProps: disconnectButtonProps } = useDisconnectButton();

  return (
    <section className="room-header">
      <div>
        <p className="room-label">Room</p>
        <h2 className="room-title">{roomId}</h2>
        <p className="room-subtitle">{currentUser?.username || currentUser?.email || 'Guest'} is connected</p>
      </div>
      <div className="media-controls">
        <button {...micButtonProps} className={`control-button ${micEnabled ? 'active' : ''}`}>
          {micEnabled ? 'Mute' : 'Unmute'}
        </button>
        <button {...camButtonProps} className={`control-button ${camEnabled ? 'active' : ''}`}>
          {camEnabled ? 'Camera Off' : 'Camera On'}
        </button>
        <button {...disconnectButtonProps} className="control-button disconnect">
          Disconnect
        </button>
      </div>
    </section>
  );
}

function Room() {
  const { roomId } = useParams();
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');
  
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
          video={false}
          audio={false}
        >
          <RoomControls roomId={roomId} currentUser={currentUser || { username: 'Guest' }} />
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
