import {useParticipants, useLocalParticipant} from '@livekit/components-react';
function ParticipantList() {
    const participants=useParticipants();
    const {localParticipant}=useLocalParticipant();
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
                    </li>
                ))}
            </ul>)
            }
        </div>
    );
}
export default ParticipantList;