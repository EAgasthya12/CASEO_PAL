import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

import './Dashboard.css';
import Sidebar from './dashboard/Sidebar';
import TopBar from './dashboard/TopBar';
import EmailItem, { MailboxEmailItem } from './dashboard/EmailItem';
import EmailModal from './dashboard/EmailModal';
import { FilterIcon, SortIcon } from './dashboard/Icons';

const MAILBOX_TABS = ['sent', 'spam'];
const API = 'http://localhost:5000';

const Dashboard = () => {
    // ── Core state ────────────────────────────────────────────────────────────
    const [emails, setEmails]             = useState([]);
    const [loading, setLoading]           = useState(false);
    const [activeTab, setActiveTab]       = useState('inbox');
    const [user, setUser]                 = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [userCategories, setUserCategories] = useState(['Academic', 'Internship', 'Job', 'Event', 'Personal']);
    const [imgError, setImgError]         = useState(false);

    // Theme — persisted in localStorage
    const [theme, setTheme] = useState(() => localStorage.getItem('caseo-theme') || 'dark');
    const toggleTheme = () => setTheme(prev => {
        const next = prev === 'dark' ? 'light' : 'dark';
        localStorage.setItem('caseo-theme', next);
        return next;
    });

    // ── Mailbox (Sent / Spam) state ───────────────────────────────────────────
    const [mailboxEmails, setMailboxEmails]   = useState([]);
    const [mailboxLoading, setMailboxLoading] = useState(false);
    const [labelCounts, setLabelCounts]       = useState({ sent: null, spam: null });

    // ── Filter / Sort state ───────────────────────────────────────────────────
    const [filterOpen, setFilterOpen]       = useState(false);
    const [sortOpen, setSortOpen]           = useState(false);
    const [filterCategory, setFilterCategory] = useState(null);
    const [sortConfig, setSortConfig] = useState({ type: 'date', dateVal: null, priorityOrder: 'high-low' });

    // ── Search state ──────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery]     = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);

    // ── Scan status ───────────────────────────────────────────────────────────
    const [scanStatus, setScanStatus] = useState({ running: false, processed: 0, total: 0 });

    // ── Pagination ────────────────────────────────────────────────────────────
    const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });

    // ── Data fetching ─────────────────────────────────────────────────────────
    const fetchUser = async () => {
        try {
            const res = await axios.get(`${API}/auth/current_user`, { withCredentials: true });
            setUser(res.data);
            if (res.data.categories) setUserCategories(res.data.categories);
        } catch (err) {
            console.error('Error fetching user:', err);
        }
    };

    const fetchEmails = useCallback(async (page = 1, fetchTab = 'inbox') => {
        try {
            const res = await axios.get(`${API}/api/emails?page=${page}&limit=100&tab=${fetchTab}`, { withCredentials: true });
            // Support both old (array) and new (paginated object) response formats
            if (Array.isArray(res.data)) {
                setEmails(res.data);
            } else {
                setEmails(res.data.emails || []);
                if (res.data.pagination) setPagination(res.data.pagination);
            }
        } catch (err) {
            console.error('Error fetching emails:', err);
            if (err.response?.status === 401) window.location.href = '/';
        }
    }, []);

    const fetchLabelCounts = async () => {
        try {
            const res = await axios.get(`${API}/api/emails/label-counts`, { withCredentials: true });
            setLabelCounts(res.data);
        } catch (err) {
            console.error('Error fetching label counts:', err);
        }
    };

    const fetchMailbox = async (tab) => {
        setMailboxLoading(true);
        setMailboxEmails([]);
        try {
            const res = await axios.get(`${API}/api/emails/mailbox?label=${tab}`, { withCredentials: true });
            setMailboxEmails(res.data);
        } catch (err) {
            console.error(`Error fetching ${tab}:`, err);
            toast.error(`Could not load ${tab} emails.`);
        }
        setMailboxLoading(false);
    };

    // ── Debounced search ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults(null); return; }
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await axios.get(
                    `${API}/api/emails/search?q=${encodeURIComponent(searchQuery.trim())}`,
                    { withCredentials: true }
                );
                setSearchResults(res.data.emails || []);
            } catch {
                setSearchResults([]);
            }
            setSearchLoading(false);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ── Scan / sync inbox ─────────────────────────────────────────────────────
    const syncEmails = async () => {
        if (loading) return; // Allow manual sync to trigger even if silent autoSync is in background 
        setLoading(true);
        try {
            await axios.post(`${API}/api/emails/reclassify?maxThreads=500`, {}, { withCredentials: true });
            await fetchEmails();
            toast.success('Scan started — your inbox is updating in the background.');

            const poll = setInterval(async () => {
                try {
                    const res = await axios.get(`${API}/api/emails/scan-status`, { withCredentials: true });
                    setScanStatus(res.data);
                    
                    // Only fetch DB emails continuously, skip heavy Google API (labelCounts) while running
                    await fetchEmails();
                    
                    if (!res.data.running) {
                        clearInterval(poll);
                        setLoading(false);
                        setScanStatus({ running: false, processed: 0, total: 0 });
                        await fetchLabelCounts(); // Only refresh heavy counts at the very end

                        if (res.data.processed === 0) {
                            toast.success('Your inbox is already up to date!');
                        } else {
                            toast.success(`Scan complete — ${res.data.processed} new emails processed.`);
                        }
                    }
                } catch {
                    clearInterval(poll);
                    setLoading(false);
                }
            }, 3000);
        } catch (err) {
            console.error('Error syncing emails:', err);
            toast.error('Failed to start scan. Please try again.');
            setLoading(false);
        }
    };

    // ── Navigation ────────────────────────────────────────────────────────────
    const switchTab = (tab) => {
        setActiveTab(tab);
        setSelectedEmail(null);
        if (MAILBOX_TABS.includes(tab)) {
            fetchMailbox(tab);
        } else if (tab === 'not_useful') {
            fetchEmails(1, 'not_useful');
        } else if (tab === 'priority') {
            fetchEmails(1, 'priority');
        } else {
            fetchEmails(1, 'inbox');
        }
    };

    const goToPage = (newPage) => {
        if (newPage < 1 || newPage > pagination.pages) return;
        let tabToFetch = 'inbox';
        if (activeTab === 'not_useful') tabToFetch = 'not_useful';
        if (activeTab === 'priority')   tabToFetch = 'priority';

        fetchEmails(newPage, tabToFetch);
        // Scroll to top of the list when page changes
        document.querySelector('.email-list')?.scrollTo(0, 0);
    };

    const handleLogout = () => { window.location.href = `${API}/auth/logout`; };

    // ── Email open / close ────────────────────────────────────────────────────
    const openEmail = (email) => setSelectedEmail(email);
    const closeEmail = () => setSelectedEmail(null);

    const handleMarkRead = useCallback(async (emailId) => {
        try {
            await axios.put(`${API}/api/emails/${emailId}/read`, {}, { withCredentials: true });
            setEmails(prev => prev.map(e => e._id === emailId ? { ...e, isRead: true } : e));
            if (selectedEmail?._id === emailId) setSelectedEmail(prev => ({ ...prev, isRead: true }));
        } catch { /* non-critical */ }
    }, [selectedEmail?._id]);

    const handleCategoryChange = useCallback((updatedEmail) => {
        setSelectedEmail(updatedEmail);
        setEmails(prev => prev.map(e => e._id === updatedEmail._id ? { ...e, category: updatedEmail.category } : e));
    }, []);

    const handleIgnoreSender = useCallback(async (sender) => {
        const tId = toast.loading('Blocking sender...');
        try {
            await axios.post(`${API}/api/users/ignore-sender`, { sender }, { withCredentials: true });
            setEmails(prev => prev.filter(e => e.sender !== sender));
            toast.success(`Sender blocked and emails removed.`, { id: tId });
        } catch {
            toast.error('Failed to ignore sender', { id: tId });
        }
    }, []);

    const handleToggleUseful = useCallback(async (email, isUseful) => {
        const origId = email._id;
        try {
            await axios.put(`${API}/api/emails/${origId}/useful`, { isUseful }, { withCredentials: true });
            // Remove from current view
            setEmails(prev => prev.filter(e => e._id !== origId));
            setSelectedEmail(null);

            if (!isUseful) {
                toast((t) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <strong style={{ margin: 0 }}>Moved to Not Useful</strong>
                        <span style={{ fontSize: '0.85rem' }}>Do you want to ignore all future emails from {email.sender}?</span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                            <button 
                                onClick={() => { handleIgnoreSender(email.sender); toast.dismiss(t.id); }}
                                style={{ background: '#dc2626', color: 'white', padding: '4px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                Yes, Block Sender
                            </button>
                            <button 
                                onClick={() => toast.dismiss(t.id)}
                                style={{ background: 'transparent', color: 'inherit', padding: '4px 8px', borderRadius: '4px', border: '1px solid currentColor', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                No, Just This Email
                            </button>
                        </div>
                    </div>
                ), { duration: 8000 });
            } else {
                toast.success('Restored to Inbox');
            }
        } catch {
            toast.error('Failed to update email status');
        }
    }, [handleIgnoreSender]);

    // ── Filter / Sort helpers ─────────────────────────────────────────────────
    const toggleFilter = () => { setFilterOpen(o => !o); setSortOpen(false); };
    const toggleSort   = () => { setSortOpen(o => !o); setFilterOpen(false); };

    // Close dropdowns on outside click
    useEffect(() => {
        const close = (e) => {
            if (!e.target.closest('.action-wrapper')) {
                setFilterOpen(false);
                setSortOpen(false);
            }
        };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, []);

    const processEmails = () => {
        let result = [...emails];

        if (filterCategory) result = result.filter(e => e.category === filterCategory);
        if (sortConfig.type === 'date' && sortConfig.dateVal) {
            const selectedTime = new Date(sortConfig.dateVal).getTime();
            result = result.filter(e => new Date(e.date).getTime() >= selectedTime);
        }
        const urgencyScore = { Critical: 4, High: 3, Medium: 2, Low: 1, Unknown: 0 };
        result.sort((a, b) =>
            sortConfig.type === 'priority'
                ? sortConfig.priorityOrder === 'high-low'
                    ? (urgencyScore[b.urgency] || 0) - (urgencyScore[a.urgency] || 0)
                    : (urgencyScore[a.urgency] || 0) - (urgencyScore[b.urgency] || 0)
                : new Date(b.date) - new Date(a.date)
        );
        return result;
    };

    // ── Initial load ──────────────────────────────────────────────────────────
    useEffect(() => {
        fetchUser();
        fetchLabelCounts();
        
        // Fetch DB data first for instant render, then silently sync newest emails
        fetchEmails().then(() => {
            const autoSync = async () => {
                try {
                    // Only auto-sync if we have very little data (likely first login)
                    if (pagination.total > 50) return;

                    // Trigger the background sync without throwing a massive loading screen blocking the UI
                    setScanStatus({ running: true, processed: 0, total: 0, auto: true });
                    await axios.post(`${API}/api/emails/reclassify?maxThreads=100`, {}, { withCredentials: true });
                    
                    const poll = setInterval(async () => {
                        try {
                            const res = await axios.get(`${API}/api/emails/scan-status`, { withCredentials: true });
                                setScanStatus(res.data);
                                if (res.data.running) {
                                    fetchEmails();
                                } else {
                                    clearInterval(poll);
                                    setScanStatus({ running: false, processed: 0, total: 0 });
                                    fetchEmails();
                                    fetchLabelCounts(); // Final refresh
                                }
                        } catch {
                            clearInterval(poll);
                        }
                    }, 4000);
                } catch (e) {
                    // Fail silently so it doesn't disrupt the user if offline
                }
            };
            autoSync();
        });
        
    }, [fetchEmails]);

    const filteredEmails = searchQuery.trim() ? (searchResults ?? []) : processEmails();
    const categories = userCategories;
    const isMailboxTab = MAILBOX_TABS.includes(activeTab);

    return (
        <div className="dashboard-layout" data-theme={theme}>
            {/* Toast notifications — replaces all window.alert / window.confirm */}
            <Toaster
                position="bottom-right"
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: theme === 'dark' ? '#1e2741' : '#fff',
                        color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                        border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontFamily: 'Inter, sans-serif',
                    },
                }}
            />

            <Sidebar
                activeTab={activeTab}
                emails={emails}
                inboxTotal={pagination.total}
                labelCounts={labelCounts}
                user={user}
                imgError={imgError}
                setImgError={setImgError}
                switchTab={switchTab}
                setActiveTab={setActiveTab}
                handleLogout={handleLogout}
            />

            <main className="main-content">
                <TopBar
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    loading={loading}
                    syncEmails={syncEmails}
                    scanStatus={scanStatus}
                />

                <div className="content-area">
                    <div className="content-header">
                        <h1>
                                {searchQuery
                                    ? searchLoading
                                        ? 'Searching…'
                                        : `${searchResults?.length ?? 0} result${searchResults?.length !== 1 ? 's' : ''} for "${searchQuery}"`
                                    : activeTab === 'priority' ? 'Priority'
                                        : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
                                }
                            </h1>

                        {!isMailboxTab && (
                            <div className="view-actions">
                                {/* ── Inline Pagination Arrows ── */}
                                {!searchQuery.trim() && pagination.pages > 1 && (activeTab === 'inbox' || activeTab === 'not_useful') && (
                                    <div className="pagination-inline">
                                        <button
                                            className="pagination-arrow-btn"
                                            disabled={pagination.page <= 1}
                                            onClick={() => goToPage(pagination.page - 1)}
                                            title="Previous page"
                                        >
                                            ◀
                                        </button>
                                        <span className="pagination-page-info">
                                            {pagination.page} / {pagination.pages}
                                        </span>
                                        <button
                                            className="pagination-arrow-btn"
                                            disabled={pagination.page >= pagination.pages}
                                            onClick={() => goToPage(pagination.page + 1)}
                                            title="Next page"
                                        >
                                            ▶
                                        </button>
                                    </div>
                                )}

                                {/* Filter */}
                                <div className="action-wrapper">
                                    <button
                                        className={`filter-btn ${filterCategory ? 'active' : ''}`}
                                        onClick={toggleFilter}
                                        aria-expanded={filterOpen}
                                    >
                                        <FilterIcon /> Filter{filterCategory ? `: ${filterCategory}` : ''}
                                    </button>
                                    {filterOpen && (
                                        <div className="dropdown-menu" role="menu">
                                            <div className="submenu-label">Category</div>
                                            <div className="category-row">
                                                {categories.map(cat => (
                                                    <span
                                                        key={cat}
                                                        className={`category-chip ${filterCategory === cat ? 'active' : ''}`}
                                                        onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                                                        role="menuitemcheckbox"
                                                        aria-checked={filterCategory === cat}
                                                    >
                                                        {cat} {labelCounts?.categories?.[cat] ? `(${labelCounts.categories[cat]})` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Sort */}
                                <div className="action-wrapper">
                                    <button
                                        className="sort-btn"
                                        onClick={toggleSort}
                                        aria-expanded={sortOpen}
                                    >
                                        <SortIcon /> Sort: {sortConfig.type === 'date' ? 'Date' : 'Priority'}
                                    </button>
                                    {sortOpen && (
                                        <div className="dropdown-menu" role="menu">
                                            <div className="sort-option-container">
                                                <div
                                                    className={`dropdown-item ${sortConfig.type === 'date' ? 'selected' : ''}`}
                                                    onClick={() => setSortConfig(c => ({ ...c, type: 'date' }))}
                                                    role="menuitem"
                                                >
                                                    Sort by Date
                                                </div>
                                                {sortConfig.type === 'date' && (
                                                    <div style={{ padding: '0 8px 8px' }}>
                                                        <span className="submenu-label">From date:</span>
                                                        <input
                                                            type="date"
                                                            className="date-picker"
                                                            value={sortConfig.dateVal || ''}
                                                            onChange={e => setSortConfig(c => ({ ...c, dateVal: e.target.value }))}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                                            <div className="sort-option-container">
                                                <div
                                                    className={`dropdown-item ${sortConfig.type === 'priority' ? 'selected' : ''}`}
                                                    onClick={() => setSortConfig(c => ({ ...c, type: 'priority' }))}
                                                    role="menuitem"
                                                >
                                                    Sort by Priority
                                                </div>
                                                {sortConfig.type === 'priority' && (
                                                    <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {['high-low', 'low-high'].map(order => (
                                                            <span
                                                                key={order}
                                                                className={`dropdown-item ${sortConfig.priorityOrder === order ? 'selected' : ''}`}
                                                                style={{ fontSize: '0.85rem', padding: '6px' }}
                                                                onClick={e => { e.stopPropagation(); setSortConfig(c => ({ ...c, priorityOrder: order })); }}
                                                                role="menuitem"
                                                            >
                                                                {order === 'high-low' ? 'High → Low' : 'Low → High'}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Email List ── */}
                    <div className="email-list">
                        {isMailboxTab ? (
                            <>
                                {activeTab === 'spam' && (
                                    <div className="spam-warning">
                                        <span>⚠️</span>
                                        <p><strong>Check your spam carefully.</strong> Some useful emails might mistakenly get caught here by Gmail.</p>
                                    </div>
                                )}
                                {mailboxLoading && (
                                    <div className="empty-state">
                                        <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                                        <p>Loading {activeTab}…</p>
                                    </div>
                                )}
                                {!mailboxLoading && mailboxEmails.length === 0 && (
                                    <div className="empty-state"><p>No emails in {activeTab}.</p></div>
                                )}
                                {!mailboxLoading && mailboxEmails.map(email => (
                                    <MailboxEmailItem key={email._id} email={email} tab={activeTab} onClick={openEmail} />
                                ))}
                            </>
                        ) : (
                            <>
                                {filteredEmails.map((email, idx) => (
                                    <EmailItem key={email._id} email={email} index={idx} onClick={openEmail} />
                                ))}
                                {filteredEmails.length === 0 && (
                                    <div className="empty-state">
                                        {scanStatus.running ? (
                                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                                <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                                                <h3 style={{ margin: '0 0 8px' }}>Scanning your inbox...</h3>
                                                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                                    CASEO AI is reading and categorizing your recent emails. This might take a minute on your first login.
                                                </p>
                                            </div>
                                        ) : (
                                            <p>{searchQuery ? 'No results found.' : 'No emails match your filters.'}</p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    

                </div>

                {/* Email Detail Modal */}
                {selectedEmail && (
                    <EmailModal
                        email={selectedEmail}
                        theme={theme}
                        categories={categories}
                        onClose={closeEmail}
                        onCategoryChange={handleCategoryChange}
                        onMarkRead={handleMarkRead}
                        onToggleUseful={handleToggleUseful}
                        activeTab={activeTab}
                    />
                )}
            </main>
        </div>
    );
};

export default Dashboard;
