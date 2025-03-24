const { Server } = require('socket.io');
const Message = require('../models/Message');
const User = require('../models/User');
const config = require('../config');
const socketState = require('./socketState');
const socketHandlers = require('./socketHandlers');

// Destructure socket state for convenience
const {
  connectedUsers,
  waitingUsers,
  userPairs,
  chatRooms,
  userPreferences,
  userNicknames,
  userServerType
} = socketState;

// Debug logging function
function debugLog(message, data = null) {
  if (config.debug) {
    if (data) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

// Function to configure Socket.io with CORS
function configureSocketIo(server, isHttps = false) {
  return new Server(server, {
    cors: config.socketIO.cors,
    path: '/socket.io',
    transports: config.socketIO.transports,
    allowEIO3: true,
    connectTimeout: 60000,
    pingInterval: config.socketIO.pingInterval,
    pingTimeout: config.socketIO.pingTimeout,
    maxHttpBufferSize: config.socketIO.maxHttpBufferSize,
    cookie: false,
    perMessageDeflate: isHttps ? false : undefined
  });
}

// Function to get user's socket
function getUserSocket(userId, io) {
  const socketId = connectedUsers[userId];
  if (!socketId) {
    debugLog(`No socket ID found for user ${userId}`);
    return null;
  }
  
  const socket = io.sockets.sockets.get(socketId);
  
  if (!socket) {
    debugLog(`Could not find socket with ID ${socketId} for user ${userId}`);
  } else {
    debugLog(`Found socket for ${userId}`);
  }
  
  return socket;
}

// Setup socket handlers function
function setupSocketHandlers(socketIO, isHttps = false) {
  const serverType = isHttps ? 'HTTPS' : 'HTTP';
  
  socketIO.on('connection', (socket) => {
    console.log(`✅ User connected to ${serverType} server: ${socket.id}`);
    
    // Register all event handlers
    socketHandlers.registerHandlers(socket, socketIO, isHttps, serverType);
  });
}

module.exports = {
  getUserSocket,
  configureSocketIo,
  setupSocketHandlers,
  debugLog
};