// EmailVerification.js
import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { applyActionCode, checkActionCode } from 'firebase/auth';
import { auth } from '../firebase';

const EmailVerification = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Parse the URL properly
        const urlParams = new URLSearchParams(location.search);
        const mode = urlParams.get('mode');
        const actionCode = urlParams.get('oobCode');
        
        console.log("Verification parameters:", { mode, actionCode });
        
        if (!actionCode) {
          throw new Error('No verification code found in URL');
        }
        
        if (mode !== 'verifyEmail') {
          throw new Error(`Unsupported mode: ${mode}`);
        }
        
        // First check if the action code is valid
        await checkActionCode(auth, actionCode);
        
        // Then apply it
        await applyActionCode(auth, actionCode);
        
        setSuccess('Your email has been verified successfully! You can now log in.');
        setTimeout(() => navigate('/login'), 3000);
      } catch (error) {
        console.error("Email verification error:", error);
        
        if (error.code === 'auth/invalid-action-code') {
          setError('This verification link has expired or has already been used.');
        } else if (error.code === 'auth/user-not-found') {
          setError('User account not found.');
        } else {
          setError(`Failed to verify email: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };
    
    verifyEmail();
  }, [location, navigate]);
  
  if (loading) {
    return (
      <div className="auth-container">
        <h2>Verifying Your Email</h2>
        <p>Please wait while we verify your email address...</p>
        <div className="loading-spinner"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="auth-container">
        <h2>Verification Failed</h2>
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
        <h2>Email Verified!</h2>
        <div className="success-message">{success}</div>
        <div className="auth-footer">
          <Link to="/login">Go to login</Link>
        </div>
      </div>
    );
  }
  
  return null;
};

export default EmailVerification;