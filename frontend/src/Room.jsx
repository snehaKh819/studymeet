import {useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
import {LiveKitRoom,VideoConference} from '@livekit/components-react';
import '@livekit/components-styles';
import {getLiveKitToken} from './lib/livekit';
import ChatPanel from './ChatPanel';

function Room(){
    const {roomId}=useParams();
    const [token,setToken]=useState(null);
    const [error,setError]=useState('');
    const [currentUser,setCurrentUser]=useState(null);

    useEffect(()=>{
        const storedUser = localStorage.getItem('user');
        if (storedUser && storedUser !== 'undefined') {
            try {
                setCurrentUser(JSON.parse(storedUser));
            } catch {
                setCurrentUser(null);
            }
        }

        getLiveKitToken(roomId).then(setToken).catch(()=>setError('Could not join room. Try again.😓'));
    },[roomId]);

    if(error){
        return <p style={{
            color:'red',
            padding:24
        }}>
            {error}
        </p>;
    }

    if(!token){
        return <p style={{
            padding:24
        }}>
            Connecting to room... Please wait.🤗
        </p>;
    }

    return (
        <div style={{ display:'flex'}}>
            <div style={{flex:1}}>
                <LiveKitRoom
                    serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost/rtc'}
                    token={token}
                    connect={true}
                    video={true}
                    audio={true}
                    style={{
                        height:'100vh'
                    }}
                >
                    <VideoConference/>
                </LiveKitRoom>
            </div>
            <ChatPanel roomId={roomId} currentUser={currentUser || { username: 'Guest' }}/>
        </div>
    );
}

export default Room;