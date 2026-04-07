import React from 'react';
import { InboxIcon, PriorityIcon, SentIcon, SpamIcon, LogoutIcon, ShieldIcon } from './Icons';

const Sidebar = ({ activeTab, emails, inboxTotal, labelCounts, user, imgError, setImgError, switchTab, setActiveTab, handleLogout }) => {
    const now = new Date();
    const priorityCount = emails.filter(e =>
        (e.urgency === 'Critical' || e.urgency === 'High') ||
        (e.extractedDeadlines?.length > 0 && e.extractedDeadlines.some(d => new Date(d.date) > now))
    ).length;

    const unreadCount = labelCounts?.unread || 0;

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
