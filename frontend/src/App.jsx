import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { useState } from 'react';
import Register from './Register';
import Login from './Login';
import Dashboard from './Dashboard';
import ProtectedRoute from './ProtectedRoute';
import Room from './Room';

function App() {
  const [hoveredTab, setHoveredTab] = useState(null);

  const getNavStyle = (isActive, tabId) => ({
    marginLeft: '20px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '600',
    padding: '8px 4px',
    position: 'relative',
    transition: 'all 0.2s ease',
    color: isActive ? '#581c87' : hoveredTab === tabId ? '#9333ea' : '#6b7280',
    borderBottom: isActive ? '3px solid #a855f7' : '3px solid transparent',
    borderRadius: '2px'
  });

  return (
    <Router>
      <nav style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '14px 40px', 
        backgroundColor: 'rgba(255, 255, 255, 0.85)', 
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #e9d5ff', 
        zIndex: 10,
        fontFamily: 'sans-serif',
        boxSizing: 'border-box'
      }}>
        
        <NavLink 
          to="/" 
          style={{ textDecoration: 'none', color: '#581c87', fontWeight: '800', fontSize: '20px' }}
        >
          StudyMeet
        </NavLink>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <NavLink 
            to="/" 
            style={({ isActive }) => getNavStyle(isActive, 'home')}
            onMouseEnter={() => setHoveredTab('home')}
            onMouseLeave={() => setHoveredTab(null)}
          >
            Home
          </NavLink>

          <NavLink 
            to="/register" 
            style={({ isActive }) => getNavStyle(isActive, 'register')}
            onMouseEnter={() => setHoveredTab('register')}
            onMouseLeave={() => setHoveredTab(null)}
          >
            Register
          </NavLink>

          <NavLink 
            to="/login" 
            style={({ isActive }) => getNavStyle(isActive, 'login')}
            onMouseEnter={() => setHoveredTab('login')}
            onMouseLeave={() => setHoveredTab(null)}
          >
            Login
          </NavLink>
        </div>
      </nav>

      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/room/:roomId" element={<ProtectedRoute><Room /></ProtectedRoute>} />
        <Route
          path="/"
          element={
            <div style={{ 
              backgroundColor: "#f3e8ff", 
              minHeight: "100vh", 
              width: "100vw",
              display: "flex", 
              flexDirection: "column",
              justifyContent: "center", 
              alignItems: "center",
              fontFamily: "sans-serif",
              boxSizing: "border-box",
              padding: "20px"
            }}>
              <h1 style={{ 
                color: '#581c87', 
                fontSize: 'clamp(2.5rem, 6vw, 3.5rem)', 
                marginBottom: '16px', 
                fontWeight: '800',
                textAlign: 'center',
                lineHeight: '1.2',
                letterSpacing: '-0.5px'
              }}>
                Welcome to StudyMeet
              </h1>
              
              <p style={{ 
                color: '#6b21a8', 
                fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)', 
                margin: '0 0 32px 0', 
                textAlign: 'center',
                maxWidth: '540px',
                lineHeight: '1.5'
              }}>
                Collaborate, track your milestones, learn, and grow together with your peers.
              </p>

              <NavLink
                to="/login"
                style={{
                  padding: '12px 28px',
                  backgroundColor: '#a855f7',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '15px',
                  boxShadow: '0 4px 12px rgba(168, 85, 247, 0.25)',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#9333ea'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#a855f7'}
              >
                Get Started
              </NavLink>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;