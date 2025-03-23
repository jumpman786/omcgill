/**
 * McGill Chat - API Utilities
 * This file provides consistent functions for connecting to the backend API and Socket.io
 */

// Debug mode for development
export const DEBUG = true;

// Debug logging helper
export const debugLog = (message, data = null) => {
  if (DEBUG) {
    if (data) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
};

// Log when this file loads
console.log("API.JS LOADED - " + new Date().toISOString());

/**
 * Get the URL for Socket.io connections - IMPROVED VERSION
 * This version dynamically adapts to the current protocol and hostname
 */
export const getSocketUrl = () => {
  // Use environment variables if available (for production)
  if (process.env.REACT_APP_SOCKET_URL) {
    debugLog("Using environment variable for socket URL:", process.env.REACT_APP_SOCKET_URL);
    return process.env.REACT_APP_SOCKET_URL;
  }
  
  // Check if we're running on Cloud Run (URL will have run.app in it)
  if (window.location.hostname.includes('run.app')) {
    debugLog("Using Cloud Run URL for socket");
    // Use the same origin (no specific port needed for Cloud Run)
    return window.location.origin;
  }
  
  // Dynamically use current hostname instead of hardcoded IP
  const hostname = window.location.hostname;
  // Use the same protocol as the current page
  const protocol = window.location.protocol;
  // Use correct port based on protocol
  const port = protocol === 'https:' ? '5002' : '5001';
  
  const socketUrl = `${protocol}//${hostname}:${port}`;
  debugLog("Using dynamic socket URL:", socketUrl);
  return socketUrl;
};

/**
 * Get the URL for backend API endpoints
 * Uses the same protocol as the current page
 */
export const getApiUrl = () => {
  // For development with React's proxy feature
  if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
    return '/api';
  }
  
  // Check if we're running on Cloud Run
  if (window.location.hostname.includes('run.app')) {
    return `${window.location.origin}/api`;
  }
  
  // For direct connection to backend (including from mobile devices)
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  // Use the same port as the current protocol
  const port = protocol === 'https:' ? '5002' : '5001';
  
  const apiUrl = `${protocol}//${hostname}:${port}/api`;
  debugLog("Using API URL:", apiUrl);
  return apiUrl;
};

// Socket.io connection options with improved reliability
export const SOCKET_OPTIONS = {
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ['polling', 'websocket'], // Start with polling for better initial connection
  secure: window.location.protocol === 'https:',
  rejectUnauthorized: false, // Important for self-signed certificates
  autoConnect: true,
  forceNew: true,
  path: '/socket.io' // Ensure this matches backend
};

// WebRTC configuration with multiple STUN servers
export const WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// Firebase error handler
export const handleFirebaseError = (error) => {
  debugLog('Firebase Error:', error);
  const errorMap = {
    'auth/email-already-in-use': 'This McGill email is already registered',
    'auth/invalid-email': 'Invalid McGill email address',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/network-request-failed': 'Network error. Please check your internet',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/operation-not-allowed': 'Email/password authentication is disabled'
  };
  return errorMap[error.code] || 'Authentication failed. Please try again.';
};

// API error handler
export const handleApiError = (error) => {
  // Check if it's a Firebase error
  if (error.code && error.code.startsWith('auth/')) {
    return handleFirebaseError(error);
  }
  debugLog('API Error:', error);
  if (error.response) {
    return error.response.data?.error || 'Server error. Please try again.';
  } else if (error.request) {
    return 'Cannot connect to the server. Please check your internet connection.';
  }
  return 'An unexpected error occurred. Please try again.';
};

// Log configuration on load
debugLog("API configuration loaded", {
  apiUrl: getApiUrl(),
  socketUrl: getSocketUrl(),
  protocol: window.location.protocol,
  hostname: window.location.hostname
});