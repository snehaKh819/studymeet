import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './css/Home.css';

function Home() {
  const navigate = useNavigate();
  const [showGetStarted, setShowGetStarted] = useState(false);

  const handleLogin = () => {
    setShowGetStarted(false);
    navigate('/login');
  };

  const handleRegister = () => {
    setShowGetStarted(false);
    navigate('/register');
  };

  return (
    <div className="home-page">

      <nav className="home-navbar">
        <div className="brand">
          <img src="/favicon.svg" alt="StudyMeet" className="brand-logo" />
          <span>StudyMeet</span>
        </div>

        <button
          className="navbar-get-started"
          onClick={() => setShowGetStarted(true)}
        >
          Get Started
        </button>
      </nav>


      <section className="hero-section">

        <div className="hero-overlay"></div>

        <div className="hero-content">

          <div className="hero-badge">
            <span className="badge-dot"></span>
            Study together. Stay focused.
          </div>

          <h1>
            Study better,
            <br />
            <span>together.</span>
          </h1>

          <p>
            A calm space to meet your friends, study together,
            collaborate, and stay focused.
          </p>

          <div className="hero-features">
            <div>
              <span>◉</span>
              Study rooms
            </div>

            <div>
              <span>✦</span>
              Real-time collaboration
            </div>

            <div>
              <span>◦</span>
              Stay focused
            </div>
          </div>

        </div>

        <div className="scroll-indicator">
          <span></span>
          Scroll to explore
        </div>

      </section>


      <section className="intro-section">

        <div className="section-heading">
          <span className="section-label">WELCOME TO STUDYMEET</span>

          <h2>
            A better way to
            <br />
            <span>study together.</span>
          </h2>

          <p>
            StudyMeet brings your study group into one calm,
            focused space. Create a room, invite your friends,
            and work together without distractions.
          </p>
        </div>

      </section>


      <section className="polaroid-section">

        <div className="section-heading center-heading">
          <span className="section-label">YOUR STUDY SPACE</span>

          <h2>
            Everything you need
            <br />
            <span>to stay focused.</span>
          </h2>
        </div>

        <div className="polaroid-container">

          <div className="polaroid polaroid-left">
            <div className="polaroid-image timer-polaroid">
              <div className="mini-timer">
                <span className="timer-label">FOCUS SESSION</span>
                <strong>00:42:18</strong>
                <span className="timer-status">
                  ● Everyone focused
                </span>
              </div>
            </div>

            <div className="polaroid-caption">
              <h3>Focus together.</h3>
              <p>Keep everyone on the same timer.</p>
            </div>
          </div>


          <div className="polaroid polaroid-center">
            <div className="polaroid-image room-polaroid">

              <div className="fake-room-window">

                <div className="fake-room-header">
                  <span>DSA Grind</span>
                  <span>● 4</span>
                </div>

                <div className="fake-video-grid">
                  <div className="fake-user"></div>
                  <div className="fake-user"></div>
                  <div className="fake-user"></div>
                  <div className="fake-user"></div>
                </div>

              </div>

            </div>

            <div className="polaroid-caption">
              <h3>Study together.</h3>
              <p>Create a room and bring your friends in.</p>
            </div>
          </div>


          <div className="polaroid polaroid-right">
            <div className="polaroid-image collaboration-polaroid">

              <div className="collaboration-content">
                <span>✦</span>
                <strong>Collaborate</strong>
                <p>Chat • Whiteboard • Notes</p>
              </div>

            </div>

            <div className="polaroid-caption">
              <h3>Everything in one place.</h3>
              <p>Work together without switching tabs.</p>
            </div>
          </div>

        </div>

      </section>


      <section className="timer-section">

        <div className="timer-content">

          <span className="section-label">FOCUS TIMER</span>

          <h2>
            Stay focused.
            <br />
            <span>Stay together.</span>
          </h2>

          <p>
            Start a study session and let everyone in the room
            follow the same synchronized timer. When the host
            pauses or resumes, everyone stays in sync.
          </p>

          <div className="timer-points">
            <div>
              <span>✓</span>
              Synchronized for everyone
            </div>

            <div>
              <span>✓</span>
              Host-controlled sessions
            </div>

            <div>
              <span>✓</span>
              Simple and distraction-free
            </div>
          </div>

        </div>


        <div className="large-timer-card">

          <div className="timer-glow"></div>

          <span className="large-timer-label">
            FOCUS SESSION
          </span>

          <div className="large-timer">
            00:42:18
          </div>

          <div className="large-timer-status">
            <span></span>
            Session in progress
          </div>

          <div className="fake-timer-controls">
            <button>Ⅱ</button>
            <button>↻</button>
          </div>

        </div>

      </section>


      <section className="rooms-section">

        <div className="section-heading center-heading">

          <span className="section-label">
            STUDY ROOMS
          </span>

          <h2>
            Find your
            <br />
            <span>study space.</span>
          </h2>

          <p>
            Create a room for your study group or join your
            friends and start learning together.
          </p>

        </div>


        <div className="rooms-container">

          <div className="study-room-card">
            <div className="room-card-top">
              <span className="room-status"></span>
              LIVE
            </div>

            <h3>DSA Grind</h3>

            <p>
              Daily problem solving session
            </p>

            <div className="room-card-bottom">
              <span>● 4 studying</span>
              <span>Focus</span>
            </div>
          </div>


          <div className="study-room-card featured-room">

            <div className="room-card-top">
              <span className="room-status"></span>
              LIVE
            </div>

            <h3>GATE 2027</h3>

            <p>
              Prepare together. Stay consistent.
            </p>

            <div className="room-card-bottom">
              <span>● 6 studying</span>
              <span>GATE</span>
            </div>

          </div>


          <div className="study-room-card">

            <div className="room-card-top">
              <span className="room-status"></span>
              LIVE
            </div>

            <h3>Late Night Study</h3>

            <p>
              Quiet study session with friends
            </p>

            <div className="room-card-bottom">
              <span>● 3 studying</span>
              <span>Focus</span>
            </div>

          </div>

        </div>

      </section>


      <section className="how-section">

        <div className="section-heading center-heading">

          <span className="section-label">
            HOW IT WORKS
          </span>

          <h2>
            Three simple steps.
          </h2>

        </div>


        <div className="steps-container">

          <div className="step">
            <div className="step-number">01</div>

            <h3>Create a room</h3>

            <p>
              Create your own study space and give your
              session a name.
            </p>
          </div>


          <div className="step-line"></div>


          <div className="step">
            <div className="step-number">02</div>

            <h3>Invite your friends</h3>

            <p>
              Share the room and bring your study group
              together.
            </p>
          </div>


          <div className="step-line"></div>


          <div className="step">
            <div className="step-number">03</div>

            <h3>Stay focused</h3>

            <p>
              Use the timer, chat, whiteboard and other
              tools to study together.
            </p>
          </div>

        </div>

      </section>


      <footer className="home-footer">

        <div className="footer-main">

          <div className="footer-brand">

            <div className="brand">
              <img
                src="/favicon.svg"
                alt="StudyMeet"
                className="brand-logo"
              />

              <span>StudyMeet</span>
            </div>

            <p>
              Study better. Together.
            </p>

            <span className="footer-small">
              A collaborative space for focused study sessions.
            </span>

          </div>


          <div className="footer-column">

            <h4>PRODUCT</h4>

            <span>Study Rooms</span>
            <span>Focus Timer</span>
            <span>Chat</span>
            <span>Whiteboard</span>

          </div>


          <div className="footer-column">

            <h4>STUDYMEET</h4>

            <span>How it works</span>
            <span>Features</span>
            <span>About</span>
            <span>Contact</span>

          </div>


          <div className="footer-column">

            <h4>ACCOUNT</h4>

            <button onClick={handleLogin}>
              Login
            </button>

            <button onClick={handleRegister}>
              Create account
            </button>

          </div>

        </div>


        <div className="footer-bottom">

          <span>
            © 2026 StudyMeet. All rights reserved.
          </span>

          <span>
            Made for better study sessions.
          </span>

        </div>

      </footer>


      {showGetStarted && (

        <div
          className="modal-backdrop"
          onClick={() => setShowGetStarted(false)}
        >

          <div
            className="get-started-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <button
              className="modal-close"
              onClick={() => setShowGetStarted(false)}
            >
              ×
            </button>

            <h2>
              Welcome to StudyMeet
            </h2>

            <p>
              Study better, together.
            </p>


            <button
              className="modal-primary-button"
              onClick={handleRegister}
            >
              Create an account
              <span>→</span>
            </button>


            <div className="modal-divider">
              <span>or</span>
            </div>


            <button
              className="modal-secondary-button"
              onClick={handleLogin}
            >
              Already have an account?
              <span>Login →</span>
            </button>

          </div>

        </div>

      )}

    </div>
  );
}

export default Home;