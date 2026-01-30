import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Dashboard.css';

const Dashboard = () => {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchEmails = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/emails', { withCredentials: true });
            setEmails(res.data);
        } catch (err) {
            console.error("Error fetching emails:", err);
            if (err.response && err.response.status === 401) {
                window.location.href = '/'; // Redirect to login
            }
        }
    };

    const syncEmails = async () => {
        setLoading(true);
        try {
            await axios.post('http://localhost:5000/api/emails/sync', {}, { withCredentials: true });
            await fetchEmails();
        } catch (err) {
            console.error("Error syncing emails:", err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchEmails();
    }, []);

    return (
        <div className="dashboard-container">
            <header className="header">
                <div className="logo">CASEO <span>Mission Control</span></div>
                <div className="actions">
                    <button className="sync-btn" onClick={syncEmails} disabled={loading}>
                        {loading ? (
                            <>
                                <div className="spinner"></div> Scanning...
                            </>
                        ) : (
                            'Scan Inbox'
                        )}
                    </button>
                    <button className="logout-btn" onClick={() => window.location.href = 'http://localhost:5000/auth/logout'}>Logout</button>
                </div>
            </header>

            <main className="content">
                <h2>Incoming Streams</h2>
                {emails.length === 0 ? (
                    <div className="empty-state">
                        <p>No processed emails yet. Click "Scan Inbox" to start Intelligence Layer.</p>
                    </div>
                ) : (
                    <div className="email-grid">
                        {emails.map(email => (
                            <div key={email._id} className={`email-card urgency-${email.urgency.toLowerCase()}`}>
                                <div className="card-top">
                                    <span className={`badge category-${email.category.toLowerCase()}`}>{email.category}</span>
                                    <span className="date">{new Date(email.date).toLocaleDateString()}</span>
                                </div>
                                <h3>{email.subject}</h3>
                                <p className="sender">{email.sender}</p>
                                <p className="snippet">{email.snippet}</p>

                                {email.extractedDeadlines && email.extractedDeadlines.length > 0 && (
                                    <div className="deadlines">
                                        <strong>Detected Deadlines:</strong>
                                        <ul>
                                            {email.extractedDeadlines.map((d, i) => (
                                                <li key={i}>
                                                    <span className="deadline-text">{d.text}</span>
                                                    <span className="deadline-date">{new Date(d.date).toLocaleString()}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="card-footer">
                                    <div className={`urgency-indicator ${email.urgency}`}>
                                        {email.urgency} Priority
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
