const admin = require('firebase-admin');
const mongoose = require('mongoose');
const User = require('./models/User');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    // Create credentials directly without relying on the file
    const serviceAccount = {
      type: "service_account",
      project_id: "omcgill-36047",
      private_key_id: "245a8f1bba01149b627fecafc54da9ad4a70df59",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9dZEYNhtrvhu+\nyBwpX9pjSuJ1cNlt2aTY/7cShxI0E58xJk3C5kFqGpYDUTJ3fNvZmpkcw13bln45\nB5UfV+9t8kb/o6PCaAEu/9v8hV5ZbytWvkPAgqVAVPtkapfZ/GHQIWLInNT54q44\nnj1MT3sb+LRs9bzkMlIezlQbt3VEmKd9vxazNW0lv9azrxaYuM5iCGms5LO4uFTZ\nNua1bKsDkZwJKoC49qIBVckd+aHazIcBwuIIGU0HFizNMPx83Q9rqnRLN/78v06u\nGvj76YneTdpLqaGdX5Fmsckjfweefj1gTXHYPKO9gH4onEaSzSS5UDz4xN6gvt06\nIfLM2AhJAgMBAAECggEAQXNqlysmCPAppJx8Ah0flHrLxhegva7ZILAini90bfIz\nZibd6U1jXtTlayrzXM0RJFkguQuTEqeoXmpMrYHS8LAor+rnyWLlucdhR5kJcasS\nlUpwnIJltVZGbLfYUtG6Ns0506U+fD8/wcaE1aaFmLGwHw473be2n/bWnqafx/y9\nOarXFuTk4ozPHscLdGXczEiDi+RFTzws6WWCtBiDM2dbxeTWRjmy3jsifxcNyVI7\n8H+A9MYuBMWV24f4NF3EmRmJX4zm720RyPxJcZiTtaoxAN3FEj/DpKOc8NVF5J99\nKskQA1x9h+qTmBqxvwMljHPSWN0PocYYrxcsfUbnCwKBgQD6vLrkWqOfCoN/D4eb\noBSAzS6KjsqwsTdo6GInebNiyul3hi5xmqoC66MgAhh5i7tUjfXK1im9+qrMnT4b\nJKqKwheWTBZuVL6VxCx+IoT6EWR0F/FOVdRB/8IpAysbMT1dks2v0P4Y76nnoXyY\n0uj8ZY6ueCOqSGOjTbPQRArANwKBgQDBb5Nkt35R11nVzj+7SvFwOCVMRzAzK2X8\nfl6TGxmiAE6NzRoT46er3kl9cZfMRRgRouVpsGTFcTRo/RXcqksZtCZoupy5Ee2n\n8l8d978mvLQ5sNHIu4SeFvxcs8VawfZhGk/NA5p1nB0dya4d6KHXHL+Hft3oNc4B\nfjWjQXo7fwKBgQCSHU9P6V32PVs5vSQKVbP9BxS7G9EUPIGMufcRCAO4a4S36VLB\nUx8Fyqlp6q62je4hrQRyKnFyy1OjH3LkwG49pDO4myhrLSlO/13qN1WEoIQIfzdY\nrf2eZFuSKM2C8CPRls4USdb5UxiQ6fNA3490Hf6Sv2IRRlQCAzLpB+236wKBgCNE\noZ4SaqCnYATAhxQx9NVeF0bSD/K0bfLcY4f0v/aukaP/CksoDdEjRUju5htjWaEV\njzh25dit7D1cL5k9H1Y/Z2Ve6OZBY5Bke30uR5bbfwyptYYg0mw0iqyoRkpm5PIN\nZxFdH9NjtFdTB0ECwkdDQZSFyBXngXj6NvNeI9gnAoGAfzHZum5RryqxqrVtZ8gm\n9BGpWE79qLi0/bbA+7T+t7YJAqc2sO9wO1DPTaoDXRxND2/xIgdf23ueiyf4Jh2X\n/2OJo/ktZxlDFWgXgj/343ggsCLtDrkzPvrmUIdvDBqpwTSE1mmoYgc/9zcz+nhw\nMgzirhWTcKl/fOPq6V+ZLko=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'),
      client_email: "firebase-adminsdk-fbsvc@omcgill-36047.iam.gserviceaccount.com",
      client_id: "100549285943914217172",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40omcgill-36047.iam.gserviceaccount.com",
      universe_domain: "googleapis.com"
    };

    console.log('Initializing Firebase Admin SDK with hardcoded credentials');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    console.error(error.stack);
  }
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