import { useState } from 'react';
import API from './api';

function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await API.post('/register', { email, password, username });
      localStorage.setItem('token',response.data.token);
      localStorage.setItem('user',JSON.stringify(response.data.user));
      window.location.href='/dashboard';
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div style={{ 
      backgroundColor: "#f3e8ff", 
      height: "100vh", 
      width: "100vw",
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center",
      fontFamily: "sans-serif",
      boxSizing: "border-box"
    }}>
      
      <div style={{ 
        backgroundColor: "#ffffff", 
        padding: '40px', 
        borderRadius: '12px', 
        boxShadow: '0 4px 10px rgba(88, 28, 135, 0.08)', 
        width: '100%',
        maxWidth: '380px',
        boxSizing: 'border-box'
      }}>
        
        <h2 style={{ marginTop: 0, marginBottom: '24px', textAlign: 'center', color: '#581c87' }}>
          Create StudyMeet Account
        </h2>
        
        <form onSubmit={handleRegister}>
          <label style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b21a8'
          }}>
            Username
          </label>
          <input type="text" placeholder="yourname" value={username} onChange={(e)=>setUsername(e.target.value)} required
          style={{
            display: 'block',
            width: '100%',
            marginBottom: '16px',
            padding: '10px',
            borderRadius: '6px',  
            border: '1px solid #d8b4fe',
            boxSizing: 'border-box',
            background: 'white',
            color: 'black'
          }}
          />

          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#6b21a8' }}>
            Email Address
          </label>
          <input 
            type="email" 
            placeholder="name@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            style={{ 
              display: 'block', 
              width: '100%', 
              marginBottom: '16px', 
              padding: '10px', 
              borderRadius: '6px', 
              background: 'rgb(255,255,255,0.9)',
              color:'black',
              border: '1px solid #d8b4fe', 
              boxSizing: 'border-box'
            }}
          />
          
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#6b21a8' }}>
            Password
          </label>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={{ 
              display: 'block', 
              width: '100%', 
              marginBottom: '24px', 
              padding: '10px', 
              background: 'rgb(255,255,255,0.9)',
              color:'black',
              borderRadius: '6px', 
              border: '1px solid #d8b4fe',
              boxSizing: 'border-box'
            }}
          />
          
          {error && <p style={{ color: 'red', fontSize: '13px', marginBottom: '12px'}}>{error}</p>}

          <button 
            type="submit" 
            style={{ 
              width: '100%',
              padding: '12px', 
              backgroundColor: '#a855f7', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#9333ea'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#a855f7'}
          >
            Register
          </button>
        </form>
      </div>
    </div>
  );
}

export default Register;