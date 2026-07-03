import {useState, useEffect, useRef} from 'react';
import {io} from 'socket.io-client';

function ChatPanel({roomId,currentUser}){
    const [messages, setMessages] = useState([]);
    const [input,setInput] = useState('');
    const [isOpen,setIsOpen] = useState(true);
    const socketRef = useRef(null);

    useEffect(()=>{
        if (!roomId) return undefined;

        const socket = io('/chat', {
            query: { roomId },
            withCredentials: true,
            transports: ['websocket', 'polling']
        });
        socketRef.current=socket;
        socket.on('message',(msg)=>{
            setMessages((prevmsgs)=>[...prevmsgs,msg]);
        });
        socket.emit('joinRoom', roomId);

        return ()=>{
            socket.emit('leave_room', roomId);
            socket.disconnect();
        };
    },[roomId]);

    const sendMessage=(e)=>{
        e.preventDefault();
        if(!input.trim() || !socketRef.current){
            return;
        }
        socketRef.current.emit('message',{
            text:input,
            roomId
        });
        setInput('');
    };

    if(!isOpen){
        return (
            <button 
                onClick={()=>setIsOpen(true)}
                style={{
                    position:'fixed',
                    right:16,
                    top:16
                }}
            >
                Open Chat
            </button>
        );
    }

    return (
        <div style={{
            width: '320px', 
            height: '100vh', 
            background: '#fff',
            borderLeft: '1px solid #e5e7eb', 
            display: 'flex', 
            flexDirection: 'column'
        }}>
            <div style={{ 
                padding: '12px 16px', 
                borderBottom: '1px solid #e5e7eb', display: 'flex', 
                justifyContent: 'space-between' 
            }}>
                <strong>Chat</strong>
                <button onClick={()=>setIsOpen(false)}>×</button>
            </div>

            <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '12px 16px' 
            }}>
                {messages.map((msg,i)=>(
                    <div key={i} style={{ marginBottom: '10px' }}>
                        <strong style={{ 
                            fontSize: '13px', 
                            color: '#581c87' 
                        }}>
                            {msg.username}:
                        </strong>
                        <span style={{ fontSize: '13px' }}>{msg.text}</span>
                    </div>
                ))}
            </div>

            <form onSubmit={sendMessage} style={{ 
                padding: '12px 16px', 
                borderTop: '1px solid #e5e7eb', 
                display: 'flex', 
                gap: '8px' 
            }}>
                <input
                    value={input}
                    onChange={(e)=>setInput(e.target.value)}
                    placeholder="Type a message..."
                    style={{ 
                        flex: 1, 
                        padding: '8px', 
                        borderRadius: '6px', 
                        border: '1px solid #d8b4fe'
                    }}
                />
                <button type="submit" style={{ 
                    padding: '8px 16px', 
                    background: '#a855f7', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '6px' 
                }}>
                    Send
                </button>
            </form>
        </div>
    );
}

export default ChatPanel;