import {useParticipants} from '@livekit/components-react';
function ParticipantList() {
    const participants=useParticipants();
    return(
        <div className="participant-panel">
            <h3>Participants</h3>
            {participants.length===0?
            (<p>No participants in the room</p>):
            (<ul className="participant-list">
                {participants.map((participant)=>(
                    <li className="participant-item" key={participant.sid || participant.identity}>
                        {participant.identity}
                    </li>
                ))}
            </ul>)
            }
        </div>
    );
}
export default ParticipantList;