import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, VideoConference, useTrackToggle } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { getLiveKitToken } from './lib/livekit';
import ChatPanel from './ChatPanel';
import api from './utils/api';
import ParticipantList from './ParticipantList';

function RoomControls({ roomId, roomName, currentUser, onLeave, activePanel, onTogglePanel }) {
  const mic = useTrackToggle({
    source: Track.Source.Microphone,
  });

  const cam = useTrackToggle({
    source: Track.Source.Camera,
  });

  const featureButtons = [
    { label: 'Chat', value: 'chat', icon: '💬' },
    { label: 'Participants', value: 'participants', icon: '👥' },
    { label: 'Whiteboard', value: 'whiteboard', icon: '🖊' },
    { label: 'Notes', value: 'notes', icon: '📝' },
  ];

  return (
    <header className="meeting-toolbar">
      <div className="toolbar-left">
        <div className="studymeet-brand">
          <img className="brand-logo" src="/favicon.svg" alt="StudyMeet logo" />
          <span>StudyMeet</span>
        </div>
        <div className="toolbar-room-name" title={roomName || roomId}>
          {roomName || roomId}
        </div>
      </div>

      <div className="toolbar-right">
        <div className="toolbar-feature-buttons">
          {featureButtons.map((button) => (
            <button
              key={button.value}
              type="button"
              className={`feature-button ${activePanel === button.value ? 'active' : ''}`}
              onClick={() => onTogglePanel(button.value)}
            >
              <span>{button.icon}</span>
              {button.label}
            </button>
          ))}
        </div>

        <div className="toolbar-media-actions">
          <button
            type="button"
            onClick={() => mic.toggle()}
            className={`toolbar-icon-button ${mic.enabled ? 'mic-on' : 'mic-off'}`}
            title={mic.enabled ? 'Mute Microphone' : 'Unmute Microphone'}
            aria-label={mic.enabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {mic.enabled ? '🎤' : '🔇'}
          </button>

          <button
            type="button"
            onClick={() => cam.toggle()}
            className={`toolbar-icon-button ${cam.enabled ? 'cam-on' : 'cam-off'}`}
            title={cam.enabled ? 'Turn Camera Off' : 'Turn Camera On'}
            aria-label={cam.enabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {cam.enabled ? '📹' : '📷'}
          </button>

          <button type="button" className="toolbar-icon-button" title="Raise hand" aria-label="Raise hand">
            ✋
          </button>

          <button type="button" className="toolbar-icon-button" title="Timer" aria-label="Timer">
            ⏱
          </button>

          <button type="button" onClick={onLeave} className="leave-button">
            Leave
          </button>
        </div>
      </div>
    </header>
  );
}

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('');
  const [activePanel, setActivePanel] = useState(null);
  const [resolvedRoomId, setResolvedRoomId] = useState(roomId || '');

  const [currentUser] = useState(() => {
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
    let isMounted = true;

    const resolveRoom = async () => {
      if (!roomId) {
        setRoomName('');
        setResolvedRoomId('');
        return;
      }

      try {
        const response = await api.get(`/auth/rooms/${roomId}`);
        const nextRoom = response.data.room;
        if (!isMounted) return;
        setRoomName(nextRoom?.roomName || roomId);
        setResolvedRoomId(nextRoom?.id || roomId);
      } catch (lookupError) {
        if (lookupError.response?.status !== 404) {
          if (isMounted) {
            setRoomName(roomId);
            setResolvedRoomId(roomId);
          }
          return;
        }

        try {
          const roomsResponse = await api.get('/auth/rooms');
          const matchedRoom = roomsResponse.data.rooms?.find(
            (candidate) => candidate.id === roomId || candidate.roomName === roomId,
          );

          if (!isMounted) return;

          if (matchedRoom) {
            setRoomName(matchedRoom.roomName || roomId);
            setResolvedRoomId(matchedRoom.id || roomId);
            return;
          }

          setRoomName(roomId);
          setResolvedRoomId(roomId);
        } catch {
          if (isMounted) {
            setRoomName(roomId);
            setResolvedRoomId(roomId);
          }
        }
      }
    };

    resolveRoom();

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!resolvedRoomId) {
      return;
    }

    let isMounted = true;

    getLiveKitToken(resolvedRoomId)
      .then((tokenValue) => {
        if (!isMounted) return;
        console.log('LiveKit token received');
        setToken(tokenValue);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to get LiveKit token:', err);
        setError('Could not join room. Try again. 😓');
      });

    return () => {
      isMounted = false;
    };
  }, [resolvedRoomId]);

  const handleLeave = () => {
    navigate('/dashboard');
  };

  const handleTogglePanel = (panel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const renderDrawerContent = () => {
    switch (activePanel) {
      case 'chat':
        return <ChatPanel roomId={roomId} currentUser={currentUser || { username: 'Guest' }} />;
      case 'participants':
        return <ParticipantList />;
      case 'whiteboard':
        return (
          <div className="drawer-panel-placeholder">
            <div>
              <h3>Whiteboard</h3>
              <p>Coming soon</p>
            </div>
          </div>
        );
      case 'notes':
        return (
          <div className="drawer-panel-placeholder">
            <div>
              <h3>Notes</h3>
              <p>Coming soon</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const drawerTitle = {
    chat: 'Chat',
    participants: 'Participants',
    whiteboard: 'Whiteboard',
    notes: 'Notes',
  }[activePanel];

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
    <LiveKitRoom
      serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost/rtc/'}
      token={token}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={() => console.log('Disconnected from LiveKit')}
    >
      <div className="meeting-page">
        <RoomControls
          roomId={roomId}
          roomName={roomName}
          currentUser={currentUser || { username: 'Guest' }}
          onLeave={handleLeave}
          activePanel={activePanel}
          onTogglePanel={handleTogglePanel}
        />

        <div className="meeting-content">
          <main className="video-area">
            <VideoConference />
          </main>

          {activePanel && (
            <aside className="feature-drawer" aria-label={drawerTitle || 'Meeting drawer'}>
              <div className="drawer-header">
                <h3>{drawerTitle}</h3>
                <button type="button" className="drawer-close" onClick={() => setActivePanel(null)}>
                  ×
                </button>
              </div>
              <div className="drawer-panel">{renderDrawerContent()}</div>
            </aside>
          )}
        </div>
      </div>
    </LiveKitRoom>
  );
}

export default Room;
