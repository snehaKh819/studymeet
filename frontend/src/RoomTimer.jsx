import {
  useEffect,
  useRef,
  useState
} from 'react';

import { io } from 'socket.io-client';


function RoomTimer({
  roomId,
  isHost
}) {

  const [
    elapsedSeconds,
    setElapsedSeconds
  ] = useState(0);

  const [
    running,
    setRunning
  ] = useState(false);

  const socketRef =
    useRef(null);

  useEffect(() => {

    if (!roomId) {

      console.log(
        'Timer: No roomId'
      );

      return;

    }

    console.log(
      'Timer: Connecting for room:',
      roomId
    );

    const token =
      localStorage.getItem('token');


    const socket = io(
      'http://localhost',
      {
        path:
          '/socket.io/timer/',

        transports:
          ['websocket'],

        auth: {
          token: token || undefined,
        },

        withCredentials: true,
      }
    );


    socketRef.current =
      socket;

    socket.on(
      'connect',
      () => {

        console.log(
          'Timer Socket connected:',
          socket.id
        );


        socket.emit(
          'join-room-timer',
          {
            roomId,
          }
        );

      }
    );

    socket.on(
      'timer-state',
      ({
        elapsedSeconds,
        running
      }) => {

        console.log(
          'Timer state:',
          elapsedSeconds,
          running
        );


        setElapsedSeconds(
          elapsedSeconds || 0
        );


        setRunning(
          Boolean(running)
        );

      }
    );

    socket.on(
      'timer-tick',
      ({
        elapsedSeconds
      }) => {

        setElapsedSeconds(
          elapsedSeconds || 0
        );

      }
    );

    socket.on(
      'timer-error',
      ({ message }) => {

        console.warn(
          'Timer authorization:',
          message
        );

        alert(message);

      }
    );

    socket.on(
      'connect_error',
      (error) => {

        console.error(
          'Timer Socket connection error:',
          error.message
        );

      }
    );

    socket.on(
      'disconnect',
      (reason) => {

        console.log(
          'Timer Socket disconnected:',
          reason
        );

      }
    );

    return () => {

      console.log(
        'Timer: Cleaning up'
      );


      socket.disconnect();

      socketRef.current =
        null;

    };

  }, [roomId]);

  const handleStart = () => {

    if (
      !isHost ||
      !socketRef.current
    ) {

      return;

    }

    console.log(
      'Starting/resuming timer:',
      roomId
    );


    socketRef.current.emit(
      'start-timer',
      {
        roomId,
      }
    );

  };

  const handleStop = () => {

    if (
      !isHost ||
      !socketRef.current
    ) {

      return;

    }


    console.log(
      'Stopping timer:',
      roomId
    );


    socketRef.current.emit(
      'stop-timer',
      {
        roomId,
      }
    );

  };

  const formatTime = (
    totalSeconds
  ) => {

    const hrs =
      Math.floor(
        totalSeconds / 3600
      );

    const mins =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const secs =
      totalSeconds % 60;


    return (
      `${hrs
        .toString()
        .padStart(2, '0')}:` +

      `${mins
        .toString()
        .padStart(2, '0')}:` +

      `${secs
        .toString()
        .padStart(2, '0')}`
    );

  };

  return (

    <div className="room-timer-container">

      <div
        className={`room-timer-badge ${
          running
            ? 'timer-running'
            : 'timer-paused'
        }`}
      >

        <span>
          ⏱
        </span>

        <span>
          {formatTime(
            elapsedSeconds
          )}
        </span>

      </div>

      {isHost && (

        <button
          type="button"
          className="timer-control-button"
          onClick={
            running
              ? handleStop
              : handleStart
          }
        >

          {running
            ? '⏹ Stop'
            : '▶ Start'}

        </button>

      )}

    </div>

  );

}


export default RoomTimer;