require('dotenv').config();
const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const os = require('os');

const config = require('./config');
const authMiddleware = require('./authMiddleware');
const setupDatabase = require('./db/database');
const apiRoutes = require('./routes/apiRoutes');
const staticContent = require('./utils/staticContent');
const { setupSocketHandlers, configureSocketIo } = require('./socket/socketManager');

// Create Express app
const app = express();

// Comprehensive CORS middleware for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Health check endpoint for certificate validation
app.get('/api/health-check', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Certificate validated successfully' });
});

// Get server configuration
const HTTPS_PORT = config.server.httpsPort;

// Enable debug mode for detailed logging
const DEBUG = config.debug;

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

// Get server IP address for certificate
const serverIP = getLocalIpAddress();

// Generate self-signed certificate for HTTPS
let httpsServer;
try {
  console.log('Generating self-signed SSL certificate...');
  // Include both localhost and the server IP address in the certificate
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 2, value: serverIP },
    { type: 7, ip: '127.0.0.1' },
    { type: 7, ip: serverIP }
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
  console.error('Application requires HTTPS for WebRTC functionality.');
  process.exit(1);  // Exit if we can't create the HTTPS server
}

// Configure Socket.io with CORS
const io = configureSocketIo(httpsServer, true);

// Setup socket handlers
setupSocketHandlers(io, true);

// Also keep existing CORS middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Connect to database
setupDatabase();

// API Routes
app.use('/api', apiRoutes);

// Serve static content
setupStaticContent(app);

// Start HTTPS server
httpsServer.listen(HTTPS_PORT, config.server.host, () => {
  displayServerInfo(HTTPS_PORT, 'https', true);
});

// Helper function to get local IP address
function getLocalIpAddress() {
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
}

// Setup static content (React app)
function setupStaticContent(app) {
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
      res.send(staticContent.getWebRTCTestPage());
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
      res.send(staticContent.getDefaultServerPage());
    });
    
    // Keep the WebRTC test page
    app.get('/videotest', (req, res) => {
      res.send(staticContent.getWebRTCTestPage());
    });
  }
}

// Display server information when starting up
function displayServerInfo(port, protocol, isHttps = false) {
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
  if (isHttps) {
    console.log(`🔒 HTTPS Server running on port ${port}`);
    console.log(`📱 Connect securely from other devices using:`);
  } else {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📱 Connect from other devices using:`);
  }
  
  localIPs.forEach(ip => {
    console.log(`  - ${protocol}://${ip}:${port}`);
  });
  
  if (!isHttps) {
    console.log(`\n📝 API endpoints are available at:`);
    localIPs.forEach(ip => {
      console.log(`  - ${protocol}://${ip}:${port}/api/login`);
      console.log(`  - ${protocol}://${ip}:${port}/api/register`);
    });
  }
  
  console.log(`\n⚠️ WebRTC test page available at:`);
  localIPs.forEach(ip => {
    console.log(`  - ${protocol}://${ip}:${port}/videotest`);
  });
  
  const reactBuildPath = path.join(__dirname, 'public');
  if (fs.existsSync(reactBuildPath) && fs.existsSync(path.join(reactBuildPath, 'index.html')) && isHttps) {
    console.log(`\n✅ React app is being served at:`);
    localIPs.forEach(ip => {
      console.log(`  - ${protocol}://${ip}:${port}`);
    });
  }
  
  if (isHttps) {
    console.log(`NOTE: Your browser will show a security warning - this is normal with self-signed certificates.`);
    console.log(`You'll need to accept the certificate to use WebRTC on iOS devices.`);
  }
  
  console.log(`${'='.repeat(60)}`);
}

// Listen on the port specified by Cloud Run
const port = process.env.PORT || 443;
app.listen(port, '0.0.0.0', () => {
  console.log(`HTTP server listening on port ${port} for Cloud Run compatibility`);
});

// Export for testing purposes
module.exports = { app, httpsServer };