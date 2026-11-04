import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './utils/api';
import './css/RoomLobby.css';

const buttonStyle = {
  padding: '10px 18px',
  backgroundColor: '#9147e8',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: '600',
};

export default function RoomLobby() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/auth/rooms')
      .then((response) => setRooms(response.data.rooms || []))
      .catch(() => setMessage('Unable to load rooms.'));
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!roomName.trim()) {
      setMessage('Room name is required.');
      return;
    }

    try {
      const response = await api.post('/auth/rooms', { roomName });

      setRooms((prev) => [response.data.room, ...prev]);
      setRoomName('');

      navigate(`/room/${response.data.room.id}`);
    } catch (error) {
      setMessage(
        error.response?.data?.message || 'Unable to create room.'
      );
    }
  };

  return (
    <div className="room-lobby">

      <div className="room-card">

        <h2 className="room-card-title">
          Study Lobby
        </h2>

        <p className="room-card-description">
          Create a room for your study session or join an active room below.
        </p>

        <form
          onSubmit={handleCreateRoom}
          className="create-room-form"
        >
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="New room name"
            className="room-input"
          />

          <button
            type="submit"
            className="room-button"
          >
            Create Room
          </button>
        </form>

        {message && (
          <p className="room-error">
            {message}
          </p>
        )}

      </div>

      <div className="room-card">

        <h3 className="room-card-title active-room-title">
          Active Rooms
        </h3>

        {rooms.length === 0 ? (
          <p className="room-card-description empty-rooms">
            No active rooms yet. Create one to get started.
          </p>
        ) : (

          <div className="active-room-list">

            {rooms.map((room) => (

              <div
                key={room.id}
                className="active-room-item"
              >

                <div className="room-info">

                  <h4>
                    {room.roomName}
                  </h4>

                  <p>
                    Host: {room.host?.username || room.host?.email}
                  </p>

                </div>

                <button
                  type="button"
                  className="room-button join-button"
                  onClick={() => navigate(`/room/${room.id}`)}
                >
                  Join Room
                </button>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>
  );
}
