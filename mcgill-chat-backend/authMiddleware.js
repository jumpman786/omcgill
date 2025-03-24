const { admin } = require('./utils/firebaseAdmin');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const config = require('./config');

/**
 * Authentication middleware that supports both Firebase and JWT authentication
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: 'Unauthorized - No authentication token provided'
    });
  }
  
  // Check if it's a Firebase token or JWT token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    
    // First try Firebase authentication
    try {
      // Verify Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
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
        _id: user._id,
        dbUser: user // Full user document from MongoDB
      };
      
      next();
    } catch (firebaseError) {
      // If Firebase authentication fails, try JWT authentication
      try {
        const decoded = jwt.verify(token, config.security.jwtSecret);
        
        // Find user by ID from token
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(401).json({ error: 'Invalid token. User not found.' });
        }
        
        // Add user info to request
        req.user = {
          _id: user._id,
          email: user.email,
          firebaseUid: user.firebaseUid,
          dbUser: user
        };
        
        next();
      } catch (jwtError) {
        // Handle specific Firebase errors
        const errorMap = {
          'auth/argument-error': 'Invalid token format',
          'auth/id-token-expired': 'Token expired - Please reauthenticate',
          'auth/id-token-revoked': 'Token revoked - Please reauthenticate',
          'auth/invalid-id-token': 'Invalid token'
        };
        
        // Choose the most appropriate error message
        const errorMessage = errorMap[firebaseError.code] || 'Authentication failed';
        
        res.status(401).json({
          error: errorMessage,
          code: firebaseError.code || jwtError.name || 'authentication-error',
          detail: 'Failed both Firebase and JWT authentication'
        });
      }
    }
  } else {
    return res.status(401).json({
      error: 'Invalid authorization format. Use Bearer token.'
    });
  }
};

module.exports = authMiddleware;