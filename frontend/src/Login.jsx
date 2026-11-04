import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './utils/api';
import './css/Login.css';

import loginBg from './assets/login-bg.jpg';

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      newErrors.password = 'Password is required.';
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!validate()) return;

    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email: email.trim(),
        password,
      });

      if (response.data.user) {
        localStorage.setItem(
          'user',
          JSON.stringify(response.data.user)
        );
      }

      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);

      setMessage(
        error.response?.data?.message ||
          'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="login-page"
      style={{
        backgroundImage: `url(${loginBg})`,
      }}
    >
      <div className="login-background" />

      <nav className="login-nav">
        <div className="brand">
          <img
            src="/favicon.svg"
            alt="StudyMeet"
            className="brand-logo"
          />

          <span>StudyMeet</span>
        </div>

        <button
          className="back-home"
          onClick={() => navigate('/')}
        >
          ← Home
        </button>
      </nav>

      <main className="login-content">
        <div className="login-card">

          <div className="login-heading">
            <h1>Welcome back</h1>

            <p className="login-subtitle">
              Sign in to continue to StudyMeet.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>

            <div className="form-group">
              <label htmlFor="email">
                Email address
              </label>

              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);

                  if (errors.email) {
                    setErrors({
                      ...errors,
                      email: '',
                    });
                  }
                }}
                className={
                  errors.email ? 'input-error' : ''
                }
              />

              {errors.email && (
                <span className="field-error">
                  {errors.email}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">
                Password
              </label>

              <div className="password-wrapper">
                <input
                  id="password"
                  type={
                    showPassword ? 'text' : 'password'
                  }
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);

                    if (errors.password) {
                      setErrors({
                        ...errors,
                        password: '',
                      });
                    }
                  }}
                  className={
                    errors.password
                      ? 'input-error'
                      : ''
                  }
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {errors.password && (
                <span className="field-error">
                  {errors.password}
                </span>
              )}
            </div>

            {message && (
              <div className="login-message">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              <span>
                {loading
                  ? 'Logging in...'
                  : 'Login'}
              </span>

              {!loading && (
                <span className="button-arrow">
                  →
                </span>
              )}
            </button>
          </form>

          <div className="register-prompt">
            <span>
              Don't have an account?
            </span>

            <button
              type="button"
              onClick={() => navigate('/register')}
            >
              Create account →
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
