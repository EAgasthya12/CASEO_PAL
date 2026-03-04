import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Dashboard.css';

// Decodes HTML entities like &#39; → ' and &amp; → &
// Gmail snippets and subjects often contain HTML-encoded characters.
const decodeHtmlEntities = (html) => {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
};

/**
 * Returns deadline display info based on whether the date is past, today, or future.
 * @param {string|Date} dateStr
 * @returns {{ label: string, status: 'expired'|'today'|'upcoming' }}
 */
const deadlineTag = (dateStr) => {
    const due = new Date(dateStr);
    const now = new Date();
    // Compare calendar dates only (ignore time)
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = dueDay - today;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Format as DD-MM-YYYY
    const dd = String(due.getDate()).padStart(2, '0');
    const mm = String(due.getMonth() + 1).padStart(2, '0');
    const yyyy = due.getFullYear();
    const formatted = `${dd}-${mm}-${yyyy}`;

    if (diffDays < 0) return { label: 'CLOSED', status: 'expired' };
    if (diffDays === 0) return { label: 'DUE TODAY', status: 'today' };
    return { label: `DUE: ${formatted}`, status: 'upcoming' };
};

const Dashboard = () => {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('inbox');
    const [user, setUser] = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [userCategories, setUserCategories] = useState(['Academic', 'Internship', 'Job', 'Event', 'Personal']);

    // Mailbox state for Sent / Drafts / Archive (fetched live from Gmail)
    const [mailboxEmails, setMailboxEmails] = useState([]);
    const [mailboxLoading, setMailboxLoading] = useState(false);
    const [labelCounts, setLabelCounts] = useState({ sent: null, drafts: null });

    const MAILBOX_TABS = ['sent', 'drafts'];

    // New State for Filter & Sort
    const [filterOpen, setFilterOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState(null); // 'Academics', 'Internships', etc.
    const [sortConfig, setSortConfig] = useState({
        type: 'date', // 'date' or 'priority'
        dateVal: null, // for Date Picker
        priorityOrder: 'high-low' // 'high-low' or 'low-high'
    });

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null); // null = not searching
    const [searchLoading, setSearchLoading] = useState(false);

    const fetchUser = async () => {
        try {
            const res = await axios.get('http://localhost:5000/auth/current_user', { withCredentials: true });
            setUser(res.data);
            if (res.data.categories) setUserCategories(res.data.categories);
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

    const fetchLabelCounts = async () => {
        try {
            const res = await axios.get('http://localhost:5000/api/emails/label-counts', { withCredentials: true });
            setLabelCounts(res.data);
        } catch (err) {
            console.error('Error fetching label counts:', err);
        }
    };

    // Debounced search — fires 400ms after the user stops typing
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await axios.get(
                    `http://localhost:5000/api/emails/search?q=${encodeURIComponent(searchQuery.trim())}`,
                    { withCredentials: true }
                );
                setSearchResults(res.data.emails || []);
            } catch (err) {
                console.error('Search error:', err);
                setSearchResults([]);
            }
            setSearchLoading(false);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const syncEmails = async () => {
        setLoading(true);
        try {
            // Fire scan — server responds immediately, processes in background
            await axios.post('http://localhost:5000/api/emails/reclassify', {}, { withCredentials: true });
            // Refresh emails immediately with what's already in DB
            await fetchEmails();

            // Poll every 3s until scan finishes, refreshing the list each time
            const poll = setInterval(async () => {
                try {
                    const status = await axios.get('http://localhost:5000/api/emails/scan-status', { withCredentials: true });
                    await fetchEmails(); // refresh email list as new ones get processed
                    if (!status.data.running) {
                        clearInterval(poll);
                        setLoading(false);
                    }
                } catch {
                    clearInterval(poll);
                    setLoading(false);
                }
            }, 3000);
        } catch (err) {
            console.error('Error syncing emails:', err);
            setLoading(false);
        }
    };

    const reclassifyEmails = async () => {
        const confirmed = window.confirm(
            'This will delete all stored emails and re-classify them from scratch using Gemini AI.\n\nThis may take a few minutes. Continue?'
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            const res = await axios.post('http://localhost:5000/api/emails/reclassify', {}, { withCredentials: true });
            await fetchEmails();
            alert(`Re-classification complete! ${res.data.reclassified} emails processed.`);
        } catch (err) {
            console.error('Error re-classifying emails:', err);
            alert('Re-classification failed. Check console.');
        }
        setLoading(false);
    };

    const fetchMailbox = async (tab) => {
        setMailboxLoading(true);
        setMailboxEmails([]);
        try {
            const res = await axios.get(`http://localhost:5000/api/emails/mailbox?label=${tab}`, { withCredentials: true });
            setMailboxEmails(res.data);
        } catch (err) {
            console.error(`Error fetching ${tab}:`, err);
        }
        setMailboxLoading(false);
    };

    const switchTab = (tab) => {
        setActiveTab(tab);
        setSelectedEmail(null);
        if (MAILBOX_TABS.includes(tab)) {
            fetchMailbox(tab);
        }
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

    const addToCalendar = async (email) => {
        if (!email.extractedDeadlines || email.extractedDeadlines.length === 0) return;

        const now = new Date();

        // Pick the earliest deadline that hasn't passed yet
        const upcomingDeadlines = email.extractedDeadlines
            .filter(d => new Date(d.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Fall back to the latest deadline overall if all have passed (shouldn't happen since button is hidden for all-expired)
        const primaryDeadline = upcomingDeadlines.length > 0
            ? upcomingDeadlines[0]
            : [...email.extractedDeadlines].sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        const confirmAdd = window.confirm(`Do you want to add this deadline to your Google Calendar?\n\nEvent: ${primaryDeadline.text || 'Deadline'}\nDate: ${new Date(primaryDeadline.date).toLocaleDateString()}`);
        if (!confirmAdd) return;

        try {
            const payload = {
                summary: `Deadline: ${primaryDeadline.text || email.subject.substring(0, 30)}`,
                description: `Email Context: ${email.subject}\n\nFrom: ${email.sender}\n\nLink: https://mail.google.com/mail/u/0/#inbox/${email.googleMessageId}\n\nSnippet: ${email.snippet}`,
                date: primaryDeadline.date
            };

            const res = await axios.post('http://localhost:5000/api/calendar/add-event', payload, { withCredentials: true });
            if (res.data.success) {
                alert('Event added to Google Calendar securely!');
            }
        } catch (err) {
            console.error('Error adding to calendar', err);
            alert('Failed to add event to Calendar.');
        }
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
        fetchLabelCounts();
        fetchEmails(); // Just load what's in DB instantly — no auto-scan
    }, []);

    const processEmails = () => {
        let result = [...emails];

        // 1. Sidebar Tabs Logic
        if (activeTab === 'priority') {
            // Show emails that are urgent (High/Critical) OR have deadlines
            result = result.filter(e =>
                e.urgency === 'High' ||
                e.urgency === 'Critical' ||
                (e.extractedDeadlines && e.extractedDeadlines.length > 0)
            );
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

    // When a search query is active, show search results instead of the regular inbox
    const filteredEmails = searchQuery.trim() ? (searchResults ?? []) : processEmails();
    const categories = userCategories;

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
                    <button className={`nav-item ${activeTab === 'priority' ? 'active' : ''}`} onClick={() => setActiveTab('priority')}>
                        <span className="icon">⚡</span>
                        <span className="label">Priority</span>
                        <span className="count">{
                            new Set(
                                emails
                                    .filter(e =>
                                        e.urgency === 'High' ||
                                        e.urgency === 'Critical' ||
                                        (e.extractedDeadlines && e.extractedDeadlines.length > 0)
                                    )
                                    .map(e => e._id)
                            ).size
                        }</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'sent' ? 'active' : ''}`} onClick={() => switchTab('sent')}>
                        <span className="icon">✈</span>
                        <span className="label">Sent</span>
                        {labelCounts.sent !== null && <span className="count">{labelCounts.sent}</span>}
                    </button>
                    <button className={`nav-item ${activeTab === 'drafts' ? 'active' : ''}`} onClick={() => switchTab('drafts')}>
                        <span className="icon">📄</span>
                        <span className="label">Drafts</span>
                        {labelCounts.drafts !== null && <span className="count">{labelCounts.drafts}</span>}
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
                        <input
                            type="text"
                            placeholder="Search emails... or try 'from:superset'"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '0 4px' }}
                            >✕</button>
                        )}
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
                        <h1>
                            {searchQuery
                                ? searchLoading
                                    ? 'Searching...'
                                    : `${searchResults?.length ?? 0} result${searchResults?.length !== 1 ? 's' : ''} for "${searchQuery}"`
                                : activeTab === 'priority' ? 'Priority'
                                    : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
                            }
                        </h1>

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

                    {/* ── MAILBOX VIEW (Sent / Drafts / Archive) ── */}
                    {MAILBOX_TABS.includes(activeTab) ? (
                        <div className="email-list">
                            {mailboxLoading && (
                                <div className="empty-state">
                                    <div className="loading-spinner" style={{ margin: '0 auto 12px' }}></div>
                                    <p>Loading {activeTab}...</p>
                                </div>
                            )}
                            {!mailboxLoading && mailboxEmails.length === 0 && (
                                <div className="empty-state">
                                    <p>No emails in {activeTab}.</p>
                                </div>
                            )}
                            {!mailboxLoading && mailboxEmails.map(email => (
                                <div key={email._id} className="email-item urgency-low" onClick={() => openEmail(email)}>
                                    <div className="email-checkbox" onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" />
                                    </div>
                                    <div className="email-content">
                                        <div className="email-header">
                                            <div className="sender-info">
                                                <span className="sender-name">
                                                    {activeTab === 'sent'
                                                        ? `To: ${decodeHtmlEntities(email.recipient)}`
                                                        : decodeHtmlEntities(email.sender)}
                                                </span>
                                            </div>
                                            <span className="email-time">
                                                {new Date(email.date).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <h3 className="email-subject">{decodeHtmlEntities(email.subject)}</h3>
                                        <p className="email-snippet">{decodeHtmlEntities(email.snippet)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* ── INBOX / PRIORITY VIEW ── */
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
                                            {email.urgency === 'Critical' && <span className="urgent-prefix">URGENT:</span>} {decodeHtmlEntities(email.subject)}
                                        </h3>

                                        <p className="email-snippet">{decodeHtmlEntities(email.snippet)}</p>

                                        <div className="email-tags">
                                            {(email.urgency === 'High' || email.urgency === 'Critical') && (
                                                <span className="tag tag-critical">
                                                    <span className="icon">⚠</span> {email.urgency.toUpperCase()} PRIORITY
                                                </span>
                                            )}
                                            {email.extractedDeadlines && email.extractedDeadlines.map((d, i) => {
                                                const { label, status } = deadlineTag(d.date);
                                                return (
                                                    <span key={i} className={`tag tag-deadline-${status}`}>
                                                        <span className="icon">{status === 'expired' ? '🔒' : '🕒'}</span>
                                                        {label}
                                                    </span>
                                                );
                                            })}
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
                    )}
                </div>

                {/* Email Modal */}
                {selectedEmail && (
                    <div className="modal-overlay" onClick={closeEmail}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="modal-title-section">
                                    <h2>{decodeHtmlEntities(selectedEmail.subject)}
                                    </h2>
                                    <div className="modal-meta">
                                        <span className="modal-sender">From: <strong>{selectedEmail.sender}</strong></span>
                                        <span className="modal-date">{new Date(selectedEmail.date).toLocaleString()}</span>
                                    </div>
                                </div>
                                <button className="close-modal-btn" onClick={closeEmail}>&times;</button>
                            </div>
                            <div className="modal-body">
                                <div className="email-tags" style={{ marginBottom: '20px' }}>
                                    {/* Urgency only exists for inbox emails */}
                                    {selectedEmail.urgency && (
                                        <span className={`tag tag-${selectedEmail.urgency.toLowerCase()}`}>Priority: {selectedEmail.urgency}</span>
                                    )}
                                    {selectedEmail.category && (
                                        <div className="modal-category-wrapper">
                                            <span className="tag tag-category">#{selectedEmail.category}</span>
                                            <select
                                                className="modal-category-select"
                                                value={selectedEmail.category}
                                                onChange={async (e) => {
                                                    const newCat = e.target.value;
                                                    try {
                                                        const res = await axios.put(
                                                            `http://localhost:5000/api/emails/${selectedEmail._id}/category`,
                                                            { category: newCat },
                                                            { withCredentials: true }
                                                        );
                                                        setSelectedEmail(res.data.email);
                                                        setEmails(emails.map(em => em._id === selectedEmail._id ? { ...em, category: newCat } : em));
                                                    } catch (err) {
                                                        console.error('Failed to update category', err);
                                                    }
                                                }}
                                            >
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                                {!categories.includes(selectedEmail.category) && (
                                                    <option value={selectedEmail.category}>{selectedEmail.category}</option>
                                                )}
                                            </select>
                                        </div>
                                    )}

                                    {selectedEmail.recipient && (
                                        <span className="tag tag-category">To: {decodeHtmlEntities(selectedEmail.recipient)}</span>
                                    )}
                                    {selectedEmail.extractedDeadlines && selectedEmail.extractedDeadlines.map((d, i) => {
                                        const { label, status } = deadlineTag(d.date);
                                        return (
                                            <span key={i} className={`tag tag-deadline-${status}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="icon">{status === 'expired' ? '🔒' : '🕒'}</span> {label}
                                            </span>
                                        );
                                    })}
                                    {selectedEmail.extractedDeadlines &&
                                        selectedEmail.extractedDeadlines.some(d => deadlineTag(d.date).status !== 'expired') && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); addToCalendar(selectedEmail); }}
                                                className="scan-btn"
                                                style={{ padding: '4px 10px', fontSize: '0.8rem', marginLeft: '10px' }}
                                                title="Add Primary Deadline to Google Calendar"
                                            >
                                                📅 Add to Calendar
                                            </button>
                                        )}
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
