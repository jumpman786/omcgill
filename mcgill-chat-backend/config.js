// config.js - Server configuration

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 5001,
    httpsPort: process.env.HTTPS_PORT || 443,
    host: process.env.HOST || '0.0.0.0', // Bind to all network interfaces
  },
  
  // Security settings
  security: {
    corsOrigins: process.env.CORS_ORIGINS ? 
      process.env.CORS_ORIGINS.split(',') : 
      ['https://localhost:3000', 'https://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:3000', '*'],
    sessionSecret: process.env.SESSION_SECRET || 'mcgill-chat-secret',
    jwtSecret: process.env.JWT_SECRET || 'fallback_secret_key',
  },
  
  // Socket.IO settings
  socketIO: {
    pingTimeout: 30000,
    pingInterval: 10000,
    upgradeTimeout: 15000,
    maxHttpBufferSize: 1e8,
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    cors: {
      origin: '*', // During development, allow all origins
      methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "X-Requested-With", "Authorization"],
      credentials: true
    }
  },
  
  // Database configuration
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mcgill-chat',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    }
  }
};
