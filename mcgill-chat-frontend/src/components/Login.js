// Login.js - Updated to use Firebase
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginWithFirebase } from '../utils/firebaseAuth';
import { sendEmailVerification } from "firebase/auth";
import { auth } from '../firebase';
import { actionCodeSettings } from '../utils/firebaseAuth';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [showResendOption, setShowResendOption] = useState(false);
  
  const navigate = useNavigate();

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/chat');
    }
  }, [navigate]);

  // Check if coming from verification flow
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const verified = urlParams.get('verified');
    
    if (verified === 'true') {
      setMessage('Your email has been verified! You can now log in.');
      // Clean up the URL
      window.history.replaceState({}, document.title, '/login');
    }
  }, []);

  const handleChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
    
    // Clear error when user starts typing
    if (error) setError('');
    if (message) setMessage('');
    
    // Hide resend option when typing
    if (showResendOption) setShowResendOption(false);
  };

  const resendVerificationEmail = async () => {
    if (!formData.email || !formData.password) {
      setError('Please enter your email and password to resend verification');
      return;
    }
    
    setLoading(true);
    try {
      // First sign in the user
      const result = await loginWithFirebase(formData.email, formData.password);
      
      if (result.success) {
        if (result.emailVerified) {
          setMessage('Your email is already verified. You can log in now!');
          setShowResendOption(false);
        } else {
          // Send verification email
          await sendEmailVerification(auth.currentUser, actionCodeSettings);
          setMessage('Verification email sent! Please check your inbox and spam folder.');
        }
      } else {
        setError(result.error);
      }
    } catch (error) {
      console.error('Failed to send verification email:', error);
      setError('Failed to send verification email: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    // Validation
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return;
    }
    
    // Validate McGill email
    if (!formData.email.endsWith('@mail.mcgill.ca') && !formData.email.endsWith('@mcgill.ca')) {
      setError('Please use a valid McGill email address');
      return;
    }
    
    setLoading(true);
    
    try {
      // Use Firebase Authentication
      const result = await loginWithFirebase(formData.email, formData.password);
      
      if (result.success) {
        // Check if email is verified
        if (!result.emailVerified) {
          setError('Please verify your email before logging in. Check your inbox and spam folder.');
          setShowResendOption(true);
          setLoading(false);
          return;
        }
        
        // Store token in local storage
        localStorage.setItem('token', result.token);
        localStorage.setItem('userEmail', result.user.email);
        
        // Redirect to chat
        navigate('/chat');
      } else {
        setError(result.error);
      }
    } catch (error) {
      console.error("Login error:", error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>McGill Student Login</h2>
      
      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      
      {showResendOption && (
        <div className="resend-verification">
          <p>Didn't receive a verification email?</p>
          <button 
            onClick={resendVerificationEmail}
            className="resend-button"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label>McGill Email</label>
          <input
            type="email"
            name="email"
            placeholder="your.name@mail.mcgill.ca or your.name@mcgill.ca"
            value={formData.email}
            onChange={handleChange}
            disabled={loading}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            name="password"
            placeholder="Your password"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            required
          />
        </div>
        
        <button
          type="submit"
          className="auth-button"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      
      <div className="auth-footer">
        <div>
          <Link to="/forgot-password">Forgot Password?</Link>
        </div>
        <div>
          Don't have an account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;