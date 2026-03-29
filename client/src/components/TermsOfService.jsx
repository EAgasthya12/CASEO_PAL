import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LegalPage.css';

const TermsOfService = () => {
    const navigate = useNavigate();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="legal-page">
            {/* Background blobs */}
            <div className="legal-blob legal-blob-1" />
            <div className="legal-blob legal-blob-2" />

            {/* Nav */}
            <nav className="legal-nav">
                <div className="legal-nav-logo" onClick={() => navigate('/')} role="button" tabIndex={0}>
                    <div className="legal-logo-badge">C</div>
                    <span>CASEO</span>
                </div>
                <button className="legal-back-btn" onClick={() => navigate('/')}>
                    ← Back to Sign In
                </button>
            </nav>

            {/* Content */}
            <main className="legal-content">
                <div className="legal-header">
                    <div className="legal-icon">📋</div>
                    <h1 className="legal-title">Terms of Service</h1>
                    <p className="legal-subtitle">Last updated: March 15, 2026</p>
                </div>

                <div className="legal-card">

                    <section className="legal-section">
                        <h2>1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using CASEO ("the Service"), you agree to be bound by these Terms of Service.
                            If you do not agree to these terms, please do not use the Service. These terms apply to all
                            visitors, users, and others who access or use the Service.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>2. Description of the Service</h2>
                        <p>
                            CASEO is an AI-powered email management tool that connects to your Gmail account via Google OAuth 2.0.
                            The Service provides:
                        </p>
                        <ul>
                            <li>Automated email classification using Gemini AI</li>
                            <li>Deadline detection and tracking from email content</li>
                            <li>Priority scoring (Critical, High, Medium, Low) for your inbox</li>
                            <li>Optional Google Calendar integration for deadline reminders</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>3. Google Account Access</h2>
                        <p>
                            CASEO requires access to your Google account to function. By signing in, you authorize CASEO
                            to access your Gmail messages and, optionally, your Google Calendar. This access is governed by
                            Google's own Terms of Service in addition to these Terms.
                        </p>
                        <p>
                            You may revoke CASEO's access at any time through your{' '}
                            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                                Google Account Permissions
                            </a>{' '}
                            page.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>4. Data Usage</h2>
                        <p>
                            CASEO processes your email metadata and content <strong>solely for the purpose of providing
                                the Service</strong>. We do not:
                        </p>
                        <ul>
                            <li>Permanently store your email content on our servers</li>
                            <li>Sell, share, or transfer your email data to third parties</li>
                            <li>Use your data to train AI models</li>
                            <li>Use your data for advertising purposes</li>
                        </ul>
                        <p>
                            Email content is fetched in real-time and processed temporarily to generate classifications
                            and urgency scores. Only metadata (e.g., message IDs, urgency labels) is stored to enable
                            the Service's features.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>5. User Responsibilities</h2>
                        <p>You agree to:</p>
                        <ul>
                            <li>Use the Service only for lawful purposes</li>
                            <li>Not attempt to reverse-engineer or tamper with the Service</li>
                            <li>Not use the Service in a way that could harm other users or the infrastructure</li>
                            <li>Maintain the confidentiality of your Google account credentials</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>6. Intellectual Property</h2>
                        <p>
                            All content, designs, and code that make up the CASEO platform are the intellectual property
                            of CASEO and its developers. You may not copy, modify, or distribute any part of the Service
                            without explicit written permission.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>7. Disclaimer of Warranties</h2>
                        <p>
                            The Service is provided on an "as-is" and "as-available" basis without warranty of any kind.
                            CASEO makes no guarantees regarding the accuracy of AI classifications, deadline extractions,
                            or any other outputs generated by the Service.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>8. Limitation of Liability</h2>
                        <p>
                            To the fullest extent permitted by law, CASEO shall not be liable for any indirect, incidental,
                            special, consequential, or punitive damages arising from your use of or inability to use the Service,
                            even if CASEO has been advised of the possibility of such damages.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>9. Modifications to Terms</h2>
                        <p>
                            We reserve the right to modify these Terms at any time. We will notify users of significant
                            changes by updating the "Last updated" date. Continued use of the Service after changes constitutes
                            acceptance of the new terms.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>10. Governing Law</h2>
                        <p>
                            These Terms shall be governed by and construed in accordance with applicable laws, without
                            regard to conflict of law provisions.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>11. Contact</h2>
                        <p>
                            If you have any questions about these Terms of Service, please contact us at{' '}
                            <a href="mailto:support@caseo.app">support@caseo.app</a>.
                        </p>
                    </section>

                </div>

                <div className="legal-footer-note">
                    <p>By using CASEO, you acknowledge that you have read, understood, and agree to these Terms of Service.</p>
                    <button className="legal-cta-btn" onClick={() => navigate('/')}>
                        ← Return to Sign In
                    </button>
                </div>
            </main>
        </div>
    );
};

export default TermsOfService;
