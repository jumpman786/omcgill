const admin = require('firebase-admin');
const mongoose = require('mongoose');
const User = require('./models/User');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized - No Firebase token provided' 
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Check if user exists in MongoDB
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found in database - Please complete registration' 
      });
    }

    // Attach user information to request
    req.user = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      dbUser: user // Full user document from MongoDB
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);

    // Handle specific Firebase errors
    const errorMap = {
      'auth/argument-error': 'Invalid token format',
      'auth/id-token-expired': 'Token expired - Please reauthenticate',
      'auth/id-token-revoked': 'Token revoked - Please reauthenticate',
      'auth/invalid-id-token': 'Invalid token'
    };

    const errorMessage = errorMap[error.code] || 'Authentication failed';
    
    res.status(401).json({ 
      error: errorMessage,
      code: error.code || 'authentication-error',
      docs: 'https://firebase.google.com/docs/auth/admin/errors'
    });
  }
};

module.exports = authMiddleware;