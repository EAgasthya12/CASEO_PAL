import React from 'react';
import { SearchIcon, BellIcon, SunIcon, MoonIcon, ScanIcon } from './Icons';

const TopBar = ({ searchQuery, setSearchQuery, theme, toggleTheme, loading, syncEmails, scanStatus }) => {
    const isScanning = loading || scanStatus?.running;
    const progressPct = scanStatus?.total > 0
        ? Math.round((scanStatus.processed / scanStatus.total) * 100)
        : null;

    return (
        <header className="top-bar">
            <div className="search-bar">
                <span className="search-icon"><SearchIcon /></span>
                <input
                    type="text"
                    id="email-search"
                    placeholder="Search emails… or try 'from:superset'"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    aria-label="Search emails"
                />
                {searchQuery && (
                    <button
                        className="search-clear-btn"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                    >✕</button>
                )}
            </div>

            <div className="top-actions">
                {/* Notifications button — hidden for now, re-enable later
                <button className="icon-btn" title="Notifications" aria-label="Notifications">
                    <BellIcon />
                </button>
                */}

                <button
                    className="icon-btn theme-toggle-btn"
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                    aria-label="Toggle theme"
                >
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </button>

                <button
                    className="scan-btn"
                    onClick={syncEmails}
                    disabled={isScanning}
                    aria-label={isScanning ? 'Scanning inbox…' : 'Scan inbox'}
                >
                    {isScanning ? (
                        <div className="loading-spinner" />
                    ) : (
                        <ScanIcon />
                    )}
                    {isScanning
                        ? progressPct != null ? `${progressPct}%` : 'Scanning…'
                        : 'Scan Inbox'
                    }
                </button>
            </div>
        </header>
    );
};

export default TopBar;
