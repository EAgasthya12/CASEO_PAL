import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
const API = Capacitor.isNativePlatform() ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import TermsOfService from './components/TermsOfService';
import PrivacyPolicy from './components/PrivacyPolicy';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

/**
 * Wrapper for the Login route: if the user is already authenticated,
 * skip the login page and go straight to the dashboard.
 */
const AuthRedirect = ({ children }) => {
    const [status, setStatus] = useState('checking');

    useEffect(() => {
        axios
            .get(`${API}/auth/current_user`, { withCredentials: true })
            .then((res) => {
                setStatus(res.data && res.data._id ? 'authenticated' : 'unauthenticated');
            })
            .catch(() => setStatus('unauthenticated'));
    }, []);

    if (status === 'checking') return null; // blank while checking — very fast
    return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : children;
};

function App() {
    return (
        <Router>
            <Routes>
                <Route
                    path="/"
                    element={
                        <AuthRedirect>
                            <Login />
                        </AuthRedirect>
                    }
                />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
            </Routes>
        </Router>
    );
}

export default App;
