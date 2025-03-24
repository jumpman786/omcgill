const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const os = require('os');

const User = require('../models/User');
const authMiddleware = require('../authMiddleware');
const config = require('../config');
const { connectedUsers, waitingUsers } = require('../socket/socketState');

const router = express.Router();

// Register Route
router.post('/register', async (req, res) => {
  const { email, password, yearOfStudy, faculty } = req.body;

  console.log(`Registration attempt for: ${email}`);

  // Updated validation to allow both email domains
  if (!validator.isEmail(email) || !(email.endsWith('@mail.mcgill.ca') || email.endsWith('@mcgill.ca'))) {
    return res.status(400).json({ error: 'Invalid McGill email address. Must end with @mail.mcgill.ca or @mcgill.ca' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({ email, passwordHash, yearOfStudy, faculty });
    await user.save();

    console.log(`✅ User registered successfully: ${email}`);
    res.status(201).json({ message: '✅ User registered successfully.' });
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  console.log("Login request body:", req.body);
  
  const { email, password } = req.body;
  
  if (!email || !password) {
    console.log("Login failed: Missing email or password");
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  
  console.log(`Login attempt for: ${email}`);

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`❌ Login failed: User not found - ${email}`);
      return res.status(400).json({ error: 'User not found.' });
    }

    // Debug password comparison
    console.log(`Password comparison for ${email}:`, {
      providedPassword: password ? 'provided' : 'missing',
      storedHash: user.passwordHash ? 'exists' : 'missing'
    });

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    console.log(`Password valid for ${email}:`, validPassword);
    
    if (!validPassword) {
      console.log(`❌ Login failed: Invalid password - ${email}`);
      return res.status(400).json({ error: 'Invalid password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      config.security.jwtSecret,
      { expiresIn: config.security.jwtExpiry }
    );

    console.log(`✅ Login successful: ${email}`);
    res.json({ token, message: '✅ Logged in successfully.' });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Firebase user registration
router.post('/users', async (req, res) => {
  try {
    const { firebaseUid, email, yearOfStudy, faculty } = req.body;
    
    // Validate required fields
    if (!firebaseUid || !email) {
      return res.status(400).json({ 
        error: 'Firebase UID and email are required' 
      });
    }
    
    // Validate McGill email
    if (!email.endsWith('@mail.mcgill.ca') && !email.endsWith('@mcgill.ca')) {
      return res.status(400).json({ 
        error: 'Invalid McGill email address. Must end with @mail.mcgill.ca or @mcgill.ca' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { firebaseUid }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists' 
      });
    }
    
    // Create new user
    const user = new User({
      firebaseUid,
      email,
      yearOfStudy: yearOfStudy || '',
      faculty: faculty || ''
    });
    
    await user.save();
    
    console.log(`✅ Firebase user registered successfully: ${email} (${firebaseUid})`);
    res.status(201).json({
      message: 'User profile created successfully',
      userId: user._id,
      email: user.email
    });
  } catch (error) {
    console.error('❌ Firebase user registration error:', error);
    res.status(500).json({ 
      error: 'Internal server error.',
      details: error.message 
    });
  }
});

// Auth test route - for verifying token
router.get('/authtest', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is reachable',
    authenticationRequired: false
  });
});

// Protected route for checking authentication
router.get('/authcheck', authMiddleware, (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Authentication successful!',
    user: req.user.firebaseUid,
    email: req.user.email
  });
});

// API endpoint to get server info
router.get('/server-info', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  
  // Get local IP addresses
  const networkInterfaces = os.networkInterfaces();
  const localIPs = [];
  
  Object.keys(networkInterfaces).forEach(interfaceName => {
    const interfaces = networkInterfaces[interfaceName];
    interfaces.forEach(iface => {
      if (!iface.internal && iface.family === 'IPv4') {
        localIPs.push(iface.address);
      }
    });
  });
  
  res.json({
    serverTime: new Date().toISOString(),
    httpsPort: config.server.httpsPort,
    httpsPort: config.HTTPS_PORT,
    localIPs,
    activeUsers: Object.keys(connectedUsers).length,
    waitingUsers: {
      text: waitingUsers.text.length,
      video: waitingUsers.video.length
    }
  });
});

module.exports = router;