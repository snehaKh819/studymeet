import {useEffect,useState} from 'react';

function Dashboard(){
    const [user,setUser]=useState(null);
    useEffect(()=>{
        const userData=localStorage.getItem('user');
        if(!userData){
            window.location.href='/login';
            return;
        }
        setUser(JSON.parse(userData));
    }, []);
    if(!user){
        return null;
    }
    return(
        <div style={{
            backgroundColor: '#f3e8ff', 
            minHeight: '100vh',
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            fontFamily: 'sans-serif'
        }}>
            <div style={{
                background: 'white', 
                padding: '40px', 
                borderRadius: '12px',
                boxShadow: '0 4px 10px rgba(88,28,135,0.08)', 
                textAlign: 'center',
                minWidth: '320px'
            }}>
                <h1 style={{ color: '#581c87', marginBottom: '8px' }}>
                    Welcome, {user.username}! 👽
                </h1>
                <p style={{ color: '#6b21a8', marginBottom: '24px' }}>{user.email}</p>
                <p style={{ color: '#9333ea', fontSize: '14px', marginBottom: '24px' }}>
                    Study rooms coming soon...
                </p>
                <button
                    onClick={()=>{
                        localStorage.clear();
                        window.location.href='/login';
                    }}
                    style={{
                        padding: '10px 24px', 
                        background: '#f3e8ff',
                        color: '#581c87', 
                        border: '1px solid #d8b4fe',
                        borderRadius: '6px', 
                        cursor: 'pointer', 
                        fontWeight: '600'
                    }}
                >
                    Logout
                </button>
            </div>
        </div>
    );
}

export default Dashboard;