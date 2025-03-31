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
 * Get the URL for Socket.io connections - CLOUD RUN COMPATIBLE
 */
export const getSocketUrl = () => {
  // Check if we're running on Cloud Run (URL will have run.app in it)
  if (window.location.hostname.includes('run.app')) {
    debugLog("Using Cloud Run URL for socket");
    // IMPORTANT: Use only origin (no port) for Cloud Run
    return window.location.origin;
  }
  
  // For local development
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:8080';
  }
  
  // For other environments (direct IP access)
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}`;
};

/**
 * Get the URL for backend API endpoints
 */
export const getApiUrl = () => {
  // Check if we're running on Cloud Run
  if (window.location.hostname.includes('run.app')) {
    return `${window.location.origin}/api`;
  }
  
  // For local development
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:8080/api';
  }
  
  // For other environments
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}/api`;
};

// Socket.io connection options optimized for Cloud Run
export const SOCKET_OPTIONS = {
  reconnectionAttempts: 20,     // Increased to 20
  reconnectionDelay: 500,       // Decreased to 500ms for faster recovery
  reconnectionDelayMax: 5000,
  timeout: 35000,               // Increased to 35s
  transports: ['websocket', 'polling'], // Prefer websocket first
  path: '/socket.io',
  forceNew: true,
  withCredentials: false,
  autoConnect: true
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