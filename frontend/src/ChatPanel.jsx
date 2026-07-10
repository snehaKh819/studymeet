import {useState, useEffect, useRef} from 'react';
import {io} from 'socket.io-client';

function ChatPanel({roomId,currentUser}){
    const [messages, setMessages] = useState([]);
    const [input,setInput] = useState('');
    const [isOpen,setIsOpen] = useState(true);
    const socketRef = useRef(null);

    useEffect(()=>{
        if (!roomId) return undefined;

        const socket = io({
            path:"/chat",
            withCredentials: true,
            transports: ['websocket']
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

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="chat-toggle-button"
            >
                Open Chat
            </button>
        );
    }

    return (
        <div className="chat-panel">
            <div className="chat-panel-header">
                <div>
                    <h3>Chat</h3>
                    <p className="chat-subtitle">Live room messages</p>
                </div>
                <button className="chat-close" onClick={() => setIsOpen(false)}>×</button>
            </div>

            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">No messages yet. Start the conversation.</div>
                ) : (
                    messages.map((msg) => (
                        <div key={`${msg.timestamp}-${msg.username}`} className="chat-message">
                            <div className="chat-message-meta">
                                <span className="chat-username">{msg.username}</span>
                                <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="chat-message-text">{msg.text}</div>
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={sendMessage} className="chat-form">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className="chat-input"
                />
                <button type="submit" className="chat-send-button">Send</button>
            </form>
        </div>
    );
}

export default ChatPanel;