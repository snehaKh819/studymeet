import {useEffect, useState} from 'react';
import api from './api';
import RoomLobby from './RoomLobby';

function Dashboard() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }

    api.get('/me')
      .then((response) => {
        setUser(response.data.user);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      })
      .catch(() => {
        localStorage.removeItem('user');
        window.location.href = '/login';
      });
  }, []);

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    api.post('/logout')
      .then(() => {
        localStorage.removeItem('user');
        window.location.href = '/login';
      })
      .catch(() => {
        localStorage.removeItem('user');
        window.location.href = '/login';
      });
  };

  return (
    <div style={{
      backgroundColor: '#f3e8ff',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      fontFamily: 'sans-serif',
      paddingTop: '100px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '920px',
        padding: '28px',
        marginBottom: '24px',
        borderRadius: '18px',
        background: 'white',
        boxShadow: '0 12px 32px rgba(88, 28, 135, 0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px'
      }}>
        <div>
          <h1 style={{ margin: 0, color: '#581c87', fontSize: '2rem' }}>Welcome back, {user.username}!</h1>
          <p style={{ marginTop: '10px', color: '#6b21a8', fontSize: '1rem' }}>Your study room dashboard👽</p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '12px 24px',
            backgroundColor: '#a855f7',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>

      <RoomLobby />
    </div>
  );
}

export default Dashboard;