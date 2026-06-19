import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Register from './Register';
import Login from './Login';

function App() {
  return (
    <Router>
      <nav style={{ backgroundColor: "lightblue", height: "100vh",padding: '20px', background: '#f4f4f4', textAlign: 'center' }}>
        <Link to="/register" style={{ marginRight: '15px' }}>Register</Link>
        <Link to="/login">Login</Link>
      </nav>

      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<h1 style={{ textAlign: 'center', marginTop: '5px' }}>Welcome to StudyMeet</h1>} />
      </Routes>
    </Router>
  );
}

export default App;