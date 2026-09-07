import { useEffect, useRef } from 'react';
import { Tldraw } from 'tldraw';
import { io } from 'socket.io-client';

import 'tldraw/tldraw.css';
import './whiteboard.css';

function Whiteboard({ roomId }) {

    const editorRef = useRef(null);
    const socketRef = useRef(null);
    const applyingRemoteChange = useRef(false);

    useEffect(() => {

        if (!roomId) {
            console.log('No roomId provided to Whiteboard');
            return;
        }

        console.log('Connecting to whiteboard:', roomId);

        const socket = io('http://localhost/whiteboard', {
            path: '/whiteboard/socket.io',
            transports: ['websocket'],
            withCredentials: true
        });

        socketRef.current = socket;

        socket.on('connect', () => {

            console.log(
                'Connected to whiteboard service:',
                socket.id
            );

            socket.emit(
                'join_whiteboard',
                roomId
            );
        });

        socket.on('whiteboard_state', (state) => {

            console.log('Received saved whiteboard state');

            if (!editorRef.current || !state) {
                return;
            }

            try {

                applyingRemoteChange.current = true;

                editorRef.current.store.mergeRemoteChanges(() => {

                    editorRef.current.store.put(
                        state.records || []
                    );

                });

            } catch (error) {

                console.error(
                    'Failed to apply whiteboard state:',
                    error
                );

            } finally {

                applyingRemoteChange.current = false;

            }

        });

        socket.on('whiteboard_change', (state) => {

            console.log('Received whiteboard change');

            if (!editorRef.current || !state) {
                return;
            }

            try {

                applyingRemoteChange.current = true;

                editorRef.current.store.mergeRemoteChanges(() => {

                    editorRef.current.store.put(
                        state.records || []
                    );

                });

            } catch (error) {

                console.error(
                    'Failed to apply remote change:',
                    error
                );

            } finally {

                applyingRemoteChange.current = false;

            }

        });

        socket.on('disconnect', () => {

            console.log(
                'Disconnected from whiteboard service'
            );

        });

        return () => {

            socket.emit(
                'leave_whiteboard',
                roomId
            );

            socket.disconnect();

            socketRef.current = null;

        };

    }, [roomId]);


    const handleMount = (editor) => {

        editorRef.current = editor;

        console.log('Tldraw editor mounted');

        const handleChange = () => {

            if (
                applyingRemoteChange.current ||
                !socketRef.current ||
                !roomId
            ) {
                return;
            }

            const records = Array.from(
                editor.store.allRecords()
            );

            socketRef.current.emit(
                'whiteboard_change',
                {
                    roomId,
                    state: {
                        records
                    }
                }
            );

        };

        editor.store.listen(
            handleChange,
            {
                source: 'user',
                scope: 'document'
            }
        );

    };


    return (
        <div className="whiteboard">
            <Tldraw
                onMount={handleMount}
            />
        </div>
    );
}

export default Whiteboard;