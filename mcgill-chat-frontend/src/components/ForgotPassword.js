import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase'; // Update path if needed
import './ForgotPassword.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    // Validate McGill email
    if (!email.endsWith('@mail.mcgill.ca') && !email.endsWith('@mcgill.ca')) {
      setError('Please use a valid McGill email');
      return;
    }
    
    setLoading(true);
    
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(`Password reset email sent to ${email}`);
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      console.error("Password reset error:", error);
      // More detailed error handling
      if (error.code === 'auth/user-not-found') {
        setError('No account found with this email address');
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address format');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many requests. Try again later');
      } else {
        setError('Error sending password reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="forgot-password-container">
      <h2 className="forgot-password-title">Reset McGill Account Password</h2>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleSubmit} className="forgot-password-form">
        <div className="form-group">
          <label>McGill Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.name@mail.mcgill.ca"
            required
          />
        </div>
        
        <button
          type="submit"
          className="forgot-password-button"
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Reset Password'}
        </button>
      </form>
      
      <div className="auth-footer" style={{ marginTop: '1rem' }}>
        Remember your password? <Link to="/login">Login here</Link>
      </div>
    </div>
  );
};

export default ForgotPassword;