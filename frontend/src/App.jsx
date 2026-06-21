import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { useState } from 'react';
import Register from './Register';
import Login from './Login';

function App() {
  const [hoveredTab, setHoveredTab] = useState(null);

  const getNavStyle = (isActive, tabId) => ({
    marginRight: tabId !== 'login' ? '20px' : '0px',
    textDecoration: 'none',
    fontSize: '16px',
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
        justifyContent: 'center',
        padding: '16px', 
        backgroundColor: 'rgba(255, 255, 255, 0.75)', 
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #e9d5ff', 
        zIndex: 10,
        fontFamily: 'sans-serif'
      }}>
        
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
      </nav>

      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <div style={{ 
            backgroundColor: "#f3e8ff", 
            height: "100vh", 
            width: "100vw",
            display: "flex", 
            flexDirection: "column",
            justifyContent: "center", 
            alignItems: "center",
            fontFamily: "sans-serif",
            boxSizing: "border-box"
          }}>
            <h1 style={{ color: '#581c87', fontSize: '3rem', marginBottom: '10px', textAlign: 'center' }}>
              Welcome to StudyMeet
            </h1>
            <p style={{ color: '#6b21a8', fontSize: '1.2rem', margin: 0, textAlign: 'center' }}>
              Collaborate, learn, and grow with your peers.
            </p>
          </div>
        } />
      </Routes>
    </Router>
  );
}

export default App;
