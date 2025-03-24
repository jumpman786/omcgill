// Centralized socket state management
const socketState = {
    // Connected users mapping userId -> socketId
    connectedUsers: {},
    
    // Waiting users by chat type
    waitingUsers: {
      text: [],
      video: []
    },
    
    // User pairing information
    userPairs: {},
    
    // Chat rooms information
    chatRooms: {},
    
    // User preferences
    userPreferences: {},
    
    // User nicknames
    userNicknames: {},
    
    // Track which server (HTTP/HTTPS) a user is connected to
    userServerType: {},
    
    // User filters for matching
    userFilters: {}
  };
  
  module.exports = socketState;