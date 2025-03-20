/**
 * McGill Chat - API Utilities
 * This file provides consistent functions for connecting to the backend API and Socket.io
 */

// Add console log to confirm this file is loaded
console.log("API.JS LOADED WITH SERVER IP: 10.0.0.227 - " + new Date().toISOString());

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
  // For mobile devices or cross-device testing, always use the server's IP address
  const serverIP = '10.0.0.227'; // Your computer's IP
  
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
 * Uses the same HTTPS approach for consistency
 */
export const getSocketUrl = () => {
  // For mobile devices or cross-device testing, always use the server's IP address
  const serverIP = '10.0.0.227'; // Your computer's IP
  
  // Check if we're on localhost
  if (window.location.hostname === 'localhost') {
    console.log("API.JS: Using localhost for socket");
    return 'https://localhost:5002';
  }
  
  // For all other devices (like phones accessing the site)
  console.log("API.JS: Using IP address for socket:", serverIP);
  return `https://${serverIP}:5002`;
};

// Socket.io connection options for secure WebRTC
export const SOCKET_OPTIONS = {
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ['polling', 'websocket'], // Start with polling for better initial connection
  secure: true,
  rejectUnauthorized: false, // Important for self-signed certificates
  autoConnect: true,
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




