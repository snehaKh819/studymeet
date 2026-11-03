import { useEffect, useState } from 'react';
import api from './utils/api';
import RoomLobby from './RoomLobby';
import './css/Dashboard.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');

    if (userData && userData !== 'undefined') {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data from localStorage', e);
      }
    }

    api.get('/auth/me')
      .then((response) => {
        if (response.data && response.data.user) {
          setUser(response.data.user);
          localStorage.setItem(
            'user',
            JSON.stringify(response.data.user)
          );
        } else {
          throw new Error('User data missing from response');
        }
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
    api.post('/auth/logout')
      .then(() => {
        localStorage.removeItem('user');
        window.location.href = '/login';
      })
      .catch(() => {
        localStorage.removeItem('user');
        window.location.href = '/login';
      });
  };

  const userInitial = user.username
    ? user.username.charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="dashboard-page">

      <nav className="dashboard-navbar">

        <div className="dashboard-brand">
          <img src="/favicon.svg" alt="StudyMeet Logo" />
          <span>StudyMeet</span>
        </div>

        <div className="profile-container">

          <button
            className="profile-button"
            onClick={() => setShowProfile(!showProfile)}
            aria-label="Open profile menu"
          >
            {userInitial}
          </button>

          {showProfile && (
            <div className="profile-dropdown">

              <div className="profile-info">

                <div className="profile-avatar">
                  {userInitial}
                </div>

                <div className="profile-details">
                  <h3>{user.username}</h3>
                  <p>{user.email}</p>
                </div>

              </div>

              <div className="profile-divider"></div>

              <button
                className="profile-logout"
                onClick={handleLogout}
              >
                Logout
              </button>

            </div>
          )}

        </div>

      </nav>

      <main className="dashboard-content">

        <section className="welcome-card">

          <div className="welcome-content">

            <p className="dashboard-subtitle">
              STUDY TOGETHER. GROW TOGETHER.
            </p>

            <h1>
              Welcome back,
              <br />
              <span>{user.username}!</span>
            </h1>

            <p className="dashboard-description">
              Your study room dashboard
            </p>

          </div>

        </section>

        <section className="room-section">
          <RoomLobby />
        </section>

      </main>

    </div>
  );
}

export default Dashboard;