import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './utils/api';
import './css/Register.css';

import logo from './assets/vite.svg';
import registerBg from './assets/register-bg.jpg';

export default function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};

    if (!username.trim()) {
      newErrors.username = 'Username is required.';
    } else if (username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters.';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      newErrors.username =
        'Username can only contain letters, numbers and underscores.';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (password.length < 8) {
      newErrors.password =
        'Password must contain at least 8 characters.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
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
      const response = await api.post('/auth/register', {
        username: username.trim(),
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
      console.error('Registration error:', error);

      setMessage(
        error.response?.data?.message ||
          'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="register-page"
      style={{
        backgroundImage: `url(${registerBg})`,
      }}
    >
      <div className="register-background" />

      <nav className="register-nav">
        <div className="brand">
          <img src="/favicon.svg" alt="StudyMeet" className="brand-logo" />
          <span>StudyMeet</span>
        </div>

        <button
          className="back-home"
          onClick={() => navigate('/')}
        >
          ← Home
        </button>
      </nav>

      <main className="register-content">
        <div className="register-card">
          <div className="register-heading">
            <h1>Create your account</h1>

            <p className="register-subtitle">
              Join StudyMeet and start studying together.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="username">
                Username
              </label>

              <input
                id="username"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);

                  if (errors.username) {
                    setErrors({
                      ...errors,
                      username: '',
                    });
                  }
                }}
                className={
                  errors.username ? 'input-error' : ''
                }
              />

              {errors.username && (
                <span className="field-error">
                  {errors.username}
                </span>
              )}
            </div>

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
                  placeholder="Create a password"
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
                    errors.password ? 'input-error' : ''
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

            <div className="form-group">
              <label htmlFor="confirmPassword">
                Confirm password
              </label>

              <div className="password-wrapper">
                <input
                  id="confirmPassword"
                  type={
                    showConfirmPassword
                      ? 'text'
                      : 'password'
                  }
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);

                    if (errors.confirmPassword) {
                      setErrors({
                        ...errors,
                        confirmPassword: '',
                      });
                    }
                  }}
                  className={
                    errors.confirmPassword
                      ? 'input-error'
                      : ''
                  }
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(
                      !showConfirmPassword
                    )
                  }
                >
                  {showConfirmPassword
                    ? 'Hide'
                    : 'Show'}
                </button>
              </div>

              {errors.confirmPassword && (
                <span className="field-error">
                  {errors.confirmPassword}
                </span>
              )}
            </div>

            {message && (
              <div className="register-message">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="register-button"
              disabled={loading}
            >
              <span>
                {loading
                  ? 'Creating account...'
                  : 'Create account'}
              </span>

              {!loading && <span className="button-arrow">→</span>}
            </button>
          </form>

          <div className="login-prompt">
            <span>Already have an account?</span>

            <button
              type="button"
              onClick={() => navigate('/login')}
            >
              Login →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}