import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

function RoomTimer({ roomId, isHost }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  const socketRef = useRef(null);

  useEffect(() => {
    if (!roomId) {
      console.log('Timer: No roomId');
      return;
    }

    console.log('Timer: Connecting for room:', roomId);

    const socket = io('http://localhost', {
      path: '/socket.io/timer/',
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Timer Socket connected:', socket.id);

      socket.emit('join-room-timer', { roomId });

      console.log('Timer: join-room-timer emitted');
    });

    socket.on('timer-state', ({ elapsedSeconds, running }) => {
      console.log(
        'Timer state:',
        elapsedSeconds,
        running
      );

      setElapsedSeconds(elapsedSeconds);
      setRunning(running);
    });

    socket.on('timer-tick', ({ elapsedSeconds }) => {
      setElapsedSeconds(elapsedSeconds);
    });

    socket.on('timer-error', ({ message }) => {
      console.error('Timer error:', message);
    });

    socket.on('connect_error', (error) => {
      console.error(
        'Timer Socket connection error:',
        error
      );
    });

    socket.on('disconnect', (reason) => {
      console.log(
        'Timer Socket disconnected:',
        reason
      );
    });

    return () => {
      console.log('Timer: Cleaning up');

      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const handleStart = () => {
    if (!isHost) {
      return;
    }

    if (!socketRef.current) {
      console.error('Timer socket is not connected');
      return;
    }

    console.log(
      'Starting/resuming timer:',
      roomId
    );

    socketRef.current.emit('start-timer', {
      roomId,
    });
  };


  const handleStop = () => {
    if (!isHost) {
      return;
    }

    if (!socketRef.current) {
      console.error('Timer socket is not connected');
      return;
    }

    console.log(
      'Stopping timer:',
      roomId
    );

    socketRef.current.emit('stop-timer', {
      roomId,
    });
  };

  const formatTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);

    const mins = Math.floor(
      (totalSeconds % 3600) / 60
    );

    const secs = totalSeconds % 60;

    return `${hrs
      .toString()
      .padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <div className="room-timer-badge">
      <span>⏱</span>

      <span>
        {formatTime(elapsedSeconds)}
      </span>

      {isHost && (
        running ? (
          <button onClick={handleStop}>
            ⏹ Stop
          </button>
        ) : (
          <button onClick={handleStart}>
            ▶ Start
          </button>
        )
      )}
    </div>
  );
}

export default RoomTimer;