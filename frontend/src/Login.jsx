import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from './utils/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await api.post('/auth/login', { email, password });
      const userPayload = response.data.user;
      if (userPayload) {
        localStorage.setItem('user', JSON.stringify(userPayload));
      }
      navigate('/dashboard');
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '120px auto 50px auto', padding: '20px', border: '1px solid #e9d5ff', borderRadius: '12px', fontFamily: 'sans-serif', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      <h2 style={{ color: '#581c87', marginTop: 0 }}>Sign In</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontWeight: '600', color: '#4b5563', fontSize: '14px' }}>Email Address</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', marginTop: '6px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: '600', color: '#4b5563', fontSize: '14px' }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', marginTop: '6px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', backgroundColor: '#a855f7', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s' }}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      {message && <p style={{ marginTop: '15px', color: 'red', fontSize: '14px', textAlign: 'center' }}>{message}</p>}
    </div>
  );
}