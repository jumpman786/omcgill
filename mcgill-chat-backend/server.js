require('dotenv').config(); // This will load variables from .env file
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const http = require('http');
const https = require('https');
const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');
const os = require('os');
// Import authMiddleware
const authMiddleware = require('./authMiddleware');
const config = require('./config');

const app = express();
// Health check endpoint for certificate validation
app.get('/api/health-check', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Certificate validated successfully' });
});

// Define PORT and HTTPS_PORT
const PORT = process.env.PORT || 5001;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;

// Enable debug mode for detailed logging
const DEBUG = true;

// Debug logging function
function debugLog(message, data = null) {
  if (DEBUG) {
    if (data) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

// Create HTTP server
const server = http.createServer(app);

// Get server IP address for certificate
const getLocalIpAddress = () => {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      // Skip internal and non-IPv4 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return 'localhost'; // Fallback to localhost if no external IP is found
};

const serverIP = getLocalIpAddress();

// Generate self-signed certificate for HTTPS
let httpsServer;
try {
  console.log('Generating self-signed SSL certificate for local development...');
  // Include both localhost and the server IP address in the certificate
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const altNames = [
    { type: 2, value: 'localhost' },     // DNS name
    { type: 2, value: serverIP },        // Add server IP as a DNS name
    { type: 7, ip: '127.0.0.1' },        // IP address
    { type: 7, ip: serverIP }            // Server IP address
  ];
  
  const pems = selfsigned.generate(attrs, { 
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }]
  });
  
  // Create HTTPS server
  httpsServer = https.createServer({
    key: pems.private,
    cert: pems.cert
  }, app);
} catch (err) {
  console.error('Failed to create HTTPS server:', err);
  console.log('Continuing with HTTP only (WebRTC may not work on iOS devices)');
}

// Configure Socket.io with more permissive CORS for local development
const io = new Server(server, {
  cors: {
    origin: "*", // In production, you should be more specific
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  path: '/socket.io',
  transports: ['polling', 'websocket'], // Allow both, but polling will be used on Cloud Run
  allowEIO3: true, // Enable compatibility with older clients
  pingInterval: 10000, // More frequent pings to keep connection alive
  pingTimeout: 5000
});

// Configure Socket.io for HTTPS server if available
let httpsIo;
if (httpsServer) {
  httpsIo = new Server(httpsServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization'],
      credentials: true
    },
    transports: ['polling', 'websocket'], // Important: Start with polling for better compatibility
    perMessageDeflate: false
  });
}

// Updated CORS configuration to allow connections from any device on the network
app.use(cors({
  origin: '*', // Allow any origin during development
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// -------------------------- DATABASE --------------------------

// Add additional logging for database connection
console.log(`Connecting to MongoDB...`);

// Update the MongoDB connection with a default URI
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mcgill-chat', {
  serverSelectionTimeoutMS: 5000 // Reduce connection timeout
})
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    console.error("Please check your database connection and credentials");
  });

// -------------------------- USER SCHEMA --------------------------

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  yearOfStudy: String,
  faculty: String,
  createdAt: { type: Date, default: Date.now }
});

const User = require('./models/User');

// -------------------------- MESSAGE SCHEMA --------------------------

const MessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// -------------------------- API ROUTES --------------------------

// Create an API router to prefix all API routes
const apiRouter = express.Router();

// Register Route - UPDATED WITH /api PREFIX
apiRouter.post('/register', async (req, res) => {
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

// Login Route - UPDATED WITH /api PREFIX
apiRouter.post('/login', async (req, res) => {
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
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '24h' }
    );

    console.log(`✅ Login successful: ${email}`);
    res.json({ token, message: '✅ Logged in successfully.' });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


apiRouter.post('/users', async (req, res) => {
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
apiRouter.get('/authtest', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is reachable',
    authenticationRequired: false
  });
});
apiRouter.get('/authcheck', authMiddleware, (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Authentication successful!',
    user: req.user.firebaseUid,
    email: req.user.email
  });
});

// API endpoint to get server info
apiRouter.get('/server-info', (req, res) => {
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
    httpPort: PORT,
    httpsPort: HTTPS_PORT,
    localIPs,
    activeUsers: Object.keys(connectedUsers).length,
    waitingUsers: {
      text: waitingUsers.text.length,
      video: waitingUsers.video.length
    }
  });
});

// Mount the API router
app.use('/api', apiRouter);

// -------------------------- SERVE REACT APP --------------------------

// Always serve the React app from the frontend build directory
console.log('📱 Setting up to serve React frontend from backend server');

// Define the build path
const reactBuildPath = path.join(__dirname, 'public');

// Check if the build directory exists
if (fs.existsSync(reactBuildPath) && fs.existsSync(path.join(reactBuildPath, 'index.html'))) {
  console.log(`✅ Found React build files at: ${reactBuildPath}`);
  
  // Serve static files from the React build directory
  app.use(express.static(reactBuildPath));
  
  // Keep the WebRTC test page
  app.get('/videotest', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WebRTC Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          video { width: 100%; border: 1px solid #ddd; border-radius: 8px; background: #000; }
          button { margin-top: 20px; padding: 10px; background: #4CAF50; color: white; border: none; 
                  border-radius: 4px; font-size: 16px; cursor: pointer; }
          .result { margin-top: 20px; padding: 10px; border-radius: 4px; }
          .success { background: rgba(76, 175, 80, 0.2); color: #4CAF50; }
          .error { background: rgba(244, 67, 54, 0.2); color: #F44336; }
        </style>
      </head>
      <body>
        <h2>WebRTC Camera Test</h2>
        <p>This page tests if your device supports WebRTC camera access.</p>
        
        <video id="localVideo" autoplay playsinline muted></video>
        <button id="startButton">Start Camera</button>
        <div id="result" style="display: none;" class="result"></div>
        
        <script>
          document.getElementById('startButton').addEventListener('click', async () => {
            const resultEl = document.getElementById('result');
            resultEl.style.display = 'block';
            
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
              });
              
              const videoElement = document.getElementById('localVideo');
              videoElement.srcObject = stream;
              
              document.getElementById('startButton').textContent = 'Camera Working!';
              document.getElementById('startButton').style.backgroundColor = '#4CAF50';
              
              resultEl.innerHTML = 'SUCCESS: WebRTC is working on your device! The camera access was granted.';
              resultEl.className = 'result success';
              
              // Add browser details
              const browserDetails = document.createElement('p');
              browserDetails.textContent = 'Browser: ' + navigator.userAgent;
              resultEl.appendChild(browserDetails);
              
              // Add protocol info
              const protocolDetails = document.createElement('p');
              protocolDetails.textContent = 'Protocol: ' + window.location.protocol;
              resultEl.appendChild(protocolDetails);
            } catch (err) {
              console.error('Error accessing camera:', err);
              document.getElementById('startButton').textContent = 'Error';
              document.getElementById('startButton').style.backgroundColor = '#f44336';
              
              resultEl.innerHTML = 'ERROR: ' + err.message;
              resultEl.className = 'result error';
              
              // Add browser details
              const browserDetails = document.createElement('p');
              browserDetails.textContent = 'Browser: ' + navigator.userAgent;
              resultEl.appendChild(browserDetails);
              
              // Add protocol info
              const protocolDetails = document.createElement('p');
              protocolDetails.textContent = 'Protocol: ' + window.location.protocol;
              resultEl.appendChild(protocolDetails);
            }
          });
        </script>
      </body>
      </html>
    `);
  });
  
  // For any request that doesn't match an API route or static file, serve the React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(reactBuildPath, 'index.html'));
  });
  
  console.log('✅ React app will be served to all routes not handled by the API');
} else {
  console.log('⚠️ Could not find React build directory at:', reactBuildPath);
  console.log('Please build your React app with "npm run build" in the frontend directory');
  
  // Fall back to the default server info page if no React build is found
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>McGill Chat Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #7A003C; }
          .info { background: #f4f4f4; padding: 20px; border-radius: 5px; }
          .success { color: green; }
          .error { color: red; }
          .warning { color: orange; }
          code { background: #f8f8f8; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        </style>
      </head>
      <body>
        <h1>McGill Chat Server</h1>
        <div class="info">
          <p>The server is running correctly! ✅</p>
          <p class="warning">React build not found. Please follow these steps:</p>
          <ol>
            <li>Go to your React project directory: <code>cd ../mcgill-chat-frontend</code></li>
            <li>Build the React app: <code>npm run build</code></li>
            <li>Restart this server</li>
          </ol>
          <p>API Endpoints:</p>
          <ul>
            <li>POST /api/register - Register a new user</li>
            <li>POST /api/login - Log in user</li>
            <li>GET /api/authtest - Test authentication (requires token)</li>
          </ul>
          <p><a href="/videotest">Test WebRTC Camera Access</a></p>
        </div>
      </body>
      </html>
    `);
  });
  
  // Keep the WebRTC test page
  app.get('/videotest', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WebRTC Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          video { width: 100%; border: 1px solid #ddd; border-radius: 8px; background: #000; }
          button { margin-top: 20px; padding: 10px; background: #4CAF50; color: white; border: none; 
                  border-radius: 4px; font-size: 16px; cursor: pointer; }
          .result { margin-top: 20px; padding: 10px; border-radius: 4px; }
          .success { background: rgba(76, 175, 80, 0.2); color: #4CAF50; }
          .error { background: rgba(244, 67, 54, 0.2); color: #F44336; }
        </style>
      </head>
      <body>
        <h2>WebRTC Camera Test</h2>
        <p>This page tests if your device supports WebRTC camera access.</p>
        
        <video id="localVideo" autoplay playsinline muted></video>
        <button id="startButton">Start Camera</button>
        <div id="result" style="display: none;" class="result"></div>
        
        <script>
          document.getElementById('startButton').addEventListener('click', async () => {
            const resultEl = document.getElementById('result');
            resultEl.style.display = 'block';
            
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
              });
              
              const videoElement = document.getElementById('localVideo');
              videoElement.srcObject = stream;
              
              document.getElementById('startButton').textContent = 'Camera Working!';
              document.getElementById('startButton').style.backgroundColor = '#4CAF50';
              
              resultEl.innerHTML = 'SUCCESS: WebRTC is working on your device! The camera access was granted.';
              resultEl.className = 'result success';
              
              // Add browser details
              const browserDetails = document.createElement('p');
              browserDetails.textContent = 'Browser: ' + navigator.userAgent;
              resultEl.appendChild(browserDetails);
              
              // Add protocol info
              const protocolDetails = document.createElement('p');
              protocolDetails.textContent = 'Protocol: ' + window.location.protocol;
              resultEl.appendChild(protocolDetails);
            } catch (err) {
              console.error('Error accessing camera:', err);
              document.getElementById('startButton').textContent = 'Error';
              document.getElementById('startButton').style.backgroundColor = '#f44336';
              
              resultEl.innerHTML = 'ERROR: ' + err.message;
              resultEl.className = 'result error';
              
              // Add browser details
              const browserDetails = document.createElement('p');
              browserDetails.textContent = 'Browser: ' + navigator.userAgent;
              resultEl.appendChild(browserDetails);
              
              // Add protocol info
              const protocolDetails = document.createElement('p');
              protocolDetails.textContent = 'Protocol: ' + window.location.protocol;
              resultEl.appendChild(protocolDetails);
            }
          });
        </script>
      </body>
      </html>
    `);
  });
}

// -------------------------- SOCKET.IO --------------------------

const connectedUsers = {};
// Change waitingUsers to arrays instead of objects for easier management
const waitingUsers = {
  text: [],
  video: []
};
const userPairs = {};
const chatRooms = {};
const userPreferences = {};
const userNicknames = {}; // Add storage for nicknames
const userServerType = {}; // Track which server (HTTP/HTTPS) a user is connected to

// IMPROVED: Function to get user's socket - checking both HTTP and HTTPS servers
function getUserSocket(userId) {
  const socketId = connectedUsers[userId];
  if (!socketId) {
    debugLog(`No socket ID found for user ${userId}`);
    return null;
  }
  
  // First try HTTP server
  let socket = io.sockets.sockets.get(socketId);
  
  // If not found and HTTPS server exists, try there
  if (!socket && httpsIo) {
    socket = httpsIo.sockets.sockets.get(socketId);
    if (socket) {
      debugLog(`Found socket for ${userId} in HTTPS server`);
    }
  } else if (socket) {
    debugLog(`Found socket for ${userId} in HTTP server`);
  }
  
  if (!socket) {
    debugLog(`Could not find socket with ID ${socketId} for user ${userId} in either server`);
  }
  
  return socket;
}

// Configure socket handlers function (used for both HTTP and HTTPS servers)
function configureSocketHandlers(socket, isHttps = false) {
  const serverType = isHttps ? 'HTTPS' : 'HTTP';
  
  socket.on('connection', (socket) => {
    console.log(`✅ User connected to ${serverType} server: ${socket.id}`);
  
    // Handle user joining the chat
    socket.on('join', async (userId) => {
      console.log(`ℹ️ ${userId} joined the chat via ${serverType} server`);
      socket.join(userId);
      
      // Store user connection with their socket ID
      connectedUsers[userId] = socket.id;
      
      // Also track which server they're on
      userServerType[userId] = serverType;
      
      // If user was waiting in the other server, remove them
      waitingUsers.text = waitingUsers.text.filter(id => id !== userId);
      waitingUsers.video = waitingUsers.video.filter(id => id !== userId);
      
      // Broadcast active users
      socket.emit('activeUsers', Object.keys(connectedUsers));
    });
    
    // Explicit join room event
    socket.on('joinRoom', ({ roomId, userId }) => {
      if (roomId && userId) {
        debugLog(`User ${userId} explicitly joining room ${roomId} on ${serverType} server`);
        socket.join(roomId);
        
        // Send confirmation back to client
        socket.emit('connectionConfirmed', { roomId });
        
        // Cross-broadcast confirmation to other server if this is in a dual-server setup
        if (!isHttps && httpsIo) {
          debugLog(`Cross-broadcasting connection confirmation to HTTPS server for room ${roomId}`);
          httpsIo.to(roomId).emit('connectionConfirmed', { roomId });
        } else if (isHttps && io) {
          debugLog(`Cross-broadcasting connection confirmation to HTTP server for room ${roomId}`);
          io.to(roomId).emit('connectionConfirmed', { roomId });
        }
      }
    });
  
    // ------------------ SET CHAT PREFERENCE ------------------
    
    socket.on('setChatPreference', ({ userId, preference }) => {
      console.log(`🔧 ${userId} set chat preference to ${preference}`);
      userPreferences[userId] = preference; // 'text' or 'video'
    });
  
    // ------------------ FIND PARTNER ------------------
  
    // Initialize a global object to store user filters
const userFilters = {};

socket.on('findPartner', ({ userId, chatType, nickname, filters }) => {
  debugLog(`[PARTNER DEBUG] User ${userId} (${nickname}) is looking for a ${chatType} partner`, {
    filters,
    totalWaiting: {
      text: waitingUsers.text.length,
      video: waitingUsers.video.length
    },
    allUsers: Object.keys(connectedUsers).length,
    serverType: userServerType[userId] || 'unknown'
  });
  
  // Store user's nickname
  if (nickname) {
    userNicknames[userId] = nickname;
    debugLog(`[PARTNER DEBUG] Stored nickname for ${userId}: ${nickname}`);
  }
  
  // Store user's chat preference if provided
  if (chatType) {
    userPreferences[userId] = chatType;
    debugLog(`[PARTNER DEBUG] Stored chat preference for ${userId}: ${chatType}`);
  }
  
  // Store user's filters if provided
  if (filters) {
    userFilters[userId] = filters;
    debugLog(`[PARTNER DEBUG] Stored filters for ${userId}:`, filters);
  }
  
  // Default to text chat if no preference set
  const preferredChatType = userPreferences[userId] || 'text';
  
  // Remove this user from waiting lists if they're already there
  waitingUsers.text = waitingUsers.text.filter(id => id !== userId);
  waitingUsers.video = waitingUsers.video.filter(id => id !== userId);
  
  debugLog(`[PARTNER DEBUG] Removed ${userId} from waiting lists. Current counts - Text: ${waitingUsers.text.length}, Video: ${waitingUsers.video.length}`);
  
  // Find a compatible partner
  debugLog(`[PARTNER DEBUG] Calling findCompatiblePartner for ${userId} with chat type ${preferredChatType}`);
  
  findCompatiblePartner(userId, preferredChatType).then(partnerInfo => {
    if (partnerInfo) {
      debugLog(`[PARTNER DEBUG] Found compatible partner for ${userId}: ${partnerInfo.partnerId}`);
      
      const { partnerId, partnerIndex } = partnerInfo;
      
      // Remove the partner from waiting list
      waitingUsers[preferredChatType].splice(partnerIndex, 1);
      debugLog(`[PARTNER DEBUG] Removed partner ${partnerId} from waiting list`);
      
      // Create a unique room ID
      const roomId = `${preferredChatType}_room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      debugLog(`[PARTNER DEBUG] Created room ${roomId} for ${userId} and ${partnerId}`);
      
      // Get both user sockets
      const userSocket = getUserSocket(userId);
      const partnerSocket = getUserSocket(partnerId);
      
      // Log details about the sockets
      debugLog(`[PARTNER DEBUG] User socket exists: ${!!userSocket}, Partner socket exists: ${!!partnerSocket}`);
      debugLog(`[PARTNER DEBUG] User server type: ${userServerType[userId]}, Partner server type: ${userServerType[partnerId]}`);
      
      // Check if both sockets exist
      if (!userSocket || !partnerSocket) {
        debugLog('[PARTNER DEBUG] CRITICAL ERROR: Could not find sockets for pairing', {
          userId,
          partnerId,
          userSocketExists: !!userSocket,
          partnerSocketExists: !!partnerSocket,
          userServerType: userServerType[userId] || 'unknown',
          partnerServerType: userServerType[partnerId] || 'unknown'
        });
        
        // If one of the sockets doesn't exist, put the valid user back in waiting
        if (userSocket) {
          waitingUsers[preferredChatType].push(userId);
          debugLog(`[PARTNER DEBUG] Added user ${userId} back to waiting list`);
          io.to(connectedUsers[userId]).emit('waiting', { 
            message: `Waiting for a ${preferredChatType} chat partner...` 
          });
        }
        
        if (partnerSocket) {
          waitingUsers[preferredChatType].push(partnerId);
          debugLog(`[PARTNER DEBUG] Added partner ${partnerId} back to waiting list`);
          io.to(connectedUsers[partnerId]).emit('waiting', { 
            message: `Waiting for a ${preferredChatType} chat partner...` 
          });
        }
        
        return;
      }
      
      debugLog(`[PARTNER DEBUG] Successfully found sockets for both users`);
      
      // Add both users to the room
      userSocket.join(roomId);
      partnerSocket.join(roomId);
      debugLog(`[PARTNER DEBUG] Added both users to room ${roomId}`);
      
      // Store room information
      chatRooms[roomId] = { 
        participants: [userId, partnerId],
        chatType: preferredChatType,
        createdAt: new Date()
      };
      
      userPairs[userId] = { partnerId, roomId };
      userPairs[partnerId] = { partnerId: userId, roomId };
      debugLog(`[PARTNER DEBUG] Stored room information and user pairings`);
      
      // First notify the partner who was waiting
      io.to(connectedUsers[partnerId]).emit('partnerFound', { 
        partnerId: userId, 
        partnerNickname: userNicknames[userId] || 'Anonymous',
        roomId,
        chatType: preferredChatType
      });
      debugLog(`[PARTNER DEBUG] Sent partnerFound to waiting partner ${partnerId}`);
      
      // Then notify the new user who initiated the search
      io.to(connectedUsers[userId]).emit('partnerFound', { 
        partnerId, 
        partnerNickname: userNicknames[partnerId] || 'Anonymous',
        roomId,
        chatType: preferredChatType
      });
      debugLog(`[PARTNER DEBUG] Sent partnerFound to initiating user ${userId}`);
      
      // Send a confirmation that ensures both clients respond
      setTimeout(() => {
        // Send to both servers to ensure delivery
        io.to(roomId).emit('connectionConfirmed', { roomId });
        if (httpsIo) {
          httpsIo.to(roomId).emit('connectionConfirmed', { roomId });
        }
        
        debugLog(`[PARTNER DEBUG] Sent connection confirmation for room ${roomId}`);
      }, 500);
    } else {
      // Add to waiting list
      waitingUsers[preferredChatType].push(userId);
      debugLog(`[PARTNER DEBUG] No partner found, added ${userId} to ${preferredChatType} waiting list`);
      debugLog(`[PARTNER DEBUG] Current waiting counts - Text: ${waitingUsers.text.length}, Video: ${waitingUsers.video.length}`);
      debugLog(`[PARTNER DEBUG] Users in waiting: ${JSON.stringify(waitingUsers)}`);
      
      io.to(connectedUsers[userId]).emit('waiting', { 
        message: `Waiting for a ${preferredChatType} chat partner...` 
      });
      debugLog(`[PARTNER DEBUG] Sent waiting message to ${userId}`);
    }
  }).catch(err => {
    console.error('[PARTNER DEBUG] Error finding compatible partner:', err);
    // Add to waiting list anyway if there's an error
    waitingUsers[preferredChatType].push(userId);
    io.to(connectedUsers[userId]).emit('waiting', { 
      message: `Waiting for a ${preferredChatType} chat partner...` 
    });
    debugLog(`[PARTNER DEBUG] Error occurred, added ${userId} to waiting list`);
  });
});

// Add these debug logs to the findCompatiblePartner function

async function findCompatiblePartner(userId, chatType) {
  debugLog(`[PARTNER DEBUG] Starting findCompatiblePartner for ${userId} with chat type ${chatType}`);
  
  // Get the user's filters
  const filters = userFilters[userId] || {}; 
  debugLog(`[PARTNER DEBUG] User filters:`, filters);
  
  // Get waiting users for this chat type
  const waitingList = waitingUsers[chatType];
  debugLog(`[PARTNER DEBUG] Current waiting list for ${chatType}: ${JSON.stringify(waitingList)}`);
  debugLog(`[PARTNER DEBUG] Waiting list count: ${waitingList.length}`);
  
  // If the waiting list is empty, return null
  if (waitingList.length === 0) {
    debugLog(`[PARTNER DEBUG] No users waiting for ${chatType}, returning null`);
    return null;
  }
  
  // If no filters, just return the first waiting user
  if (!filters || (!filters.faculty && !filters.yearOfStudy)) {
    debugLog(`[PARTNER DEBUG] No specific filters, finding first available user`);
    const partnerIndex = waitingList.findIndex(id => id !== userId);
    if (partnerIndex !== -1) {
      debugLog(`[PARTNER DEBUG] Found partner at index ${partnerIndex}: ${waitingList[partnerIndex]}`);
      return { partnerId: waitingList[partnerIndex], partnerIndex };
    }
    debugLog(`[PARTNER DEBUG] No suitable partner found in waiting list`);
    return null;
  }
  
  // Get current user data for comparison
  const currentUserEmail = userId; // Assuming userId is the email
  debugLog(`[PARTNER DEBUG] Looking for match with specific filters for user ${currentUserEmail}`);
  
  // Look through waiting users to find a compatible partner
  for (let i = 0; i < waitingList.length; i++) {
    const waitingUserId = waitingList[i];
    
    // Skip if it's the same user
    if (waitingUserId === userId) {
      debugLog(`[PARTNER DEBUG] Skipping self match at index ${i}`);
      continue;
    }
    
    debugLog(`[PARTNER DEBUG] Checking compatibility with waiting user: ${waitingUserId}`);
    
    // Get the waiting user's email to look up their profile
    const waitingUserEmail = waitingUserId; // Assuming email is used as userId
    
    // Check if filters match
    try {
      debugLog(`[PARTNER DEBUG] Looking up database profiles for ${currentUserEmail} and ${waitingUserEmail}`);
      // Get both users from the database
      const [currentUser, waitingUser] = await Promise.all([
        User.findOne({ email: currentUserEmail }),
        User.findOne({ email: waitingUserEmail })
      ]);
      
      if (!currentUser || !waitingUser) {
        debugLog(`[PARTNER DEBUG] One or both users not found in database. Current user exists: ${!!currentUser}, Waiting user exists: ${!!waitingUser}`);
        continue; // Skip if either user is not found
      }
      
      debugLog(`[PARTNER DEBUG] Found both users in database. Current user: ${currentUser.email}, Waiting user: ${waitingUser.email}`);
      debugLog(`[PARTNER DEBUG] Current user faculty: ${currentUser.faculty}, year: ${currentUser.yearOfStudy}`);
      debugLog(`[PARTNER DEBUG] Waiting user faculty: ${waitingUser.faculty}, year: ${waitingUser.yearOfStudy}`);
      
      // Check faculty filter if specified
      if (filters.faculty && filters.faculty !== 'Any') {
        if (waitingUser.faculty !== filters.faculty) {
          debugLog(`[PARTNER DEBUG] Faculty mismatch - required: ${filters.faculty}, waiting user: ${waitingUser.faculty}`);
          continue; // Faculty doesn't match, try next user
        }
        debugLog(`[PARTNER DEBUG] Faculty match - required: ${filters.faculty}, waiting user: ${waitingUser.faculty}`);
      }
      
      // Check year of study filter if specified
      if (filters.yearOfStudy && filters.yearOfStudy !== 'Any') {
        if (waitingUser.yearOfStudy !== filters.yearOfStudy) {
          debugLog(`[PARTNER DEBUG] Year mismatch - required: ${filters.yearOfStudy}, waiting user: ${waitingUser.yearOfStudy}`);
          continue; // Year doesn't match, try next user
        }
        debugLog(`[PARTNER DEBUG] Year match - required: ${filters.yearOfStudy}, waiting user: ${waitingUser.yearOfStudy}`);
      }
      
      // All filters passed, this user is compatible
      debugLog(`[PARTNER DEBUG] Found compatible partner ${waitingUserEmail} for ${currentUserEmail}`);
      return { partnerId: waitingUserId, partnerIndex: i };
      
    } catch (err) {
      console.error("[PARTNER DEBUG] Error checking user compatibility:", err);
      debugLog(`[PARTNER DEBUG] Database error while matching: ${err.message}`);
      debugLog(`[PARTNER DEBUG] Failed match attempt details - current: ${currentUserEmail}, waiting: ${waitingUserEmail}, filters:`, filters);
      continue; // Skip this user if there was an error
    }
  }
  
  // No compatible partner found
  debugLog(`[PARTNER DEBUG] No compatible partner found for ${userId} after checking ${waitingList.length} waiting users`);
  return null;
}
  
    // ------------------ SKIP ------------------
  
    socket.on('skip', (userId) => {
      console.log(`➡️ ${userId} skipped the chat`);
    
      if (userPairs[userId]) {
        const { partnerId, roomId } = userPairs[userId];
        
        // Notify the partner - send to both servers to ensure delivery
        if (partnerId && connectedUsers[partnerId]) {
          io.to(connectedUsers[partnerId]).emit('partnerDisconnected');
          if (httpsIo) {
            httpsIo.to(connectedUsers[partnerId]).emit('partnerDisconnected');
          }
        }
    
        // Remove both users from the room
        socket.leave(roomId);
        if (partnerId && connectedUsers[partnerId]) {
          const partnerSocket = getUserSocket(partnerId);
          if (partnerSocket) {
            partnerSocket.leave(roomId);
          }
        }
    
        // Clean up pairing data
        delete userPairs[userId];
        if (partnerId) delete userPairs[partnerId];
        delete chatRooms[roomId];
      }
    
      // Remove from all waiting lists
      waitingUsers.text = waitingUsers.text.filter(id => id !== userId);
      waitingUsers.video = waitingUsers.video.filter(id => id !== userId);
    });
  
    // ------------------ LOGOUT ------------------
  
    socket.on('logout', (userId) => {
      console.log(`🚪 User logged out: ${userId} (${userNicknames[userId] || 'Anonymous'})`);
      
      // Handle chat partner notification
      if (userPairs[userId]) {
        const { partnerId, roomId } = userPairs[userId];
        
        if (partnerId && connectedUsers[partnerId]) {
          // Send to both servers to ensure delivery
          io.to(connectedUsers[partnerId]).emit('partnerDisconnected');
          if (httpsIo) {
            httpsIo.to(connectedUsers[partnerId]).emit('partnerDisconnected');
          }
        }
        
        // Clean up room
        if (roomId) {
          delete chatRooms[roomId];
        }
        
        // Clean up pairing
        if (partnerId) {
          delete userPairs[partnerId];
        }
        delete userPairs[userId];
      }
      
      // Remove from connected and waiting lists
      delete connectedUsers[userId];
      delete userServerType[userId];
      waitingUsers.text = waitingUsers.text.filter(id => id !== userId);
      waitingUsers.video = waitingUsers.video.filter(id => id !== userId);
      delete userPreferences[userId];
      delete userNicknames[userId];
      
      // Update active users list - broadcast to both servers
      io.emit('activeUsers', Object.keys(connectedUsers));
      if (httpsIo) {
        httpsIo.emit('activeUsers', Object.keys(connectedUsers));
      }
    });
  
    // ------------------ CONNECTION CHECK ------------------
    
    // Add connection status check
    socket.on('checkConnection', ({ userId, roomId }) => {
      if (roomId && chatRooms[roomId]) {
        debugLog(`Connection check from ${userId} for room ${roomId} on ${serverType} server`, chatRooms[roomId]);
        
        // Emit confirmation to the room on both servers
        io.to(roomId).emit('connectionConfirmed', { roomId });
        if (httpsIo) {
          httpsIo.to(roomId).emit('connectionConfirmed', { roomId });
        }
      }
    });
    
    // ------------------ CLIENT READY ------------------
    
    socket.on('clientReady', ({ roomId, userId }) => {
      debugLog(`Client ${userId} is ready in room ${roomId} on ${serverType} server`);
      
      if (roomId && chatRooms[roomId]) {
        // Join the room explicitly
        socket.join(roomId);
        
        // Notify other users in the room
        socket.to(roomId).emit('peer_ready', { userId, roomId });
        
        // Send confirmation to this client
        socket.emit('connectionConfirmed', { roomId });
        
        debugLog(`Sent readiness confirmation for ${userId} in room ${roomId}`);
      } else if (roomId) {
        debugLog(`Room ${roomId} not found for client ready event`);
      }
    });
  
    // ------------------ TEXT MESSAGE HANDLING ------------------
  
    socket.on('sendMessage', ({ senderId, receiverId, message, roomId }) => {
      console.log(`💬 Message from ${senderId} to ${receiverId} in room ${roomId}: ${message}`);
      
      if (roomId && chatRooms[roomId]) {
        // Save message to database
        new Message({ 
          senderId, 
          receiverId, 
          message, 
          status: 'delivered',
          createdAt: new Date()
        }).save();
  
        // Broadcast to room on both servers to ensure delivery
        io.to(roomId).emit('receiveMessage', { 
          senderId, 
          message, 
          createdAt: new Date() 
        });
        
        if (httpsIo) {
          httpsIo.to(roomId).emit('receiveMessage', { 
            senderId, 
            message, 
            createdAt: new Date() 
          });
        }
      } else {
        console.log(`⚠️ Message not sent: Invalid room ${roomId}`);
      }
    });
  
    // ------------------ TYPING HANDLING ------------------
  
    socket.on('typing', ({ senderId, roomId }) => {
      if (roomId && chatRooms[roomId]) {
        // Broadcast to both servers to ensure delivery
        socket.to(roomId).emit('typing', { senderId });
        
        // If this is HTTP server and HTTPS server exists, also broadcast there
        if (!isHttps && httpsIo) {
          httpsIo.to(roomId).emit('typing', { senderId });
        }
        // If this is HTTPS server and HTTP server exists, also broadcast there
        else if (isHttps && io) {
          io.to(roomId).emit('typing', { senderId });
        }
      }
    });
  
    // ------------------ WEBRTC SIGNALING ------------------
    
    // WebRTC signaling for SDP exchange (offer/answer)
    socket.on('relay_sdp', (data) => {
      debugLog(`Relaying SDP (${data.sdp.type}) for room ${data.roomId} on ${serverType} server`);
      
      if (data.roomId && chatRooms[data.roomId]) {
        // Broadcast to the room on both servers
        socket.to(data.roomId).emit('sdp', data);
        
        // Cross-broadcast to other server
        if (!isHttps && httpsIo) {
          httpsIo.to(data.roomId).emit('sdp', data);
        } else if (isHttps && io) {
          io.to(data.roomId).emit('sdp', data);
        }
        
        debugLog(`SDP relay successful for room ${data.roomId}`);
      } else {
        debugLog(`SDP relay failed - room ${data.roomId} not found`);
      }
    });
    
    // WebRTC signaling for ICE candidates
    socket.on('relay_ice_candidate', (data) => {
      if (data.roomId && chatRooms[data.roomId]) {
        debugLog(`Relaying ICE candidate for room ${data.roomId} on ${serverType} server`);
        
        // Broadcast to the room on both servers
        socket.to(data.roomId).emit('ice_candidate', data);
        
        // Cross-broadcast to other server
        if (!isHttps && httpsIo) {
          httpsIo.to(data.roomId).emit('ice_candidate', data);
        } else if (isHttps && io) {
          io.to(data.roomId).emit('ice_candidate', data);
        }
      }
    });
    
    // Handle media controls
    socket.on('toggleVideo', ({ enabled, roomId, senderId }) => {
      if (roomId && chatRooms[roomId]) {
        // Send to room on both servers
        socket.to(roomId).emit('partnerToggleVideo', { enabled, senderId });
        
        // Cross-broadcast to other server
        if (!isHttps && httpsIo) {
          httpsIo.to(roomId).emit('partnerToggleVideo', { enabled, senderId });
        } else if (isHttps && io) {
          io.to(roomId).emit('partnerToggleVideo', { enabled, senderId });
        }
      }
    });
    
    socket.on('toggleAudio', ({ enabled, roomId, senderId }) => {
      if (roomId && chatRooms[roomId]) {
        // Send to room on both servers
        socket.to(roomId).emit('partnerToggleAudio', { enabled, senderId });
        
        // Cross-broadcast to other server
        if (!isHttps && httpsIo) {
          httpsIo.to(roomId).emit('partnerToggleAudio', { enabled, senderId });
        } else if (isHttps && io) {
          io.to(roomId).emit('partnerToggleAudio', { enabled, senderId });
        }
      }
    });
  
    // ------------------ DISCONNECT ------------------
  
    socket.on('disconnect', () => {
      let disconnectedUserId = null;
      
      // Find which user disconnected
      for (const userId in connectedUsers) {
        if (connectedUsers[userId] === socket.id) {
          disconnectedUserId = userId;
          break;
        }
      }
  
      if (disconnectedUserId) {
        console.log(`⚠️ User disconnected from ${serverType} server: ${disconnectedUserId} (${userNicknames[disconnectedUserId] || 'Anonymous'})`);
        
        // Handle chat partner notification
        if (userPairs[disconnectedUserId]) {
          const { partnerId, roomId } = userPairs[disconnectedUserId];
          
          if (partnerId && connectedUsers[partnerId]) {
            // Send to both servers to ensure delivery
            io.to(connectedUsers[partnerId]).emit('partnerDisconnected');
            if (httpsIo) {
              httpsIo.to(connectedUsers[partnerId]).emit('partnerDisconnected');
            }
          }
          
          // Clean up room
          if (roomId) {
            delete chatRooms[roomId];
          }
          
          // Clean up pairing
          if (partnerId) {
            delete userPairs[partnerId];
          }
          delete userPairs[disconnectedUserId];
        }
        
        // Only remove from connected lists if this was the server the user was connected to
        if (userServerType[disconnectedUserId] === serverType) {
          delete connectedUsers[disconnectedUserId];
          delete userServerType[disconnectedUserId];
          
          // Remove from waiting lists
          waitingUsers.text = waitingUsers.text.filter(id => id !== disconnectedUserId);
          waitingUsers.video = waitingUsers.video.filter(id => id !== disconnectedUserId);
          delete userPreferences[disconnectedUserId];
          delete userNicknames[disconnectedUserId]; // Remove nickname
          
          // Update active users list - broadcast to both servers
          io.emit('activeUsers', Object.keys(connectedUsers));
          if (httpsIo) {
            httpsIo.emit('activeUsers', Object.keys(connectedUsers));
          }
        }
      }
    });
  });
}

// Set up socket handlers for HTTP server
configureSocketHandlers(io, false);  // HTTP server

// Set up socket handlers for HTTPS server if available
if (httpsIo) {
  configureSocketHandlers(httpsIo, true);  // HTTPS server
}

// -------------------------- SERVER START --------------------------

server.listen(PORT, '0.0.0.0', () => {
  // Get the network interfaces to display the server's IP address
  const networkInterfaces = os.networkInterfaces();
  const localIPs = [];
  
  // Filter for IPv4 addresses
  Object.keys(networkInterfaces).forEach(interfaceName => {
    const interfaces = networkInterfaces[interfaceName];
    interfaces.forEach(iface => {
      // Skip internal and non-IPv4 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        localIPs.push(iface.address);
      }
    });
  });
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Connect from other devices using:`);
  
  const protocol = 'http';
  localIPs.forEach(ip => {
    console.log(`  - ${protocol}://${ip}:${PORT}`);
  });
  
  console.log(`\n📝 API endpoints are available at:`);
  localIPs.forEach(ip => {
    console.log(`  - ${protocol}://${ip}:${PORT}/api/login`);
    console.log(`  - ${protocol}://${ip}:${PORT}/api/register`);
  });
  
  console.log(`\n⚠️ WebRTC test page available at:`);
  localIPs.forEach(ip => {
    console.log(`  - ${protocol}://${ip}:${PORT}/videotest`);
  });
  
  console.log(`${'='.repeat(60)}`);
});

// Start HTTPS server if available
if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    // Get the network interfaces to display the server's IP address
    const networkInterfaces = os.networkInterfaces();
    const localIPs = [];
    
    // Filter for IPv4 addresses
    Object.keys(networkInterfaces).forEach(interfaceName => {
      const interfaces = networkInterfaces[interfaceName];
      interfaces.forEach(iface => {
        // Skip internal and non-IPv4 addresses
        if (!iface.internal && iface.family === 'IPv4') {
          localIPs.push(iface.address);
        }
      });
    });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
    console.log(`📱 Connect securely from other devices using:`);
    
    localIPs.forEach(ip => {
      console.log(`  - https://${ip}:${HTTPS_PORT}`);
    });
    
    console.log(`\n⚠️ WebRTC test page available at:`);
    localIPs.forEach(ip => {
      console.log(`  - https://${ip}:${HTTPS_PORT}/videotest`);
    });
    
    if (reactBuildPath) {
      console.log(`\n✅ React app is being served at:`);
      localIPs.forEach(ip => {
        console.log(`  - https://${ip}:${HTTPS_PORT}`);
      });
    }
    
    console.log(`NOTE: Your browser will show a security warning - this is normal with self-signed certificates.`);
    console.log(`You'll need to accept the certificate to use WebRTC on iOS devices.`);
    console.log(`${'='.repeat(60)}`);
  });
}