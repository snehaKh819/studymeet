import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Register from './Register';
import Login from './Login';

function App() {
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
        <Link to="/" style={{ marginRight: '20px', textDecoration: 'none', color: '#581c87', fontWeight: '500' }}>
          Home
        </Link>
        <Link to="/register" style={{ marginRight: '20px', textDecoration: 'none', color: '#7e22ce', fontWeight: '600' }}>
          Register
        </Link>
        <Link to="/login" style={{ textDecoration: 'none', color: '#7e22ce', fontWeight: '600' }}>
          Login
        </Link>
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