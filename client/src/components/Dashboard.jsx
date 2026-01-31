import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Dashboard.css';

const Dashboard = () => {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('inbox');
    const [user, setUser] = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);

    const fetchUser = async () => {
        try {
            const res = await axios.get('http://localhost:5000/auth/current_user', { withCredentials: true });
            setUser(res.data);
        } catch (err) {
            console.error("Error fetching user:", err);
            // If checking user fails, we might be unauthorized, or it's a network error.
            // For now, let's not force redirect unless emails also fail.
        }
    };

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

    const handleLogout = () => {
        window.location.href = 'http://localhost:5000/auth/logout';
    };

    const openEmail = (email) => {
        setSelectedEmail(email);
    };

    const closeEmail = () => {
        setSelectedEmail(null);
    };

    useEffect(() => {
        fetchUser();
        fetchEmails();
    }, []);

    const filterEmails = () => {
        if (activeTab === 'urgent') return emails.filter(e => e.urgency === 'High' || e.urgency === 'Critical');
        if (activeTab === 'deadlines') return emails.filter(e => e.extractedDeadlines && e.extractedDeadlines.length > 0);
        return emails;
    };

    const filteredEmails = filterEmails();

    return (
        <div className="dashboard-layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo-icon">C</div>
                    <span className="logo-text">CASEO</span>
                </div>

                <nav className="sidebar-nav">
                    <button className={`nav-item ${activeTab === 'inbox' ? 'active' : ''}`} onClick={() => setActiveTab('inbox')}>
                        <span className="icon">I</span>
                        <span className="label">Inbox</span>
                        <span className="count">{emails.length}</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'urgent' ? 'active' : ''}`} onClick={() => setActiveTab('urgent')}>
                        <span className="icon">⚠</span>
                        <span className="label">Urgent</span>
                        <span className="count">{emails.filter(e => e.urgency === 'High' || e.urgency === 'Critical').length}</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'deadlines' ? 'active' : ''}`} onClick={() => setActiveTab('deadlines')}>
                        <span className="icon">🕒</span>
                        <span className="label">Deadlines</span>
                        <span className="count">{emails.filter(e => e.extractedDeadlines && e.extractedDeadlines.length > 0).length}</span>
                    </button>
                    <button className="nav-item">
                        <span className="icon">✈</span>
                        <span className="label">Sent</span>
                    </button>
                    <button className="nav-item">
                        <span className="icon">📄</span>
                        <span className="label">Drafts</span>
                    </button>
                    <button className="nav-item">
                        <span className="icon">📦</span>
                        <span className="label">Archive</span>
                        <span className="count">29</span>
                    </button>
                </nav>

                <div className="user-profile">
                    <div className="user-details">
                        <div className="avatar">
                            {user?.photo ? (
                                <img src={user.photo} alt="Avatar" style={{ width: '100%', borderRadius: '50%' }} />
                            ) : (
                                user?.name?.charAt(0) || 'U'
                            )}
                        </div>
                        <div className="user-info">
                            <div className="name">{user?.name || 'Loading...'}</div>
                            <div className="email">{user?.email || ''}</div>
                        </div>
                    </div>
                    <button className="logout-icon-btn" onClick={handleLogout} title="Logout">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="top-bar">
                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input type="text" placeholder="Ask your email (e.g., 'What deadlines do I have?')" />
                    </div>
                    <div className="top-actions">
                        <button className="icon-btn">🔔</button>
                        <button className="scan-btn" onClick={syncEmails} disabled={loading}>
                            {loading ? <div className="loading-spinner"></div> : '⚡'}
                            {loading ? 'Scanning...' : 'Scan Inbox'}
                        </button>
                    </div>
                </header>

                <div className="content-area">
                    <div className="content-header">
                        <h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
                        <div className="view-actions">
                            <button className="filter-btn">Filter</button>
                            <button className="sort-btn">Sort: Urgency</button>
                        </div>
                    </div>

                    <div className="email-list">
                        {filteredEmails.map(email => (
                            <div key={email._id} className={`email-item urgency-${email.urgency?.toLowerCase() || 'low'}`} onClick={() => openEmail(email)}>
                                <div className="email-checkbox" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" />
                                </div>
                                <div className="email-content">
                                    <div className="email-header">
                                        <div className="sender-info">
                                            <span className="sender-name">{email.sender}</span>
                                            {email.urgency === 'Critical' && <span className="status-dot"></span>}
                                        </div>
                                        <span className="email-time">{new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>

                                    <h3 className="email-subject">
                                        {email.urgency === 'Critical' && <span className="urgent-prefix">URGENT:</span>} {email.subject}
                                    </h3>

                                    <p className="email-snippet">{email.snippet}</p>

                                    <div className="email-tags">
                                        {(email.urgency === 'High' || email.urgency === 'Critical') && (
                                            <span className="tag tag-critical">
                                                <span className="icon">⚠</span> {email.urgency.toUpperCase()} PRIORITY
                                            </span>
                                        )}
                                        {email.extractedDeadlines && email.extractedDeadlines.map((d, i) => (
                                            <span key={i} className="tag tag-due">
                                                <span className="icon">🕒</span> DUE: {new Date(d.date).toLocaleDateString()}
                                            </span>
                                        ))}
                                        <span className="tag tag-category">#{email.category}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredEmails.length === 0 && (
                            <div className="empty-state">
                                <p>No emails found in this view.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Email Modal */}
                {selectedEmail && (
                    <div className="modal-overlay" onClick={closeEmail}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="modal-title-section">
                                    <h2>{selectedEmail.subject}</h2>
                                    <div className="modal-meta">
                                        <span className="modal-sender">From: <strong>{selectedEmail.sender}</strong></span>
                                        <span className="modal-date">{new Date(selectedEmail.date).toLocaleString()}</span>
                                    </div>
                                </div>
                                <button className="close-modal-btn" onClick={closeEmail}>&times;</button>
                            </div>
                            <div className="modal-body">
                                <div className="email-tags" style={{ marginBottom: '20px' }}>
                                    <span className={`tag tag-${selectedEmail.urgency.toLowerCase()}`}>Priority: {selectedEmail.urgency}</span>
                                    <span className="tag tag-category">Category: {selectedEmail.category}</span>
                                </div>
                                <div className="email-body-content" dangerouslySetInnerHTML={{ __html: selectedEmail.body || selectedEmail.snippet }} />
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
