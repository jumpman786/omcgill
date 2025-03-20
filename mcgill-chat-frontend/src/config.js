/**
 * McGill Chat - Frontend Configuration for Network Testing
 */

// Detect the current device's network environment
export const getSocketUrl = () => {
  // Use environment variables if available (for production)
  if (process.env.REACT_APP_SOCKET_URL) {
    return process.env.REACT_APP_SOCKET_URL;
  }
  
  // Dynamically use current hostname instead of hardcoded IP
  // This will automatically work across devices on the same network
  const hostname = window.location.hostname;
  
  // Use the same protocol as the current page
  const protocol = window.location.protocol;
  
  // Use correct port based on protocol
  const port = protocol === 'https:' ? '5002' : '5001';
  
  // Return the full socket URL
  return `${protocol}//${hostname}:${port}`;
};

// Socket.io connection options with improved reliability
export const SOCKET_OPTIONS = {
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  timeout: 20000,
  transports: ['polling', 'websocket'], // Start with polling for better initial connection
  secure: getSocketUrl().startsWith('https'),
  rejectUnauthorized: false, // Important for self-signed certificates
  autoConnect: true,
  forceNew: true
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

// Debug settings
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

// API URL helper function - UPDATED to use same protocol as current page
export const getApiUrl = () => {
  // For development with React's proxy feature
  if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
    return '/api';
  }
  
  // For direct connection to backend (including from mobile devices)
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  // Use the same port as the current protocol
  const port = protocol === 'https:' ? '5002' : '5001';
  
  return `${protocol}//${hostname}:${port}/api`;
};

// Log API URL configuration on load
console.log(`API.JS LOADED WITH SERVER: ${getApiUrl()}`);