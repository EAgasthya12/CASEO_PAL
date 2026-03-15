import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import './Dashboard.css';

/**
 * EmailBodyRenderer
 * Renders the raw HTML email body inside a sandboxed iframe so that the
 * email's own inline styles (white backgrounds, black text, etc.) don't
 * bleed into or break the CASEO dark-mode UI.
 * A theme-aware stylesheet is injected into the iframe to override the
 * email's colors while preserving its layout/images.
 */
const EmailBodyRenderer = ({ html, plainText, theme }) => {
    const iframeRef = useRef(null);
    const [loaded, setLoaded] = useState(false);

    const isDark = theme !== 'light';

    // Colors injected into the iframe depending on theme
    const bodyBg = isDark ? '#111827' : '#fafbff';
    const bodyText = isDark ? '#cbd5e1' : '#334155';
    const linkColor = isDark ? '#818cf8' : '#4f46e5';

    const writeContent = useCallback(() => {
        setLoaded(false);
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        // Injected CSS: normalises the email to fit our dark UI without breaking layout.
        const overrideStyle = `
            *, *::before, *::after { box-sizing: border-box !important; }
            html, body {
                margin: 0 !important;
                padding: 24px 28px !important;
                background-color: ${bodyBg} !important;
                color: ${bodyText} !important;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                font-size: 14px !important;
                line-height: 1.75 !important;
                overflow-x: hidden !important;
                word-break: break-word !important;
                max-width: 100% !important;
            }
            /* Force all containers to stay within viewport width */
            * {
                max-width: 100% !important;
            }
            /* Re-colour text that was explicitly set to black/dark in the email */
            *[style*="color:#000"],
            *[style*="color: #000"],
            *[style*="color:black"],
            *[style*="color: black"],
            *[style*="color:#1"],
            *[style*="color:#2"],
            *[style*="color:#3"],
            *[style*="color:#333"],
            *[style*="color: rgb(0"] {
                color: ${bodyText} !important;
            }
            /* Re-colour explicit white/near-white backgrounds */
            *[style*="background-color:#fff"],
            *[style*="background-color: #fff"],
            *[style*="background-color:white"],
            *[style*="background-color: white"],
            *[style*="background:#fff"],
            *[style*="background: #fff"],
            *[style*="background:white"],
            *[style*="background-color:#ffffff"],
            *[style*="background-color: #ffffff"],
            *[style*="background-color: rgb(255"],
            *[style*="background-color:rgb(255"] {
                background-color: ${bodyBg} !important;
            }
            /* Fix tables — prevent fixed-width email tables from overflowing */
            table {
                border-color: rgba(255,255,255,0.08) !important;
                width: 100% !important;
                max-width: 100% !important;
                table-layout: fixed !important;
                border-collapse: collapse;
            }
            td, th {
                border-color: rgba(255,255,255,0.08) !important;
                max-width: 100% !important;
                overflow-wrap: break-word !important;
                word-break: break-word !important;
            }
            /* Remove centering margins that create awkward whitespace */
            table[align="center"], div[align="center"] {
                margin-left: 0 !important;
                margin-right: 0 !important;
            }
            img {
                max-width: 100% !important;
                height: auto !important;
                border-radius: 6px;
                opacity: 0.92;
                display: block;
            }
            a {
                color: ${linkColor} !important;
                text-decoration: underline !important;
            }
            /* Hide tracking pixels */
            img[width="1"], img[height="1"] {
                display: none !important;
            }
            /* Plain-text pre blocks */
            pre {
                white-space: pre-wrap !important;
                word-break: break-word !important;
                overflow-x: hidden !important;
                font-family: inherit !important;
                max-width: 680px;
                margin: 0 auto;
                line-height: 1.7;
            }
        `;

        let content;
        if (html) {
            if (/<html/i.test(html)) {
                content = html.replace(
                    /(<head[^>]*>)/i,
                    `$1<style>${overrideStyle}</style>`
                );
                // No <head>? Add before <body>
                if (content === html) {
                    content = html.replace(
                        /(<body[^>]*>)/i,
                        `<head><style>${overrideStyle}</style></head>$1`
                    );
                }
            } else {
                content = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${overrideStyle}</style></head><body>${html}</body></html>`;
            }
        } else {
            // Plain-text fallback — rendered as wrapped pre inside a centred prose block
            const escaped = (plainText || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            content = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${overrideStyle}</style></head><body><pre>${escaped}</pre></body></html>`;
        }

        doc.open();
        doc.write(content);
        doc.close();

        // Resize iframe to full content height so modal-body handles scrolling.
        const resize = () => {
            try {
                const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
                iframe.style.height = h + 'px';
            } catch (_) { }
        };

        iframe.onload = () => {
            resize();
            setLoaded(true);
            try {
                const imgs = doc.querySelectorAll('img');
                imgs.forEach(img => { img.onload = resize; });
            } catch (_) { }
        };
        setTimeout(resize, 80);
        setTimeout(() => { resize(); setLoaded(true); }, 350);
        setTimeout(resize, 800);
    }, [html, plainText, isDark, bodyBg, bodyText, linkColor]);

    useEffect(() => {
        writeContent();
    }, [writeContent]);

    return (
        <div style={{ position: 'relative' }}>
            {/* Shimmer skeleton while iframe loads */}
            {!loaded && (
                <div className="email-body-skeleton">
                    <div className="skeleton-line" style={{ width: '85%' }} />
                    <div className="skeleton-line" style={{ width: '70%' }} />
                    <div className="skeleton-line" style={{ width: '90%' }} />
                    <div className="skeleton-line" style={{ width: '60%' }} />
                    <div className="skeleton-line" style={{ width: '78%', marginTop: '16px' }} />
                    <div className="skeleton-line" style={{ width: '65%' }} />
                </div>
            )}
            <iframe
                ref={iframeRef}
                title="Email content"
                className="email-body-iframe"
                sandbox="allow-same-origin"
                scrolling="no"
                style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
            />
        </div>
    );
};

// Decodes HTML entities like &#39; → ' and &amp; → &
// Gmail snippets and subjects often contain HTML-encoded characters.
const decodeHtmlEntities = (html) => {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
};

/**
 * Strips HTML tags from a string and returns plain text.
 * Used to clean up garbled snippet text that may contain raw HTML.
 */
const stripHtml = (html) => {
    if (!html) return '';
    const decoded = decodeHtmlEntities(html);
    // Remove all HTML tags
    return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Deduplicates extractedDeadlines by calendar day.
 * When the same day has multiple times (e.g. "12:00 PM to 1:00 PM"),
 * keeps only the LATEST time for that day — so only ONE tag shows per date.
 * @param {Array} deadlines
 * @returns {Array}
 */
const deduplicateDeadlines = (deadlines) => {
    if (!deadlines || deadlines.length === 0) return [];
    const byDay = {};
    for (const d of deadlines) {
        const dayKey = new Date(d.date).toISOString().slice(0, 10); // YYYY-MM-DD
        if (!byDay[dayKey]) {
            byDay[dayKey] = d;
        } else {
            // Keep the later time for the same day (e.g., end time of a range)
            if (new Date(d.date) > new Date(byDay[dayKey].date)) {
                byDay[dayKey] = d;
            }
        }
    }
    return Object.values(byDay);
};

/**
 * Returns deadline display info based on the exact datetime (including time).
 * A deadline at 10:00 AM is MISSED after 10:00 AM — not just after midnight.
 * @param {string|Date} dateStr
 * @returns {{ label: string, status: 'expired'|'today'|'upcoming' }}
 */
const deadlineTag = (dateStr) => {
    const due = new Date(dateStr);
    const now = new Date();

    // Exact comparison — if the deadline moment has passed, it's CLOSED
    // We say "CLOSED" (not "MISSED") because the user may have already applied/submitted.
    if (due <= now) {
        return { label: 'CLOSED', status: 'expired' };
    }

    // Format date as DD-MM-YYYY
    const dd = String(due.getDate()).padStart(2, '0');
    const mm = String(due.getMonth() + 1).padStart(2, '0');
    const yyyy = due.getFullYear();
    const formatted = `${dd}-${mm}-${yyyy}`;

    // Check if it's today (even if in the future — e.g., deadline is at 11 PM)
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dueDay.getTime() === today.getTime()) {
        // Show the time too so user knows how much time is left today
        const timeStr = due.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        return { label: `DUE TODAY at ${timeStr}`, status: 'today' };
    }

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

    // Theme toggle — persisted in localStorage
    const [theme, setTheme] = useState(() => localStorage.getItem('caseo-theme') || 'dark');

    const toggleTheme = () => {
        setTheme(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('caseo-theme', next);
            return next;
        });
    };

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
            const now = new Date();
            // Priority = ONLY emails with at least one upcoming (future) deadline
            result = result.filter(e =>
                e.extractedDeadlines &&
                e.extractedDeadlines.length > 0 &&
                e.extractedDeadlines.some(d => new Date(d.date) > now)
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
        <div className="dashboard-layout" data-theme={theme}>
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo-icon">C</div>
                    <span className="logo-text">CASEO</span>
                </div>

                <div className="sidebar-section-label">Mailbox</div>
                <nav className="sidebar-nav">
                    <button className={`nav-item ${activeTab === 'inbox' ? 'active' : ''}`} onClick={() => setActiveTab('inbox')}>
                        <span className="icon">📥</span>
                        <span className="label">Inbox</span>
                        <span className="count">{emails.length}</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'priority' ? 'active' : ''}`} onClick={() => setActiveTab('priority')}>
                        <span className="icon">⚡</span>
                        <span className="label">Priority</span>
                        <span className="count">{(() => {
                            const now = new Date();
                            return emails.filter(e =>
                                e.extractedDeadlines &&
                                e.extractedDeadlines.length > 0 &&
                                e.extractedDeadlines.some(d => new Date(d.date) > now)
                            ).length;
                        })()}</span>
                    </button>
                    <button className={`nav-item ${activeTab === 'sent' ? 'active' : ''}`} onClick={() => switchTab('sent')}>
                        <span className="icon">✈️</span>
                        <span className="label">Sent</span>
                        {labelCounts.sent !== null && <span className="count">{labelCounts.sent}</span>}
                    </button>
                    <button className={`nav-item ${activeTab === 'drafts' ? 'active' : ''}`} onClick={() => switchTab('drafts')}>
                        <span className="icon">📝</span>
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
                        <button className="icon-btn" title="Notifications">🔔</button>
                        {/* Theme Toggle */}
                        <button
                            className="icon-btn theme-toggle-btn"
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                            aria-label="Toggle theme"
                        >
                            {theme === 'dark' ? (
                                // Sun icon for switching TO light
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="5" />
                                    <line x1="12" y1="1" x2="12" y2="3" />
                                    <line x1="12" y1="21" x2="12" y2="23" />
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                    <line x1="1" y1="12" x2="3" y2="12" />
                                    <line x1="21" y1="12" x2="23" y2="12" />
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                </svg>
                            ) : (
                                // Moon icon for switching TO dark
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                </svg>
                            )}
                        </button>
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
                            {filteredEmails.map((email, idx) => (
                                <div
                                    key={email._id}
                                    className={`email-item urgency-${email.urgency?.toLowerCase() || 'low'}`}
                                    onClick={() => openEmail(email)}
                                    style={{ animationDelay: `${Math.min(idx * 0.045, 0.4)}s` }}
                                >
                                    <div className="email-sender-avatar-sm">
                                        {(email.sender || 'U').replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="email-content">
                                        <div className="email-header">
                                            <div className="sender-info">
                                                <span className="sender-name">{email.sender}</span>
                                                {email.urgency === 'Critical' && <span className="status-dot"></span>}
                                            </div>
                                            <span className="email-time">{new Date(email.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>

                                        <h3 className="email-subject">
                                            {email.urgency === 'Critical' && <span className="urgent-prefix">URGENT:</span>} {decodeHtmlEntities(email.subject)}
                                        </h3>

                                        <p className="email-snippet">{stripHtml(email.snippet)}</p>

                                        <div className="email-tags">
                                            {(email.urgency === 'High' || email.urgency === 'Critical') && (
                                                <span className="tag tag-critical">
                                                    ⚠ {email.urgency.toUpperCase()} PRIORITY
                                                </span>
                                            )}
                                            {(() => {
                                                const dl = email.extractedDeadlines;
                                                if (!dl || dl.length === 0) return null;
                                                const now = new Date();
                                                const upcoming = dl
                                                    .filter(d => new Date(d.date) > now)
                                                    .sort((a, b) => new Date(a.date) - new Date(b.date));
                                                if (upcoming.length > 0) {
                                                    const { label, status } = deadlineTag(upcoming[0].date);
                                                    return (
                                                        <span className={`tag tag-deadline-${status}`}>
                                                            🕒 {label}
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <span className="tag tag-deadline-expired">
                                                        🔒 CLOSED
                                                    </span>
                                                );
                                            })()}
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

                            {/* ── Premium Modal Header ── */}
                            <div className="modal-header-premium">
                                <div className="modal-header-left">
                                    <div className="modal-sender-avatar">
                                        {(selectedEmail.sender || 'U').replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="modal-header-info">
                                        <h2 className="modal-subject-title">{decodeHtmlEntities(selectedEmail.subject)}</h2>
                                        <div className="modal-from-row">
                                            <span className="modal-from-label">From:</span>
                                            <span className="modal-from-value">{selectedEmail.sender}</span>
                                        </div>
                                        {selectedEmail.recipient && (
                                            <div className="modal-from-row">
                                                <span className="modal-from-label">To:</span>
                                                <span className="modal-from-value">{decodeHtmlEntities(selectedEmail.recipient)}</span>
                                            </div>
                                        )}
                                        <div className="modal-from-row">
                                            <span className="modal-from-label">Date:</span>
                                            <span className="modal-from-value modal-date-value">
                                                {new Date(selectedEmail.date).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button className="close-modal-btn" onClick={closeEmail}>&times;</button>
                            </div>

                            {/* ── Tags & Actions Row ── */}
                            <div className="modal-tags-bar">
                                <div className="modal-tags-left">
                                    {selectedEmail.urgency && (
                                        <span className={`tag tag-${selectedEmail.urgency.toLowerCase()}`}>
                                            {selectedEmail.urgency === 'Critical' ? '🔥' : selectedEmail.urgency === 'High' ? '⚠️' : selectedEmail.urgency === 'Medium' ? '⬆️' : '🔽'} {selectedEmail.urgency} Priority
                                        </span>
                                    )}
                                    {selectedEmail.extractedDeadlines && deduplicateDeadlines(selectedEmail.extractedDeadlines).map((d, i) => {
                                        const { label, status } = deadlineTag(d.date);
                                        return (
                                            <span key={i} className={`tag tag-deadline-${status}`}>
                                                <span>{status === 'expired' ? '🔒' : '🕒'}</span> {label}
                                            </span>
                                        );
                                    })}
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
                                </div>
                                <div className="modal-tags-right">
                                    {selectedEmail.extractedDeadlines &&
                                        deduplicateDeadlines(selectedEmail.extractedDeadlines).some(d => deadlineTag(d.date).status !== 'expired') && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); addToCalendar(selectedEmail); }}
                                                className="modal-calendar-btn"
                                                title="Add Primary Deadline to Google Calendar"
                                            >
                                                📅 Add to Calendar
                                            </button>
                                        )}
                                    <a
                                        href={`https://mail.google.com/mail/u/0/#inbox/${selectedEmail.googleMessageId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="modal-open-gmail-btn"
                                        title="Open in Gmail"
                                    >
                                        ↗ Open in Gmail
                                    </a>
                                </div>
                            </div>

                            {/* ── Email Body ── */}
                            <div className="modal-body">
                                {selectedEmail.body ? (
                                    <EmailBodyRenderer
                                        html={selectedEmail.body}
                                        plainText={selectedEmail.snippet}
                                        theme={theme}
                                    />
                                ) : (
                                    <div className="modal-no-body">
                                        <div className="modal-no-body-icon">📭</div>
                                        <p className="modal-no-body-title">Full email content not available</p>
                                        <p className="modal-no-body-hint">
                                            This email was stored before full body sync. Scan your inbox to load the content, or open it directly in Gmail.
                                        </p>
                                        <a
                                            href={`https://mail.google.com/mail/u/0/#inbox/${selectedEmail.googleMessageId}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="modal-open-gmail-btn"
                                            style={{ display: 'inline-flex', marginTop: '8px' }}
                                        >
                                            ↗ Open in Gmail
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
