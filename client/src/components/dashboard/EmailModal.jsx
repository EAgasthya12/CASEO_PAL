import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ExternalLinkIcon } from './Icons';
import { decodeHtmlEntities, deduplicateDeadlines, deadlineTag } from './EmailItem';

const API = window.Capacitor?.isNativePlatform?.() ? 'http://10.0.2.2:5000' : 'http://localhost:5000';


// ── Pill Ribbon CSS injected once ─────────────────────────────────────────────
const RIBBON_STYLE = `
.pill-ribbon {
    display: flex; align-items: stretch;
    background: var(--modal-ribbon-bg, #fff);
    border: 1px solid rgba(0,0,0,0.13);
    border-radius: 11px;
    overflow: visible;
    flex-wrap: wrap;
    margin: 0 20px;
    position: relative;
}
.pill-ribbon .pr-seg {
    display: flex; align-items: center; gap: 7px;
    padding: 0 15px; height: 42px; white-space: nowrap;
    border-right: 0.5px solid rgba(0,0,0,0.08);
    flex-shrink: 0;
}
.pill-ribbon .pr-seg:last-child { border-right: none; }
.pill-ribbon .pr-priority {
    background: rgba(220,38,38,0.07);
    border-right-color: rgba(220,38,38,0.18);
    border-top-left-radius: 11px; border-bottom-left-radius: 11px;
}
.pill-ribbon .pr-priority-text { font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
.pill-ribbon .pr-priority-critical { color: #dc2626; }
.pill-ribbon .pr-priority-high     { color: #ea580c; }
.pill-ribbon .pr-priority-medium   { color: #d97706; }
.pill-ribbon .pr-priority-low      { color: #65a30d; }
.pill-ribbon .pr-date-div { width:1px; height:18px; background:rgba(0,0,0,0.08); flex-shrink:0; }
.pill-ribbon .pr-date-upcoming      { font-size:12px; font-weight:600; color:#d97706; }
.pill-ribbon .pr-date-expired       { font-size:12px; color:#9ca3af; text-decoration:line-through; opacity:0.55; }
.pill-ribbon .pr-date-upcoming-plain{ font-size:12px; color:#6b7280; }
.pill-ribbon .pr-cat-wrap  { position:relative; display:flex; align-items:stretch; flex-shrink:0; }
.pill-ribbon .pr-cat-seg   { display:flex; align-items:center; gap:6px; padding:0 14px; height:42px; cursor:pointer; background:rgba(99,102,241,0.07); border-right:0.5px solid rgba(99,102,241,0.2); user-select:none; transition:background 0.15s; }
.pill-ribbon .pr-cat-seg:hover { background:rgba(99,102,241,0.13); }
.pill-ribbon .pr-cat-hash   { font-size:13px; font-weight:700; color:#6366f1; opacity:0.6; }
.pill-ribbon .pr-cat-label  { font-size:12px; font-weight:500; color:#6366f1; }
.pill-ribbon .pr-cat-chevron { transition:transform 0.2s; }
.pill-ribbon .pr-cat-chevron.open { transform:rotate(180deg); }
.pill-ribbon .pr-cat-dropdown {
    display:none; position:absolute; top:calc(100% + 7px); left:0;
    background:var(--modal-ribbon-bg,#fff);
    border:1px solid rgba(0,0,0,0.12); border-radius:9px;
    min-width:160px; z-index:200;
    max-height:200px; overflow-y:auto;
}
.pill-ribbon .pr-cat-dropdown.open { display:block; }
.pill-ribbon .pr-cat-option { padding:9px 15px; font-size:12px; color:inherit; cursor:pointer; transition:background 0.1s; }
.pill-ribbon .pr-cat-option:hover { background:rgba(0,0,0,0.04); }
.pill-ribbon .pr-cat-option.active { color:#6366f1; font-weight:500; }
.pill-ribbon .pr-spacer { flex:1; min-width:6px; border-right:none; }
.pill-ribbon .pr-action {
    display:flex; align-items:center; justify-content:center;
    width:46px; height:42px; flex-shrink:0;
    border:none; background:none; cursor:pointer;
    border-left:0.5px solid rgba(0,0,0,0.08);
    transition:background 0.15s; text-decoration:none; color:inherit;
}
.pill-ribbon .pr-action:hover { background:rgba(0,0,0,0.04); }
.pill-ribbon .pr-action-last { border-top-right-radius:11px; border-bottom-right-radius:11px; }
.pill-ribbon .pr-action-restore { font-size:11px; font-weight:500; color:#6366f1; width:auto; padding:0 13px; gap:5px; }
`;

function injectRibbonStyle() {
    if (document.getElementById('pill-ribbon-style')) return;
    const el = document.createElement('style');
    el.id = 'pill-ribbon-style';
    el.textContent = RIBBON_STYLE;
    document.head.appendChild(el);
}

// ── Format date as DD-MM-YYYY ─────────────────────────────────────────────────
function formatDateDMY(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function formatDateTimeDetailed(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;

    const hasTime = !(
        d.getUTCHours() === 0 &&
        d.getUTCMinutes() === 0 &&
        d.getUTCSeconds() === 0 &&
        d.getUTCMilliseconds() === 0
    );

    return d.toLocaleString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
}

function buildCalendarPayload(email, deadline) {
    const parsed = new Date(deadline.date);
    const hasTime = !Number.isNaN(parsed.getTime()) && !(
        parsed.getUTCHours() === 0 &&
        parsed.getUTCMinutes() === 0 &&
        parsed.getUTCSeconds() === 0 &&
        parsed.getUTCMilliseconds() === 0
    );

    return {
        summary: `${deadline.label || 'Important date'}: ${deadline.text || decodeHtmlEntities(email.subject).slice(0, 60)}`,
        description: [
            `Email: ${decodeHtmlEntities(email.subject)}`,
            `From: ${email.sender}`,
            deadline.text ? `Extracted date text: ${deadline.text}` : null,
            `Label: ${deadline.label || 'Important date'}`,
            `Gmail link: https://mail.google.com/mail/u/0/#inbox/${email.googleMessageId}`,
            '',
            `Snippet: ${email.snippet || ''}`,
        ].filter(Boolean).join('\n'),
        date: deadline.date,
        ...(hasTime ? { dateTime: deadline.date } : {}),
    };
}

// ── Priority icon + colour config ─────────────────────────────────────────────
function getPriorityConfig(urgency) {
    switch (urgency) {
        case 'Critical': return {
            cls: 'pr-priority-critical',
            icon: (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="#dc2626">
                    <path d="M6 1L7.5 4.5H11L8.5 6.5L9.5 10L6 8L2.5 10L3.5 6.5L1 4.5H4.5Z" />
                </svg>
            ),
        };
        case 'High': return {
            cls: 'pr-priority-high',
            icon: (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
                    stroke="#ea580c" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 9V4M3.5 6.5L6 4l2.5 2.5" />
                </svg>
            ),
        };
        case 'Medium': return {
            cls: 'pr-priority-medium',
            icon: (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
                    stroke="#d97706" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M2 4h8M2 8h8" />
                </svg>
            ),
        };
        default: return {
            cls: 'pr-priority-low',
            icon: (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
                    stroke="#65a30d" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 3v5M3.5 5.5L6 8l2.5-2.5" />
                </svg>
            ),
        };
    }
}

// ── PillRibbon ────────────────────────────────────────────────────────────────
const PillRibbon = ({
    email,
    categories,
    dedupedDeadlines,
    hasUpcomingDeadline,
    activeTab,
    onCategoryChange,
    onToggleUseful,
    onSummarize,
    isSummarizing,
    onAddToCalendar,
}) => {
    const [dropOpen, setDropOpen] = useState(false);
    const dropRef = useRef(null);

    const [hovered, setHovered] = useState(null);

    const tooltipStyle = {
        position: 'absolute',
        bottom: '120%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#111',
        color: '#fff',
        fontSize: '11px',
        padding: '4px 8px',
        borderRadius: '6px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        opacity: 0.95,
        zIndex: 10
    };

    const wrapperStyle = {
        position: 'relative',
        display: 'flex'
    };

    useEffect(() => {
        if (!dropOpen) return;
        const handler = (e) => {
            if (dropRef.current && !dropRef.current.contains(e.target)) {
                setDropOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dropOpen]);

    const priorityConfig = email.urgency ? getPriorityConfig(email.urgency) : null;
    const showNotUseful = activeTab !== 'sent' && activeTab !== 'spam';
    const isRestoreMode = activeTab === 'not_useful';

    const actionStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none'
    };

    const iconStyle = {
        width: 20,
        height: 20
    };

    return (
        <div className="pill-ribbon">

            {/* Priority */}
            {priorityConfig && (
                <div className="pr-seg pr-priority">
                    {priorityConfig.icon}
                    <span className={`pr-priority-text ${priorityConfig.cls}`}>
                        {email.urgency}
                    </span>
                </div>
            )}

            {/* Deadlines */}
            {dedupedDeadlines.length > 0 && (
                <div className="pr-seg">
                    <svg style={iconStyle} viewBox="0 0 16 16" fill="none"
                        stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 5v3l2 2" />
                    </svg>

                    {dedupedDeadlines.map((d, i) => {
                        const { status } = deadlineTag(d.date);
                        const isExpired = status === 'expired';
                        const formatted = formatDateDMY(d.date);

                        const isFirstUpcoming =
                            !isExpired &&
                            dedupedDeadlines
                                .slice(0, i)
                                .every(p => deadlineTag(p.date).status === 'expired');

                        return (
                            <React.Fragment key={i}>
                                {i > 0 && <div className="pr-date-div" />}
                                <span className={
                                    isExpired
                                        ? 'pr-date-expired'
                                        : isFirstUpcoming
                                            ? 'pr-date-upcoming'
                                            : 'pr-date-upcoming-plain'
                                }>
                                    {formatted}
                                </span>
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Category */}
            {email.category && (
                <div className="pr-cat-wrap" ref={dropRef}>
                    <div
                        className="pr-cat-seg"
                        onClick={() => setDropOpen(o => !o)}
                    >
                        <span className="pr-cat-hash">#</span>
                        <span className="pr-cat-label">{email.category}</span>
                        <svg
                            style={{ width: 10, height: 10 }}
                            className={`pr-cat-chevron ${dropOpen ? 'open' : ''}`}
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="1.5"
                        >
                            <path d="M3 4.5l3 3 3-3" />
                        </svg>
                    </div>

                    <div className={`pr-cat-dropdown ${dropOpen ? 'open' : ''}`}>
                        {categories.map(c => (
                            <div
                                key={c}
                                className={`pr-cat-option ${c === email.category ? 'active' : ''}`}
                                onClick={() => {
                                    setDropOpen(false);
                                    onCategoryChange(c);
                                }}
                            >
                                {c}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="pr-seg pr-spacer" />

            {/* Not Useful / Restore */}
            {showNotUseful && (
                isRestoreMode ? (
                    <button
                        style={actionStyle}
                        onClick={() => onToggleUseful(email, true)}
                    >
                        Restore
                    </button>
                ) : (
                    <div
                        style={wrapperStyle}
                        onMouseEnter={() => setHovered('dislike')}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <button
                            style={actionStyle}
                            onClick={() => onToggleUseful(email, false)}
                        >
                            <svg style={iconStyle} viewBox="0 0 24 24" fill="none"
                                stroke="#ef4444" strokeWidth="1.7"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 2H19a2 2 0 012 2v7a2 2 0 01-2 2h-2" />
                                <path d="M17 11L12 22C11 22 10 21.5 10 21v-5H6a2 2 0 01-2-2l1-9a2 2 0 012-2h10v9z" />
                            </svg>
                        </button>
                        {hovered === 'dislike' && (
                            <div style={tooltipStyle}>Ignore this mail / sender</div>
                        )}
                    </div>
                )
            )}

            <div
                style={wrapperStyle}
                onMouseEnter={() => setHovered('summarize')}
                onMouseLeave={() => setHovered(null)}
            >
                <button
                    style={actionStyle}
                    onClick={onSummarize}
                    disabled={isSummarizing}
                    aria-label="Summarize email"
                >
                    <svg style={iconStyle} viewBox="0 0 24 24" fill="none"
                        stroke="#0ea5e9" strokeWidth="1.7"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 6h16M4 12h10M4 18h7" />
                    </svg>
                </button>
                {hovered === 'summarize' && (
                    <div style={tooltipStyle}>{isSummarizing ? 'Summarizing...' : 'Summarize email'}</div>
                )}
            </div>

            {/* Calendar */}
            {hasUpcomingDeadline && (
                <div
                    style={wrapperStyle}
                    onMouseEnter={() => setHovered('calendar')}
                    onMouseLeave={() => setHovered(null)}
                >
                    <button
                        style={actionStyle}
                        onClick={onAddToCalendar}
                    >
                        <svg style={iconStyle} viewBox="0 0 24 24" fill="none"
                            stroke="#6366f1" strokeWidth="1.7"
                            strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
                        </svg>
                    </button>
                    {hovered === 'calendar' && (
                        <div style={tooltipStyle}>Add to calendar</div>
                    )}
                </div>
            )}

            {/* Gmail */}
            <div
                style={wrapperStyle}
                onMouseEnter={() => setHovered('gmail')}
                onMouseLeave={() => setHovered(null)}
            >
                <a
                    style={actionStyle}
                    href={`https://mail.google.com/mail/u/0/#inbox/${email.googleMessageId}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <svg style={iconStyle} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.7"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                </a>
                {hovered === 'gmail' && (
                    <div style={tooltipStyle}>Open in Gmail</div>
                )}
            </div>
        </div>
    );
};

// ── Sandboxed iframe renderer for HTML email bodies ───────────────────────────
const DateExtractionPanel = ({ deadlines, onAddToCalendar, addingDate }) => {
    if (!deadlines.length) return null;

    return (
        <div className="date-panel">
            <div className="date-panel-header">
                <div>
                    <h3 className="date-panel-title">Important dates found</h3>
                    <p className="date-panel-subtitle">Review the extracted dates and add the ones you want to Google Calendar.</p>
                </div>
            </div>

            <div className="date-panel-list">
                {deadlines.map((deadline, index) => {
                    const tag = deadlineTag(deadline.date);
                    const isAdding = addingDate === deadline.date;

                    return (
                        <div key={`${deadline.date}-${index}`} className="date-panel-item">
                            <div className="date-panel-copy">
                                <span className={`date-panel-status date-panel-status-${tag.status}`}>
                                    {deadline.label || 'Important date'}
                                </span>
                                <strong className="date-panel-when">{formatDateTimeDetailed(deadline.date)}</strong>
                                <span className="date-panel-text">{deadline.text || 'Date extracted from the email content.'}</span>
                            </div>
                            <button
                                type="button"
                                className="date-panel-action"
                                onClick={() => onAddToCalendar(deadline)}
                                disabled={isAdding}
                            >
                                {isAdding ? 'Adding...' : 'Add to Calendar'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SummaryPanel = ({ summaryData, isSummarizing }) => {
    if (!isSummarizing && !summaryData) return null;

    return (
        <div className="summary-panel">
            <div className="summary-panel-header">
                <h3 className="summary-panel-title">Quick summary</h3>
                {summaryData?.tone && <span className="summary-tone">{summaryData.tone}</span>}
            </div>

            <p className="summary-panel-text">
                {isSummarizing ? 'Generating a concise summary for this email...' : summaryData.summary}
            </p>

            {!isSummarizing && summaryData?.action_items?.length > 0 && (
                <div className="summary-actions">
                    {summaryData.action_items.map((item, index) => (
                        <div key={`${item}-${index}`} className="summary-action-item">{item}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
        iframe.onload = () => {
            resize();
            setLoaded(true);
            try { doc.querySelectorAll('img').forEach(img => { img.onload = resize; }); } catch (_) { }
        };
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
                        <div key={i} className="skeleton-line"
                            style={{ width: `${w}%`, marginTop: i === 4 ? '16px' : undefined }} />
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
const EmailModal = ({
    email,
    theme,
    categories,
    onClose,
    onCategoryChange,
    onMarkRead,
    onToggleUseful,
    activeTab,
}) => {
    useEffect(() => { injectRibbonStyle(); }, []);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    useEffect(() => {
        if (email && !email.isRead) onMarkRead(email._id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [email?._id]);

    const [addingDate, setAddingDate] = useState(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summaryData, setSummaryData] = useState(null);

    if (!email) return null;

    const extractedDates = deduplicateDeadlines(email.extractedDeadlines)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const upcomingDeadlines = extractedDates
        .filter(d => deadlineTag(d.date).status !== 'expired');

    const handleSummarize = async () => {
        if (isSummarizing) return;

        setIsSummarizing(true);
        try {
            const res = await axios.get(`${API}/api/emails/${email._id}/summary`, { withCredentials: true });
            if (res.data?.success) {
                setSummaryData({
                    summary: res.data.summary,
                    action_items: res.data.action_items || [],
                    tone: res.data.tone || 'Informational',
                });
            } else {
                toast.error('Failed to summarize email.');
            }
        } catch {
            toast.error('Could not summarize this email right now.');
        } finally {
            setIsSummarizing(false);
        }
    };

    const unusedHandleAddToCalendar = async () => {
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
            const res = await axios.post(`${API}/api/calendar/add-event`, payload, { withCredentials: true });
            if (res.data.success) {
                toast.success('Event added to Google Calendar!', { id: toastId });
            } else {
                toast.error('Failed to add event.', { id: toastId });
            }
        } catch {
            toast.error('Calendar error. Please try again.', { id: toastId });
        }
    };
    void unusedHandleAddToCalendar;

    const handleAddToCalendar = async (deadline = upcomingDeadlines[0] || extractedDates[0]) => {
        if (!deadline) return;

        const toastId = toast.loading('Adding to Google Calendar...');
        setAddingDate(deadline.date);
        try {
            const payload = buildCalendarPayload(email, deadline);
            const res = await axios.post(`${API}/api/calendar/add-event`, payload, { withCredentials: true });
            if (res.data.success) {
                toast.success('Event added to Google Calendar!', { id: toastId });
                if (res.data.event?.htmlLink) {
                    window.open(res.data.event.htmlLink, '_blank', 'noopener,noreferrer');
                }
            } else {
                toast.error('Failed to add event.', { id: toastId });
            }
        } catch {
            toast.error('Calendar error. Please try again.', { id: toastId });
        } finally {
            setAddingDate(null);
        }
    };

    const handleCategoryChange = async (newCat) => {
        const toastId = toast.loading('Updating category…');
        try {
            const res = await axios.put(
                `${API}/api/emails/${email._id}/category`,
                { category: newCat },
                { withCredentials: true }
            );
            onCategoryChange(res.data.email);
            toast.success(`Category updated to "${newCat}"`, { id: toastId });
        } catch {
            toast.error('Failed to update category.', { id: toastId });
        }
    };

    const dedupedDeadlines = extractedDates;
    const hasUpcomingDeadline = upcomingDeadlines.length > 0;

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

                {/* ── Pill Ribbon — tags + actions in one bar ── */}
                <PillRibbon
                    email={email}
                    categories={categories}
                    dedupedDeadlines={dedupedDeadlines}
                    hasUpcomingDeadline={hasUpcomingDeadline}
                    activeTab={activeTab}
                    onCategoryChange={handleCategoryChange}
                    onToggleUseful={onToggleUseful}
                    onSummarize={handleSummarize}
                    isSummarizing={isSummarizing}
                    onAddToCalendar={handleAddToCalendar}
                />

                {/* Body */}
                <div className="modal-body">
                    <SummaryPanel summaryData={summaryData} isSummarizing={isSummarizing} />

                    <DateExtractionPanel
                        deadlines={dedupedDeadlines}
                        onAddToCalendar={handleAddToCalendar}
                        addingDate={addingDate}
                    />

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
