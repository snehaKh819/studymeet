import api from '../utils/api';

export async function getLiveKitToken(roomId) {
    if (!roomId) {
        throw new Error('Room ID is required');
    }
    const res = await api.post('/rooms/join', { roomId });
    return res.data.token;
}