import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LegalPage.css';

const PrivacyPolicy = () => {
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
                    <div className="legal-icon">🔒</div>
                    <h1 className="legal-title">Privacy Policy</h1>
                    <p className="legal-subtitle">Last updated: March 15, 2026</p>
                </div>

                <div className="legal-card">

                    <section className="legal-section">
                        <h2>1. Introduction</h2>
                        <p>
                            CASEO ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
                            explains how we collect, use, and safeguard information when you use our AI-powered email
                            management service. We take your privacy seriously and follow the strict guidelines required
                            by the Google API Services User Data Policy.
                        </p>
                        <div className="legal-highlight-box">
                            <span className="highlight-icon">🛡️</span>
                            <p>
                                <strong>Core Commitment:</strong> CASEO never permanently stores your email content.
                                Emails are processed in real-time and discarded immediately after analysis.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>2. Information We Collect</h2>
                        <h3>2.1 Google Account Information</h3>
                        <p>When you sign in with Google, we receive:</p>
                        <ul>
                            <li>Your Google account name and email address</li>
                            <li>Your Google profile picture (for display purposes)</li>
                            <li>An OAuth access token to fetch your Gmail data on your behalf</li>
                        </ul>

                        <h3>2.2 Gmail Data (Processed, Not Stored)</h3>
                        <p>
                            To provide the Service, CASEO reads your Gmail messages via the Gmail API. This data is
                            processed <strong>in memory only</strong> to:
                        </p>
                        <ul>
                            <li>Extract sender, subject, and body for AI classification</li>
                            <li>Detect deadlines and due dates mentioned in email content</li>
                            <li>Assign urgency scores (Critical, High, Medium, Low)</li>
                        </ul>

                        <h3>2.3 Metadata We Store</h3>
                        <p>We only persist the following minimal metadata in our database:</p>
                        <ul>
                            <li>Gmail message IDs and thread IDs</li>
                            <li>AI-generated classification labels and urgency scores</li>
                            <li>Extracted deadline dates (not the full email body)</li>
                            <li>Your Google user ID and access token (encrypted)</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>3. How We Use Your Information</h2>
                        <p>We use the information we collect <strong>exclusively</strong> to:</p>
                        <ul>
                            <li>Authenticate you and maintain your session</li>
                            <li>Display your prioritized and classified inbox</li>
                            <li>Show deadline tracking and urgency indicators</li>
                            <li>Optionally add deadlines to your Google Calendar (only if you click "Add to Calendar")</li>
                        </ul>
                        <p>
                            We do <strong>not</strong> use your data for advertising, profiling, or any purpose beyond
                            directly providing the Service to you.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>4. Google API Services User Data Policy</h2>
                        <p>
                            CASEO's use of information received from Google APIs adheres to the{' '}
                            <a
                                href="https://developers.google.com/terms/api-services-user-data-policy"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Google API Services User Data Policy
                            </a>
                            , including the Limited Use requirements. In particular:
                        </p>
                        <ul>
                            <li>We only use Google user data to provide the CASEO service</li>
                            <li>We do not transfer your data to third parties except as necessary to provide the service</li>
                            <li>We do not use your data for serving ads</li>
                            <li>We do not allow humans to read your email unless you explicitly request support</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>5. Data Sharing and Third Parties</h2>
                        <p>We use the following third-party services to power CASEO:</p>

                        <div className="legal-table-wrap">
                            <table className="legal-table">
                                <thead>
                                    <tr>
                                        <th>Service</th>
                                        <th>Purpose</th>
                                        <th>Data Shared</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Google Gmail API</td>
                                        <td>Fetch your emails</td>
                                        <td>OAuth token only</td>
                                    </tr>
                                    <tr>
                                        <td>Google Gemini AI</td>
                                        <td>Email classification</td>
                                        <td>Email subject &amp; body (temporary)</td>
                                    </tr>
                                    <tr>
                                        <td>Google Calendar API</td>
                                        <td>Add deadline events</td>
                                        <td>Deadline title &amp; date (on request)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p>We do not share your data with any other third parties.</p>
                    </section>

                    <section className="legal-section">
                        <h2>6. Data Security</h2>
                        <p>We protect your information by:</p>
                        <ul>
                            <li>Storing OAuth tokens encrypted at rest</li>
                            <li>Using HTTPS for all data transmission</li>
                            <li>Never logging full email body content to disk</li>
                            <li>Limiting database access to the application only</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>7. Your Rights and Controls</h2>
                        <p>You have full control over your data:</p>
                        <ul>
                            <li>
                                <strong>Revoke Access:</strong> Disconnect CASEO at any time via{' '}
                                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                                    Google Account Permissions
                                </a>
                            </li>
                            <li>
                                <strong>Data Deletion:</strong> Contact us to have all stored metadata associated with
                                your account permanently deleted
                            </li>
                            <li>
                                <strong>Data Access:</strong> Request a copy of any metadata we have stored about you
                            </li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2>8. Children's Privacy</h2>
                        <p>
                            CASEO is not directed to individuals under the age of 13. We do not knowingly collect
                            personal information from children. If you believe a child has provided us with personal
                            information, please contact us immediately.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>9. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify you of significant
                            changes by updating the "Last updated" date at the top of this page. We encourage you to
                            review this policy periodically.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2>10. Contact Us</h2>
                        <p>
                            If you have any questions, concerns, or requests regarding this Privacy Policy or your data,
                            please contact us at:{' '}
                            <a href="mailto:privacy@caseo.app">privacy@caseo.app</a>
                        </p>
                    </section>

                </div>

                <div className="legal-footer-note">
                    <p>Your privacy matters. We are committed to being transparent about how we handle your data.</p>
                    <button className="legal-cta-btn" onClick={() => navigate('/')}>
                        ← Return to Sign In
                    </button>
                </div>
            </main>
        </div>
    );
};

export default PrivacyPolicy;
