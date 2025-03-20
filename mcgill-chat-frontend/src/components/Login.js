// Login.js - Updated to use Firebase
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginWithFirebase } from '../utils/firebaseAuth';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/chat');
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
    
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
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
          setError('Please verify your email before logging in. Check your inbox.');
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