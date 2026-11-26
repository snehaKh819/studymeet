import { useEffect, useState } from 'react';
import { useParticipants, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { isHandRaised } from './lib/handRaise';

function ParticipantList() {
    const participants = useParticipants();
    const { localParticipant } = useLocalParticipant();
    const room = useRoomContext();
    const [, setMetadataRevision] = useState(0);

    useEffect(() => {
        const handleMetadataChanged = () => {
            setMetadataRevision((revision) => revision + 1);
        };

        room.on(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
        return () => {
            room.off(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
        };
    }, [room]);

    return(
        <div className="participant-panel">
            <h3>Participants ({participants.length})</h3>
            {participants.length===0?
            (<p>No participants in the room</p>):
            (<ul className="participant-list">
                {participants.map((participant)=>(
                    <li className="participant-item" key={participant.sid || participant.identity}>
                        <div className="participant-avatar">
                            {participant.identity.charAt(0).toUpperCase()}
                        </div>
                        
                        <div className="participant-info">
                            <div className="participant-name">
                                {participant.identity}
                                {participant.identity === localParticipant.identity && (
                                    <span className="you-badge"> (You)</span>
                                )}
                            </div>
                        </div>
                        <div className="participant-icons">
                            {participant.isMicrophoneEnabled? "🎤" : "🔇"}
                            
                        </div>
                        <div className="participant-icons">
                            {participant.isCameraEnabled? "📹" : "📷"}
                        </div>
                        {isHandRaised(participant.metadata) && (
                            <span
                                className="participant-hand-raised"
                                title="Hand raised"
                                aria-label="Hand raised"
                            >
                                ✋
                            </span>
                        )}
                    </li>
                ))}
            </ul>)
            }
        </div>
    );
}
export default ParticipantList;