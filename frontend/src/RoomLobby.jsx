import {useEffect, useState} from 'react';
import api from './api';

export default function RoomLobby() {
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/rooms')
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
      const response = await api.post('/rooms', { roomName });
      setRooms((prev) => [response.data.room, ...prev]);
      setRoomName('');
      setMessage('Room created successfully.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create room.');
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '760px', marginTop: '24px' }}>
      <div style={{ marginBottom: '24px', padding: '24px', borderRadius: '16px', background: 'white', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        <h2 style={{ margin: 0, color: '#581c87', fontSize: '1.6rem' }}>Study Lobby</h2>
        <p style={{ marginTop: '8px', color: '#6b21a8' }}>Create a room for your study session or join an active room below.</p>

        <form onSubmit={handleCreateRoom} style={{ marginTop: '20px' }}>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="New room name"
            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '12px' }}
          />
          <button type="submit" style={{ padding: '12px 20px', backgroundColor: '#a855f7', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>Create Room</button>
        </form>

        {message && <p style={{ marginTop: '14px', color: '#dc2626' }}>{message}</p>}
      </div>

      <div style={{ padding: '24px', borderRadius: '16px', background: 'white', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: 0, color: '#581c87', fontSize: '1.4rem' }}>Active Rooms</h3>
        {rooms.length === 0 ? (
          <p style={{ marginTop: '14px', color: '#6b21a8' }}>No active rooms yet. Create one to get started.</p>
        ) : (
          <div style={{ marginTop: '18px', display: 'grid', gap: '16px' }}>
            {rooms.map((room) => (
              <div key={room.id} style={{ padding: '18px', borderRadius: '14px', border: '1px solid #e5e7eb', background: '#faf5ff' }}>
                <h4 style={{ margin: 0, color: '#422b7f' }}>{room.roomName}</h4>
                <p style={{ margin: '8px 0 0', color: '#6b21a8' }}>Host: {room.host?.username || room.host?.email}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
