import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Login.css';

// Animated typing text hook
const useTypingEffect = (words, speed = 100, pause = 1800) => {
    const [display, setDisplay] = useState('');
    const [wordIdx, setWordIdx] = useState(0);
    const [charIdx, setCharIdx] = useState(0);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const current = words[wordIdx];
        let timeout;
        if (!deleting && charIdx < current.length) {
            timeout = setTimeout(() => setCharIdx(c => c + 1), speed);
        } else if (!deleting && charIdx === current.length) {
            timeout = setTimeout(() => setDeleting(true), pause);
        } else if (deleting && charIdx > 0) {
            timeout = setTimeout(() => setCharIdx(c => c - 1), speed / 2);
        } else if (deleting && charIdx === 0) {
            setDeleting(false);
            setWordIdx(i => (i + 1) % words.length);
        }
        setDisplay(current.slice(0, charIdx));
        return () => clearTimeout(timeout);
    }, [charIdx, deleting, wordIdx, words, speed, pause]);

    return display;
};

// Floating particle canvas
const ParticleCanvas = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animId;
        let W = canvas.width = window.innerWidth;
        let H = canvas.height = window.innerHeight;

        const dots = Array.from({ length: 60 }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.8 + 0.4,
            dx: (Math.random() - 0.5) * 0.35,
            dy: (Math.random() - 0.5) * 0.35,
            alpha: Math.random() * 0.5 + 0.15,
        }));

        const draw = () => {
            ctx.clearRect(0, 0, W, H);
            dots.forEach(d => {
                d.x += d.dx;
                d.y += d.dy;
                if (d.x < 0) d.x = W;
                if (d.x > W) d.x = 0;
                if (d.y < 0) d.y = H;
                if (d.y > H) d.y = 0;

                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(148,163,184,${d.alpha})`;
                ctx.fill();
            });

            // Draw lines between close dots
            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const dx = dots[i].x - dots[j].x;
                    const dy = dots[i].y - dots[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 130) {
                        ctx.beginPath();
                        ctx.moveTo(dots[i].x, dots[i].y);
                        ctx.lineTo(dots[j].x, dots[j].y);
                        ctx.strokeStyle = `rgba(99,102,241,${0.12 * (1 - dist / 130)})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }
            animId = requestAnimationFrame(draw);
        };

        draw();

        const handleResize = () => {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return <canvas ref={canvasRef} className="particle-canvas" />;
};

const FEATURES = [
    {
        icon: '🧠',
        title: 'AI Classification',
        desc: 'Every email is read and categorised automatically — no manual sorting needed.',
    },
    {
        icon: '⏰',
        title: 'Deadline Detection',
        desc: 'Due dates and deadlines are pulled straight from the email body and tracked for you.',
    },
    {
        icon: '⚡',
        title: 'Smart Urgency',
        desc: 'Each email gets a priority score — Critical, High, Medium or Low — the moment it arrives.',
    },
    {
        icon: '📅',
        title: 'Calendar Sync',
        desc: 'Spotted a deadline? Add it to Google Calendar with a single click.',
    },
];

const Login = () => {
    const [loading, setLoading] = useState(false);
    const [hovered, setHovered] = useState(false);

    const typed = useTypingEffect([
        'Email Command Center.',
        'Deadline Tracker.',
        'Priority Engine.',
        'Smart Organizer.',
    ]);

    const handleLogin = () => {
        setLoading(true);
        setTimeout(() => {
            const API = window.Capacitor?.isNativePlatform?.() ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
            window.location.href = `${API}/auth/google`;
        }, 400);
    };

    return (
        <div className="login-page">
            <ParticleCanvas />

            {/* Top nav bar */}
            <nav className="login-nav">
                <div className="login-nav-logo">
                    <div className="login-logo-badge">C</div>
                    <span>CASEO</span>
                </div>
            </nav>

            {/* Main layout */}
            <div className="login-main">

                {/* LEFT: Hero content */}
                <div className="login-hero">
                    <div className="login-badge-row">
                        <span className="login-badge">✨ AI-Powered</span>
                        <span className="login-badge">🔒 Secure</span>
                        <span className="login-badge">⚡ Real-time</span>
                    </div>

                    <h1 className="login-headline">
                        Your Intelligent<br />
                        <span className="login-typed-wrapper">
                            <span className="login-typed-text">{typed}</span>
                            <span className="login-cursor">|</span>
                        </span>
                    </h1>

                    <p className="login-subtext">
                        CASEO classifies, prioritizes, and surfaces
                        what matters most in your Gmail inbox — so you can focus
                        on what actually needs your attention.
                    </p>

                    {/* Feature cards */}
                    <div className="login-features">
                        {FEATURES.map((f, i) => (
                            <div className="login-feature-card" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className="feature-card-icon">{f.icon}</div>
                                <div>
                                    <div className="feature-card-title">{f.title}</div>
                                    <div className="feature-card-desc">{f.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: Sign-in card */}
                <div className="login-card-col">
                    <div className={`login-card ${hovered ? 'card-glow' : ''}`}>

                        <div className="login-card-icon-row">
                            <div className="login-card-logo">C</div>
                        </div>

                        <h2 className="login-card-title">Welcome to CASEO</h2>
                        <p className="login-card-sub">Context-Aware Smart Email Organizer</p>

                        <button
                            className={`google-signin-btn ${loading ? 'loading' : ''}`}
                            onClick={handleLogin}
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="btn-spinner" />
                            ) : (
                                <div className="google-icon-wrap">
                                    <svg viewBox="0 0 48 48" className="g-icon">
                                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                                    </svg>
                                </div>
                            )}
                            <span className="btn-label">
                                {loading ? 'Connecting...' : 'Continue with Google'}
                            </span>
                        </button>

                        <div className="login-divider">
                            <span>What you get</span>
                        </div>

                        <ul className="login-perks">
                            <li><span className="perk-check">✓</span>AI email classification</li>
                            <li><span className="perk-check">✓</span>Deadline extraction & alerts</li>
                            <li><span className="perk-check">✓</span>Priority inbox scoring</li>
                            <li><span className="perk-check">✓</span>Google Calendar integration</li>
                        </ul>

                        <p className="login-terms">
                            By signing in, you agree to our{' '}
                            <Link to="/terms">Terms</Link> &amp;{' '}
                            <Link to="/privacy">Privacy Policy</Link>.
                            We never store your email content.
                        </p>
                    </div>
                </div>
            </div>

            {/* Bottom glow blobs */}
            <div className="blob blob-1" />
            <div className="blob blob-2" />
            <div className="blob blob-3" />
        </div>
    );
};

export default Login;
