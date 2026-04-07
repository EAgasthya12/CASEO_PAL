import React from 'react';

// ── Utility: decode HTML entities (e.g. &#39; → ') ─────────────────────────
export const decodeHtmlEntities = (html) => {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
};

// ── Utility: strip HTML tags for plain snippet display ────────────────────────
export const stripHtml = (html) => {
    if (!html) return '';
    return decodeHtmlEntities(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

// ── Utility: extract display name from "Name <email>" sender strings ──────────
export const senderName = (sender) => {
    if (!sender) return 'Unknown';
    // "Display Name <email@domain.com>" → "Display Name"
    const match = sender.match(/^([^<]+)<[^>]+>/);
    if (match) return match[1].trim();
    // If it's just a bare email with no name, show the local part before @
    if (sender.includes('@') && !sender.includes(' ')) {
        return sender.split('@')[0];
    }
    return sender.trim();
};

// ── Utility: dedup deadlines by calendar day, keep latest time for same day ──
export const deduplicateDeadlines = (deadlines) => {
    if (!deadlines?.length) return [];
    const byDay = {};
    for (const d of deadlines) {
        const dayKey = new Date(d.date).toISOString().slice(0, 10);
        if (!byDay[dayKey] || new Date(d.date) > new Date(byDay[dayKey].date)) {
            byDay[dayKey] = d;
        }
    }
    return Object.values(byDay);
};

// ── Utility: compute deadline tag label + status ──────────────────────────────
export const deadlineTag = (dateStr) => {
    const due = new Date(dateStr);
    const now = new Date();

    if (due <= now) return { label: 'CLOSED', status: 'expired' };

    const dd = String(due.getDate()).padStart(2, '0');
    const mm = String(due.getMonth() + 1).padStart(2, '0');
    const yyyy = due.getFullYear();
    const formatted = `${dd}-${mm}-${yyyy}`;

    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dueDay.getTime() === today.getTime()) {
        const timeStr = due.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        return { label: `DUE TODAY at ${timeStr}`, status: 'today' };
    }

    return { label: `DUE: ${formatted}`, status: 'upcoming' };
};

// ── EmailItem — single email row ─────────────────────────────────────────────
const EmailItem = ({ email, index, onClick }) => {
    const now = new Date();
    const upcoming = (email.extractedDeadlines || [])
        .filter(d => new Date(d.date) > now)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const nextDeadline = upcoming[0] || null;
    const hasExpiredOnly = !nextDeadline && email.extractedDeadlines?.length > 0;

    const senderInitial = (email.sender || 'U').replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase() || 'U';

    return (
        <div
            className={`email-item urgency-${email.urgency?.toLowerCase() || 'low'} ${!email.isRead ? 'email-unread' : ''}`}
            onClick={() => onClick(email)}
            style={{ animationDelay: `${Math.min(index * 0.04, 0.4)}s` }}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onClick(email)}
            aria-label={`Email from ${email.sender}: ${email.subject}`}
        >
            {/* Unread indicator dot */}
            {!email.isRead && <span className="unread-dot" aria-label="Unread" />}

            <div className="email-sender-avatar-sm" aria-hidden="true">
                {senderInitial}
            </div>

            <div className="email-content">
                <div className="email-header">
                    <div className="sender-info">
                <span className="sender-name">{senderName(email.sender)}</span>
                        {email.urgency === 'Critical' && <span className="status-dot" aria-label="Critical urgency" />}
                    </div>
                    <span className="email-time">
                        {new Date(email.date).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                </div>

                <h3 className="email-subject">
                    {email.urgency === 'Critical' && <span className="urgent-prefix">URGENT:</span>}{' '}
                    {decodeHtmlEntities(email.subject)}
                </h3>

                <p className="email-snippet">{stripHtml(email.snippet)}</p>

                <div className="email-tags">
                    {(email.urgency === 'High' || email.urgency === 'Critical') && (
                        <span className="tag tag-critical">⚠ {email.urgency.toUpperCase()} PRIORITY</span>
                    )}
                    {nextDeadline && (() => {
                        const { label, status } = deadlineTag(nextDeadline.date);
                        return <span className={`tag tag-deadline-${status}`}>🕒 {label}</span>;
                    })()}
                    {hasExpiredOnly && <span className="tag tag-deadline-expired">🔒 CLOSED</span>}
                    <span className="tag tag-category">#{email.category}</span>
                </div>
            </div>
        </div>
    );
};

// ── MailboxItem — sent/spam email row (no AI tags) ────────────────────────────
export const MailboxEmailItem = ({ email, tab, onClick }) => (
    <div className={`email-item ${email.isPotentiallyImportant ? 'urgency-critical' : 'urgency-low'}`} onClick={() => onClick(email)} role="button" tabIndex={0}>
        <div className="email-content">
            <div className="email-header">
                <div className="sender-info">
                    <span className="sender-name">
                        {tab === 'sent'
                            ? `To: ${decodeHtmlEntities(email.recipient)}`
                            : senderName(email.sender)
                        }
                    </span>
                    {email.isPotentiallyImportant && <span className="status-dot" aria-label="Important Spam" />}
                </div>
                <span className="email-time">
                    {new Date(email.date).toLocaleString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    })}
                </span>
            </div>
            <h3 className="email-subject">
                {email.isPotentiallyImportant && <span className="urgent-prefix" style={{color: '#dc2626'}}>NOT SPAM?</span>}{' '}
                {decodeHtmlEntities(email.subject)}
            </h3>
            <p className="email-snippet">{decodeHtmlEntities(email.snippet)}</p>
            {email.isPotentiallyImportant && (
                <div className="email-tags">
                    <span className="tag tag-critical">⚠ IMPORTANT SPAM DETECTED ({email.category})</span>
                </div>
            )}
        </div>
    </div>
);

export default EmailItem;
