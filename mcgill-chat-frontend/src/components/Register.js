import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerWithFirebase } from '../utils/firebaseAuth';
import { getApiUrl } from '../config';

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    yearOfStudy: '',
    faculty: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear error when user starts typing
    if (error) setError('');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Validation
    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setError('All fields are required');
      return;
    }
    
    // Validate McGill email
    if (!formData.email.endsWith('@mail.mcgill.ca') && !formData.email.endsWith('@mcgill.ca')) {
      setError('Please use a valid McGill email address');
      return;
    }
    
    // Validate password
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      // Register with Firebase
      const result = await registerWithFirebase(formData.email, formData.password);
      
      if (result.success) {
        // Get the user's Firebase UID
        const firebaseUid = result.user.uid;
        
        // Use the API URL from config
        const apiUrl = getApiUrl();
        console.log("Using API URL for registration:", apiUrl);
        
        const response = await fetch(`${apiUrl}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            firebaseUid,
            email: formData.email,
            yearOfStudy: formData.yearOfStudy,
            faculty: formData.faculty
          }),
          // Add these options to handle mixed content and CORS issues
          mode: 'cors',
          credentials: 'same-origin'
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create user profile in the database');
        }
        
        setSuccess('Registration successful! Please check your email to verify your account.');
        setTimeout(() => navigate('/login'), 5000);
      } else {
        setError(result.error);
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError(error.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };
  
  // Faculty options
  const faculties = [
    'Agricultural and Environmental Sciences',
    'Arts',
    'Continuing Studies',
    'Dentistry',
    'Education',
    'Engineering',
    'Law',
    'Management',
    'Medicine',
    'Music',
    'Science'
  ];
  
  // Year of study options
  const yearsOfStudy = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year+', 'Graduate Student'];
  
  return (
    <div className="auth-container">
      <h2>McGill Student Registration</h2>
      
      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label>McGill Email</label>
          <input
            type="email"
            name="email"
            placeholder="your.name@mail.mcgill.ca"
            value={formData.email}
            onChange={handleChange}
            disabled={loading || success}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Faculty</label>
          <select
            name="faculty"
            value={formData.faculty}
            onChange={handleChange}
            disabled={loading || success}
            required
          >
            <option value="">Select Faculty</option>
            {faculties.map(faculty => (
              <option key={faculty} value={faculty}>{faculty}</option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label>Year of Study</label>
          <select
            name="yearOfStudy"
            value={formData.yearOfStudy}
            onChange={handleChange}
            disabled={loading || success}
            required
          >
            <option value="">Select Year</option>
            {yearsOfStudy.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            name="password"
            placeholder="At least 6 characters"
            value={formData.password}
            onChange={handleChange}
            disabled={loading || success}
            minLength="6"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Confirm Password</label>
          <input
            type="password"
            name="confirmPassword"
            placeholder="Re-enter your password"
            value={formData.confirmPassword}
            onChange={handleChange}
            disabled={loading || success}
            required
          />
        </div>
        
        <button
          type="submit"
          className="auth-button"
          disabled={loading || success}
        >
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      
      <div className="auth-footer">
        Already have an account? <Link to="/login">Login</Link>
      </div>
    </div>
  );
};

export default Register;