function RoomTimer({ roomId }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

    let timerInterval = null;

    socket.on('connect', () => {
      console.log('Timer Socket connected:', socket.id);

      socket.emit('join-room-timer', {
        roomId,
      });

      console.log('Timer: join-room-timer emitted');
    });

    socket.on('timer-init', ({ startTime }) => {
      console.log('Timer initialized:', startTime);

      if (timerInterval) {
        clearInterval(timerInterval);
      }

      const updateTimer = () => {
        const now = Date.now();

        const diffInSeconds = Math.floor(
          (now - startTime) / 1000
        );

        setElapsedSeconds(
          diffInSeconds >= 0 ? diffInSeconds : 0
        );
      };

      updateTimer();

      timerInterval = setInterval(
        updateTimer,
        1000
      );
    });

    socket.on('timer-tick', ({ elapsedSeconds }) => {
      console.log(
        'Timer tick:',
        elapsedSeconds
      );

      setElapsedSeconds(elapsedSeconds);
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

      if (timerInterval) {
        clearInterval(timerInterval);
      }

      socket.disconnect();
    };
  }, [roomId]);

  const formatTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);

    const mins = Math.floor(
      (totalSeconds % 3600) / 60
    );

    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return (
        `${hrs.toString().padStart(2, '0')}:` +
        `${mins.toString().padStart(2, '0')}:` +
        `${secs.toString().padStart(2, '0')}`
      );
    }

    return (
      `${mins.toString().padStart(2, '0')}:` +
      `${secs.toString().padStart(2, '0')}`
    );
  };

  return (
    <div className="room-timer-badge">
      <span>⏱</span>
      <span>{formatTime(elapsedSeconds)}</span>
    </div>
  );
}