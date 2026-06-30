import API from './api';

export async function getLiveKitToken(roomId){
    const res=await API.get('/livekit/token',{
        params:{roomId}
    });
    return res.data.token;
}