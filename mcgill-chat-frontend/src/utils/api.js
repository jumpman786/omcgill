/**
 * McGill Chat - API Utilities
 * This file provides consistent functions for connecting to the backend API and Socket.io
 */

// Add console log to confirm this file is loaded
console.log("API.JS LOADED - " + new Date().toISOString());

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

/**
 * Get the URL for backend API endpoints
 * Uses HTTPS by default with the secure port for proper WebRTC functionality
 */
export const getApiUrl = () => {
  // Use environment variable if available
  const serverIP = process.env.REACT_APP_SERVER_IP;
  
  // Check if we're on localhost
  if (window.location.hostname === 'localhost') {
    console.log("API.JS: Using localhost for API");
    return 'https://localhost:5002/api';
  }
  
  // For all other devices (like phones accessing the site)
  console.log("API.JS: Using IP address for API:", serverIP);
  return `https://${serverIP}:5002/api`;
};

/**
 * Get the URL for Socket.io connections
 */
export const getSocketUrl = () => {
  // Check if we're on localhost
  if (window.location.hostname === 'localhost') {
    console.log("API.JS LOADED WITH SERVER: Using localhost for socket");
    return 'https://localhost:5002';
  }
  
  // Check if we're running on Cloud Run (URL will have run.app in it)
  if (window.location.hostname.includes('run.app') ||
      window.location.hostname.includes('cloudfunctions.net')) {
    console.log("API.JS LOADED WITH SERVER: Using Cloud Run URL");
    // Use the same origin (no specific port needed for Cloud Run)
    return window.location.origin;
  }
  
  // For all other devices (like phones accessing local network)
  const serverIP = process.env.REACT_APP_SERVER_IP;
  console.log(`API.JS LOADED WITH SERVER: Using IP address for socket: ${serverIP}`);
  return `https://${serverIP}:5002`;
};

// Socket.io connection options for secure WebRTC
export const SOCKET_OPTIONS = {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  path: '/socket.io', // Ensure this matches backend
  forceNew: true
};

// WebRTC configuration with multiple STUN servers for better connectivity
export const WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

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