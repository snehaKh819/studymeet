import {useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
import {LiveKitRoom,VideoConference} from '@livekit/components-react';
import '@livekit/components-styles';
import {getLiveKitToken} from './lib/livekit';

function Room(){
    const {roomId}=useParams();
    const [token,setToken]=useState(null);
    const [error,setError]=useState('');

    useEffect(()=>{
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
        <LiveKitRoom
            serverUrl={import.meta.env.VITE_LIVEKIT_URL}
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
    );
}

export default Room;