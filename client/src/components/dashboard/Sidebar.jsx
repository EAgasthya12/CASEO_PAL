import React from 'react';
import { InboxIcon, PriorityIcon, SentIcon, SpamIcon, LogoutIcon, ShieldIcon } from './Icons';

const Sidebar = ({ activeTab, emails, priorityPreview, inboxTotal, labelCounts, user, imgError, setImgError, switchTab, setActiveTab, openPriorityEmail, handleLogout }) => {
    const unreadCount = labelCounts?.unread || 0;
    const totalPriorityCount = labelCounts?.priority ?? priorityPreview?.length ?? 0;

    const navItems = [
        {
            id: 'inbox',
            label: 'Inbox',
            icon: <InboxIcon />,
            count: inboxTotal || emails.length || null,
            badge: unreadCount > 0 ? unreadCount : null,
            badgeTitle: `${unreadCount} unread`,
        },
        {
            id: 'priority',
            label: 'Priority',
            icon: <PriorityIcon />,
            count: labelCounts.priority ?? 0,
        },
        {
            id: 'sent',
            label: 'Sent',
            icon: <SentIcon />,
            count: labelCounts.sent !== null ? labelCounts.sent : null,
            isMailbox: true,
        },
        {
            id: 'spam',
            label: 'Spam',
            icon: <SpamIcon />,
            count: labelCounts.spam !== null ? labelCounts.spam : null,
            isMailbox: true,
        },
    ];

    const preferenceItems = [
        {
            id: 'not_useful',
            label: 'Not Useful',
            icon: <ShieldIcon />,
            count: labelCounts?.notUseful != null ? labelCounts.notUseful : null,
            isMailbox: true, // we handle it like a mailbox since it fetches differently
        }
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="logo-icon">C</div>
                <span className="logo-text">CASEO</span>
            </div>

            <div className="sidebar-scrollable">
                <div className="sidebar-section-label">Mailbox</div>
            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => switchTab(item.id)}
                        title={item.badgeTitle || item.label}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="label">{item.label}</span>
                        <div className="nav-item-right">
                            {item.badge != null && (
                                <span className="unread-badge" title={item.badgeTitle}>{item.badge}</span>
                            )}
                            {item.count != null && (
                                <span className="count">{item.count}</span>
                            )}
                        </div>
                    </button>
                ))}
            </nav>

            {priorityPreview?.length > 0 && (
                <>
                    <div className="sidebar-section-label sidebar-priority-label">Priority Now</div>
                    <div className="priority-preview-list">
                        {(() => {
                            const urgencyOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
                            const sorted = [...priorityPreview].sort((a, b) => {
                                // 1. Primary Sort: Urgency Level (Highest First)
                                const aOrd = urgencyOrder[a.urgency] ?? 4;
                                const bOrd = urgencyOrder[b.urgency] ?? 4;
                                if (aOrd !== bOrd) return aOrd - bOrd;
                                
                                // 2. Secondary Sort: Priority Score (Highest First)
                                if ((b.priorityScore || 0) !== (a.priorityScore || 0)) {
                                    return (b.priorityScore || 0) - (a.priorityScore || 0);
                                }

                                // 3. Tertiary Sort: Date (Most Recent First)
                                return new Date(b.date) - new Date(a.date);
                            });
                            return sorted.slice(0, 5).map((email) => (
                                <button
                                    key={email._id}
                                    className="priority-preview-card"
                                    onClick={() => openPriorityEmail(email)}
                                    title={email.subject}
                                >
                                    <div className="priority-preview-top">
                                        <span className={`priority-pill priority-${(email.urgency || 'Low').toLowerCase()}`}>
                                            {email.urgency || 'Low'}
                                        </span>
                                        {!email.isRead && <span className="priority-unread-dot" />}
                                    </div>
                                    <div className="priority-preview-subject">{email.subject}</div>
                                    <div className="priority-preview-meta">
                                        <span>{email.sender}</span>
                                        <span>{new Date(email.date).toLocaleDateString('en-GB')}</span>
                                    </div>
                                </button>
                            ));
                        })()}
                        <button
                            className="priority-preview-link"
                            onClick={() => switchTab('priority')}
                        >
                            {totalPriorityCount > 5
                                ? `View all ${totalPriorityCount} priority mails`
                                : 'Open full priority inbox'}
                        </button>
                    </div>
                </>
            )}

            <div className="sidebar-section-label" style={{ marginTop: '24px' }}>Preferences</div>
            <nav className="sidebar-nav">
                {preferenceItems.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => switchTab(item.id)}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="label">{item.label}</span>
                    </button>
                ))}
            </nav>

            </div>

            <div className="user-profile">
                <div className="user-details">
                    <div className="avatar">
                        {user?.photo && !imgError ? (
                            <img
                                src={user.photo}
                                alt="Avatar"
                                referrerPolicy="no-referrer"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            user?.name?.charAt(0) || 'U'
                        )}
                    </div>
                    <div className="user-info">
                        <div className="name">{user?.name || 'Loading…'}</div>
                        <div className="email">{user?.email || ''}</div>
                    </div>
                </div>
                <button className="logout-icon-btn" onClick={handleLogout} title="Logout" aria-label="Logout">
                    <LogoutIcon />
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
