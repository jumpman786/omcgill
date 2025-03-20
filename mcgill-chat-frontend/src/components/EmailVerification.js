// EmailVerification.js
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { applyActionCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../firebase';

const EmailVerification = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [oobCode, setOobCode] = useState('');
  
  const navigate = useNavigate();
  
  useEffect(() => {
    // Parse the URL for mode and action code
    const urlParams = new URLSearchParams(window.location.search);
    const actionMode = urlParams.get('mode');
    const actionCode = urlParams.get('oobCode');
    
    setMode(actionMode);
    setOobCode(actionCode);
    
    if (!actionCode) {
      setError('Invalid verification link.');
      setLoading(false);
      return;
    }
    
    if (actionMode === 'verifyEmail') {
      // Handle email verification
      applyActionCode(auth, actionCode)
        .then(() => {
          setSuccess('Your email has been verified! You can now log in.');
        })
        .catch((error) => {
          console.error("Email verification error:", error);
          if (error.code === 'auth/invalid-action-code') {
            setError('This verification link has expired or already been used.');
          } else {
            setError('Failed to verify your email. Please try again later.');
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else if (actionMode === 'resetPassword') {
      // For password reset, we just validate the action code and let the user enter a new password
      setLoading(false);
    } else {
      setError('Invalid action mode.');
      setLoading(false);
    }
  }, []);
  
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess('Password has been reset successfully! You can now log in with your new password.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      console.error("Password reset confirmation error:", error);
      if (error.code === 'auth/invalid-action-code') {
        setError('This password reset link has expired or already been used.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else {
        setError('Failed to reset password. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="auth-container">
        <h2>Processing...</h2>
        <p>Please wait while we process your request.</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="auth-container">
        <h2>Error</h2>
        <div className="error-message">{error}</div>
        <div className="auth-footer">
          <Link to="/login">Return to login</Link>
        </div>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className="auth-container">
        <h2>Success!</h2>
        <div className="success-message">{success}</div>
        <div className="auth-footer">
          <Link to="/login">Go to login</Link>
        </div>
      </div>
    );
  }
  
  if (mode === 'resetPassword') {
    return (
      <div className="auth-container">
        <h2>Reset Your Password</h2>
        <form onSubmit={handlePasswordReset} className="auth-form">
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              minLength="6"
              required
            />
          </div>
          <button 
            type="submit" 
            className="auth-button"
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Reset Password'}
          </button>
        </form>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <h2>Unknown Action</h2>
      <div className="auth-footer">
        <Link to="/login">Return to login</Link>
      </div>
    </div>
  );
};

export default EmailVerification;