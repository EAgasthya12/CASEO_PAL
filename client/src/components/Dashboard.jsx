import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Dashboard.css';

const Dashboard = () => {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('inbox');
    const [user, setUser] = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);

    // New State for Filter & Sort
    const [filterOpen, setFilterOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState(null); // 'Academics', 'Internships', etc.
    const [sortConfig, setSortConfig] = useState({
        type: 'date', // 'date' or 'priority'
        dateVal: null, // for Date Picker
        priorityOrder: 'high-low' // 'high-low' or 'low-high'
    });

    const fetchUser = async () => {
        try {
            const res = await axios.get('http://localhost:5000/auth/current_user', { withCredentials: true });
            setUser(res.data);
        } catch (err) {
            console.error("Error fetching user:", err);
        }
    };

    const fetchEmails = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/emails', { withCredentials: true });
            setEmails(res.data);
        } catch (err) {
            console.error("Error fetching emails:", err);
            if (err.response && err.response.status === 401) {
                window.location.href = '/';
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

    // --- Filter & Sort Logic ---

    const toggleFilter = () => {
        setFilterOpen(!filterOpen);
        setSortOpen(false);
    };

    const toggleSort = () => {
        setSortOpen(!sortOpen);
        setFilterOpen(false);
    };

    const selectCategory = (cat) => {
        setFilterCategory(filterCategory === cat ? null : cat); // Toggle
        // setFilterOpen(false); // Optional: keep open to see selection? Let's keep open.
    };

    const handleDateChange = (e) => {
        setSortConfig({ ...sortConfig, type: 'date', dateVal: e.target.value });
    };

    const handlePrioritySort = (order) => {
        setSortConfig({ ...sortConfig, type: 'priority', priorityOrder: order });
        // setSortOpen(false);
    };

    useEffect(() => {
        fetchUser();
        // Load whatever we have instantly, then sync in background
        fetchEmails().then(() => {
            syncEmails();
        });
    }, []);

    const processEmails = () => {
        let result = [...emails];

        // 1. Sidebar Tabs Logic
        if (activeTab === 'urgent') {
            result = result.filter(e => e.urgency === 'High' || e.urgency === 'Critical');
        } else if (activeTab === 'deadlines') {
            result = result.filter(e => e.extractedDeadlines && e.extractedDeadlines.length > 0);
        }
        // 'inbox' takes all (so far)

        // 2. Category Filter
        if (filterCategory) {
            result = result.filter(e => e.category === filterCategory);
        }

        // 3. Date Filter (from Date Picker in Sort)
        // Requirement: "Show emails sorted relative to the selected date".
        // Implemented as: Show emails on or after selected date (if picked).
        if (sortConfig.type === 'date' && sortConfig.dateVal) {
            const selectedTime = new Date(sortConfig.dateVal).getTime();
            result = result.filter(e => {
                const emailTime = new Date(e.date).getTime();
                return emailTime >= selectedTime;
            });
        }

        // 4. Sorting
        const urgencyScore = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1, 'Unknown': 0 };

        result.sort((a, b) => {
            if (sortConfig.type === 'priority') {
                const scoreA = urgencyScore[a.urgency] || 0;
                const scoreB = urgencyScore[b.urgency] || 0;
                return sortConfig.priorityOrder === 'high-low'
                    ? scoreB - scoreA
                    : scoreA - scoreB;
            } else {
                // Default: Date Sort (Desc - Newest First)
                // Even with date filter, we usually want newest first on top
                return new Date(b.date) - new Date(a.date);
            }
        });

        return result;
    };

    const filteredEmails = processEmails();
    const categories = ['Academic', 'Internship', 'Personal', 'Event'];

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
                            {/* Filter Button & Dropdown */}
                            <div className="action-wrapper">
                                <button className={`filter-btn ${filterCategory ? 'active' : ''}`} onClick={toggleFilter}>
                                    Filter {filterCategory && `: ${filterCategory}`}
                                </button>
                                {filterOpen && (
                                    <div className="dropdown-menu">
                                        <div className="submenu-label">Category</div>
                                        <div className="category-row">
                                            {categories.map(cat => (
                                                <span
                                                    key={cat}
                                                    className={`category-chip ${filterCategory === cat ? 'active' : ''}`}
                                                    onClick={() => selectCategory(cat)}
                                                >
                                                    {cat}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sort Button & Dropdown */}
                            <div className="action-wrapper">
                                <button className="sort-btn" onClick={toggleSort}>
                                    Sort: {sortConfig.type === 'date' ? 'Date' : 'Priority'}
                                </button>
                                {sortOpen && (
                                    <div className="dropdown-menu">

                                        {/* Sort by Date Option */}
                                        <div className="sort-option-container">
                                            <div
                                                className={`dropdown-item ${sortConfig.type === 'date' ? 'selected' : ''}`}
                                                onClick={() => setSortConfig({ ...sortConfig, type: 'date' })}
                                            >
                                                Sort by Date
                                            </div>
                                            {sortConfig.type === 'date' && (
                                                <div style={{ padding: '0 8px 8px 8px' }}>
                                                    <span className="submenu-label">Started From:</span>
                                                    <input
                                                        type="date"
                                                        className="date-picker"
                                                        value={sortConfig.dateVal || ''}
                                                        onChange={handleDateChange}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }}></div>

                                        {/* Sort by Priority Option */}
                                        <div className="sort-option-container">
                                            <div
                                                className={`dropdown-item ${sortConfig.type === 'priority' ? 'selected' : ''}`}
                                                onClick={() => setSortConfig({ ...sortConfig, type: 'priority' })}
                                            >
                                                Sort by Priority
                                            </div>
                                            {sortConfig.type === 'priority' && (
                                                <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span
                                                        className={`dropdown-item ${sortConfig.priorityOrder === 'high-low' ? 'selected' : ''}`}
                                                        style={{ fontSize: '0.85rem', padding: '6px' }}
                                                        onClick={(e) => { e.stopPropagation(); handlePrioritySort('high-low'); }}
                                                    >
                                                        High → Low
                                                    </span>
                                                    <span
                                                        className={`dropdown-item ${sortConfig.priorityOrder === 'low-high' ? 'selected' : ''}`}
                                                        style={{ fontSize: '0.85rem', padding: '6px' }}
                                                        onClick={(e) => { e.stopPropagation(); handlePrioritySort('low-high'); }}
                                                    >
                                                        Low → High
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                )}
                            </div>
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
                                        <span className="email-time">{new Date(email.date).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
                                <p>No emails found matching your filters.</p>
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
