import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost:5000';

/**
 * Renders children only if the user is authenticated with the backend.
 * While checking, shows a full-screen spinner.
 * If not authenticated, redirects to the login page ("/").
 */
const ProtectedRoute = ({ children }) => {
    const [status, setStatus] = useState('checking'); // 'checking' | 'authenticated' | 'unauthenticated'

    useEffect(() => {
        axios
            .get(`${API}/auth/current_user`, { withCredentials: true })
            .then((res) => {
                // server returns null / empty when not logged in
                if (res.data && res.data._id) {
                    setStatus('authenticated');
                } else {
                    setStatus('unauthenticated');
                }
            })
            .catch(() => {
                setStatus('unauthenticated');
            });
    }, []);

    if (status === 'checking') {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: '#0f172a',
            }}>
                <div style={{
                    width: '40px', height: '40px',
                    border: '3px solid rgba(99,102,241,0.25)',
                    borderTopColor: '#6366f1',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return status === 'authenticated' ? children : <Navigate to="/" replace />;
};

export default ProtectedRoute;
