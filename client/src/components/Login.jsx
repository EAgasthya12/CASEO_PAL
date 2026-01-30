import googleLogo from '../assets/google-logo.svg';
import './Login.css';

const Login = () => {
    const handleLogin = () => {
        window.location.href = 'http://localhost:5000/auth/google';
    };

    return (
        <div className="login-container">
            <div className="glass-card">
                <h1>CASEO</h1>
                <p className="subtitle">Context-Aware Smart Email Organizer</p>
                <button className="login-btn" onClick={handleLogin}>
                    <img src={googleLogo} alt="Google" width="20" />
                    Sign in with Google
                </button>
            </div>
        </div>
    );
};

export default Login;
