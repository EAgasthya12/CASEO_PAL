import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CalendarIcon, ExternalLinkIcon, ThumbsDownIcon } from './Icons';
import { decodeHtmlEntities, deduplicateDeadlines, deadlineTag } from './EmailItem';

// ── Sandboxed iframe renderer for HTML email bodies ───────────────────────────
const EmailBodyRenderer = ({ html, plainText, theme }) => {
    const iframeRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const isDark = theme !== 'light';
    const bodyBg = isDark ? '#111827' : '#fafbff';
    const bodyText = isDark ? '#cbd5e1' : '#334155';
    const linkColor = isDark ? '#818cf8' : '#4f46e5';

    const writeContent = useCallback(() => {
        setLoaded(false);
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        const overrideStyle = `
            *, *::before, *::after { box-sizing: border-box !important; }
            html, body {
                margin: 0 !important; padding: 24px 28px !important;
                background-color: ${bodyBg} !important; color: ${bodyText} !important;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                font-size: 14px !important; line-height: 1.75 !important;
                overflow-x: hidden !important; word-break: break-word !important; max-width: 100% !important;
            }
            * { max-width: 100% !important; }
            *[style*="color:#000"],*[style*="color: #000"],*[style*="color:black"],*[style*="color: black"],
            *[style*="color:#1"],*[style*="color:#2"],*[style*="color:#3"],*[style*="color:#333"],
            *[style*="color: rgb(0"] { color: ${bodyText} !important; }
            *[style*="background-color:#fff"],*[style*="background-color: #fff"],
            *[style*="background-color:white"],*[style*="background-color: white"],
            *[style*="background:#fff"],*[style*="background: #fff"],*[style*="background:white"],
            *[style*="background-color:#ffffff"],*[style*="background-color: #ffffff"],
            *[style*="background-color: rgb(255"],*[style*="background-color:rgb(255"]
            { background-color: ${bodyBg} !important; }
            table { border-color: rgba(255,255,255,0.08) !important; width: 100% !important;
                max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse; }
            td, th { border-color: rgba(255,255,255,0.08) !important; max-width: 100% !important;
                overflow-wrap: break-word !important; word-break: break-word !important; }
            table[align="center"], div[align="center"] { margin-left: 0 !important; margin-right: 0 !important; }
            img { max-width: 100% !important; height: auto !important; border-radius: 6px; opacity: 0.92; display: block; }
            a { color: ${linkColor} !important; text-decoration: underline !important; }
            img[width="1"], img[height="1"] { display: none !important; }
            pre { white-space: pre-wrap !important; word-break: break-word !important;
                overflow-x: hidden !important; font-family: inherit !important;
                max-width: 680px; margin: 0 auto; line-height: 1.7; }
        `;

        let content;
        if (html) {
            if (/^<html/i.test(html)) {
                content = html.replace(/(<head[^>]*>)/i, `$1<style>${overrideStyle}</style>`);
                if (content === html) {
                    content = html.replace(/(<body[^>]*>)/i, `<head><style>${overrideStyle}</style></head>$1`);
                }
            } else {
                content = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${overrideStyle}</style></head><body>${html}</body></html>`;
            }
        } else {
            const escaped = (plainText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            content = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${overrideStyle}</style></head><body><pre>${escaped}</pre></body></html>`;
        }

        doc.open();
        doc.write(content);
        doc.close();

        const resize = () => {
            try {
                const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 400;
                iframe.style.height = h + 'px';
            } catch (_) { }
        };
        iframe.onload = () => { resize(); setLoaded(true); try { doc.querySelectorAll('img').forEach(img => { img.onload = resize; }); } catch (_) { } };
        setTimeout(resize, 80);
        setTimeout(() => { resize(); setLoaded(true); }, 350);
        setTimeout(resize, 800);
    }, [html, plainText, isDark, bodyBg, bodyText, linkColor]);

    useEffect(() => { writeContent(); }, [writeContent]);

    return (
        <div style={{ position: 'relative' }}>
            {!loaded && (
                <div className="email-body-skeleton">
                    {[85, 70, 90, 60, 78, 65].map((w, i) => (
                        <div key={i} className="skeleton-line" style={{ width: `${w}%`, marginTop: i === 4 ? '16px' : undefined }} />
                    ))}
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

// ── EmailModal ────────────────────────────────────────────────────────────────
const EmailModal = ({ email, theme, categories, onClose, onCategoryChange, onMarkRead, onToggleUseful, activeTab }) => {
    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Mark as read when modal opens
    useEffect(() => {
        if (email && !email.isRead) {
            onMarkRead(email._id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [email?._id]);

    if (!email) return null;

    const handleAddToCalendar = async () => {
        if (!email.extractedDeadlines?.length) return;
        const now = new Date();
        const upcoming = email.extractedDeadlines
            .filter(d => new Date(d.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const primaryDeadline = upcoming.length > 0
            ? upcoming[0]
            : [...email.extractedDeadlines].sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        const toastId = toast.loading('Adding to Google Calendar…');
        try {
            const payload = {
                summary: `Deadline: ${primaryDeadline.text || email.subject.substring(0, 30)}`,
                description: `Email Context: ${email.subject}\n\nFrom: ${email.sender}\n\nLink: https://mail.google.com/mail/u/0/#inbox/${email.googleMessageId}\n\nSnippet: ${email.snippet}`,
                date: primaryDeadline.date,
            };
            const res = await axios.post('http://localhost:5000/api/calendar/add-event', payload, { withCredentials: true });
            if (res.data.success) {
                toast.success('Event added to Google Calendar!', { id: toastId });
            } else {
                toast.error('Failed to add event.', { id: toastId });
            }
        } catch {
            toast.error('Calendar error. Please try again.', { id: toastId });
        }
    };

    const handleCategoryChange = async (newCat) => {
        const toastId = toast.loading('Updating category…');
        try {
            const res = await axios.put(
                `http://localhost:5000/api/emails/${email._id}/category`,
                { category: newCat },
                { withCredentials: true }
            );
            onCategoryChange(res.data.email);
            toast.success(`Category updated to "${newCat}"`, { id: toastId });
        } catch {
            toast.error('Failed to update category.', { id: toastId });
        }
    };

    const dedupedDeadlines = deduplicateDeadlines(email.extractedDeadlines);
    const hasUpcomingDeadline = dedupedDeadlines.some(d => deadlineTag(d.date).status !== 'expired');

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Email detail">
            <div className="modal-content" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="modal-header-premium">
                    <div className="modal-header-left">
                        <div className="modal-sender-avatar" aria-hidden="true">
                            {(email.sender || 'U').replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase()}
                        </div>
                        <div className="modal-header-info">
                            <h2 className="modal-subject-title">{decodeHtmlEntities(email.subject)}</h2>
                            <div className="modal-from-row">
                                <span className="modal-from-label">From:</span>
                                <span className="modal-from-value">{email.sender}</span>
                            </div>
                            {email.recipient && (
                                <div className="modal-from-row">
                                    <span className="modal-from-label">To:</span>
                                    <span className="modal-from-value">{decodeHtmlEntities(email.recipient)}</span>
                                </div>
                            )}
                            <div className="modal-from-row">
                                <span className="modal-from-label">Date:</span>
                                <span className="modal-from-value modal-date-value">
                                    {new Date(email.date).toLocaleString('en-GB', {
                                        weekday: 'short', day: 'numeric', month: 'long',
                                        year: 'numeric', hour: '2-digit', minute: '2-digit',
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button className="close-modal-btn" onClick={onClose} aria-label="Close email">×</button>
                </div>

                {/* Tags bar — info only (wraps naturally) */}
                <div className="modal-tags-bar">
                    {email.urgency && (
                        <span className={`tag tag-${email.urgency.toLowerCase()}`}>
                            {email.urgency === 'Critical' ? '🔥' : email.urgency === 'High' ? '⚠️' : email.urgency === 'Medium' ? '⬆️' : '🔽'}{' '}
                            {email.urgency} Priority
                        </span>
                    )}
                    {dedupedDeadlines.map((d, i) => {
                        const { label, status } = deadlineTag(d.date);
                        return (
                            <span key={i} className={`tag tag-deadline-${status}`}>
                                {status === 'expired' ? '🔒' : '🕒'} {label}
                            </span>
                        );
                    })}
                    {email.category && (
                        <div className="modal-category-wrapper">
                            <span className="tag tag-category">#{email.category}</span>
                            <select
                                className="modal-category-select"
                                value={email.category}
                                onChange={e => handleCategoryChange(e.target.value)}
                                aria-label="Change email category"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                {!categories.includes(email.category) && (
                                    <option value={email.category}>{email.category}</option>
                                )}
                            </select>
                        </div>
                    )}
                </div>

                {/* Actions bar — fixed below tags */}
                <div className="modal-actions-bar">
                    {activeTab !== 'sent' && activeTab !== 'spam' && (
                        <button
                            className={`modal-toggle-useful-btn ${activeTab === 'not_useful' ? 'btn-restore' : 'btn-mute'}`}
                            onClick={() => onToggleUseful(email, activeTab === 'not_useful')}
                            title={activeTab === 'not_useful' ? "Restore to Inbox" : "Mark as Not Useful and Ignore Sender"}
                        >
                            {activeTab === 'not_useful' ? '↩ Restore' : <><ThumbsDownIcon /> Not Useful</>}
                        </button>
                    )}
                    {hasUpcomingDeadline && (
                        <button
                            className="modal-calendar-btn"
                            onClick={handleAddToCalendar}
                            title="Add deadline to Google Calendar"
                        >
                            <CalendarIcon /> Add to Calendar
                        </button>
                    )}
                    <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${email.googleMessageId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="modal-open-gmail-btn"
                        title="Open in Gmail"
                    >
                        <ExternalLinkIcon /> Open in Gmail
                    </a>
                </div>

                {/* Body */}
                <div className="modal-body">
                    {email.body ? (
                        <EmailBodyRenderer html={email.body} plainText={email.snippet} theme={theme} />
                    ) : (
                        <div className="modal-no-body">
                            <div className="modal-no-body-icon">📭</div>
                            <p className="modal-no-body-title">Full email content not available</p>
                            <p className="modal-no-body-hint">
                                This email was stored before full body sync. Scan your inbox to load
                                the content, or open it directly in Gmail.
                            </p>
                            <a
                                href={`https://mail.google.com/mail/u/0/#inbox/${email.googleMessageId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="modal-open-gmail-btn"
                                style={{ display: 'inline-flex', marginTop: '8px' }}
                            >
                                <ExternalLinkIcon /> Open in Gmail
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmailModal;
