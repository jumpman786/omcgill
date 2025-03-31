const Message = require('../models/Message');
const User = require('../models/User');
const config = require('../config');
const socketState = require('./socketState');

// Destructure socket state for convenience
const {
  connectedUsers,
  waitingUsers,
  userPairs,
  chatRooms,
  userPreferences,
  userNicknames,
  userServerType,
  userFilters
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

// Helper to find compatible partner
async function findCompatiblePartner(userId, chatType) {
  // Check if there are ANY waiting users first
  if (waitingUsers[chatType].length === 0) {
    debugLog(`[PARTNER DEBUG] No users waiting for ${chatType}`);
    return null;
  }
  
  // Shuffle the waiting list to avoid always matching the same users
  // and to distribute matches more evenly
  const shuffledWaitingList = [...waitingUsers[chatType]].sort(() => Math.random() - 0.5);
  
  // Try to find a partner that isn't the current user
  for (const potentialPartnerId of shuffledWaitingList) {
    // Skip if it's the same user
    if (potentialPartnerId === userId) {
      continue;
    }
    
    // Check if the potential partner is still connected
    if (!connectedUsers[potentialPartnerId]) {
      // Remove disconnected users from waiting list
      const disconnectedIndex = waitingUsers[chatType].indexOf(potentialPartnerId);
      if (disconnectedIndex !== -1) {
        waitingUsers[chatType].splice(disconnectedIndex, 1);
        debugLog(`[PARTNER DEBUG] Removed disconnected user ${potentialPartnerId} from waiting list`);
      }
      continue;
    }
    
    // Get filters for current user (if any)
    const userFilter = userFilters[userId] || { faculty: 'Any', yearOfStudy: 'Any' };
    
    // If user has specific filters, try to match according to them
    if (userFilter.faculty !== 'Any' || userFilter.yearOfStudy !== 'Any') {
      try {
        // Try to find user profiles from database
        const [currentUser, partnerUser] = await Promise.all([
          User.findOne({ email: userId }).lean().exec(),
          User.findOne({ email: potentialPartnerId }).lean().exec()
        ]);
        
        // If either user profile doesn't exist, skip filter matching
        if (!currentUser || !partnerUser) {
          debugLog(`[PARTNER DEBUG] Could not find user profiles for matching. Using default matching.`);
        } else {
          // Check faculty filter if specified
          if (userFilter.faculty !== 'Any' && partnerUser.faculty !== userFilter.faculty) {
            debugLog(`[PARTNER DEBUG] Faculty mismatch - ${userId} wants ${userFilter.faculty}, ${potentialPartnerId} is ${partnerUser.faculty || 'unknown'}`);
            continue;
          }
          
          // Check year of study filter if specified
          if (userFilter.yearOfStudy !== 'Any' && partnerUser.yearOfStudy !== userFilter.yearOfStudy) {
            debugLog(`[PARTNER DEBUG] Year mismatch - ${userId} wants ${userFilter.yearOfStudy}, ${potentialPartnerId} is ${partnerUser.yearOfStudy || 'unknown'}`);
            continue;
          }
          
          debugLog(`[PARTNER DEBUG] Found compatible filtered match: ${userId} and ${potentialPartnerId}`);
        }
      } catch (err) {
        // If there's a database error, log it but don't block matching
        console.error(`[PARTNER DEBUG] Database error while filtering matches:`, err);
        debugLog(`[PARTNER DEBUG] Proceeding with unfiltered matching due to DB error`);
      }
    }
    
    // Found a compatible partner
    const partnerIndex = waitingUsers[chatType].indexOf(potentialPartnerId);
    if (partnerIndex !== -1) {
      debugLog(`[PARTNER DEBUG] Match found: ${userId} with ${potentialPartnerId}`);
      return { partnerId: potentialPartnerId, partnerIndex };
    }
  }
  
  // No compatible partner found after checking all waiting users
  debugLog(`[PARTNER DEBUG] No compatible partner found for ${userId} after checking ${shuffledWaitingList.length} waiting users`);
  return null;
}

// Register all socket handlers
function registerHandlers(socket, io, isHttps, serverType) {
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
      debugLog(`User ${userId} explicitly joining room ${roomId}`);
      socket.join(roomId);
      
      // Send confirmation back to client
      socket.emit('connectionConfirmed', { roomId });
      
      // Broadcast confirmation to the room
      io.to(roomId).emit('connectionConfirmed', { roomId });
    }
  });

  // ------------------ SET CHAT PREFERENCE ------------------
  
  socket.on('setChatPreference', ({ userId, preference }) => {
    console.log(`🔧 ${userId} set chat preference to ${preference}`);
    userPreferences[userId] = preference; // 'text' or 'video'
  });

  // ------------------ FIND PARTNER ------------------

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
        const userSocket = io.sockets.sockets.get(connectedUsers[userId]);
        const partnerSocket = io.sockets.sockets.get(connectedUsers[partnerId]);
        
        // Log details about the sockets
        debugLog(`[PARTNER DEBUG] User socket exists: ${!!userSocket}, Partner socket exists: ${!!partnerSocket}`);
        
        // Check if both sockets exist
        if (!userSocket || !partnerSocket) {
          debugLog('[PARTNER DEBUG] CRITICAL ERROR: Could not find sockets for pairing', {
            userId,
            partnerId,
            userSocketExists: !!userSocket,
            partnerSocketExists: !!partnerSocket
          });
          
          // If one of the sockets doesn't exist, put the valid user back in waiting
          if (userSocket) {
            waitingUsers[preferredChatType].push(userId);
            debugLog(`[PARTNER DEBUG] Added user ${userId} back to waiting list`);
            socket.to(connectedUsers[userId]).emit('waiting', { 
              message: `Waiting for a ${preferredChatType} chat partner...` 
            });
          }
          
          if (partnerSocket) {
            waitingUsers[preferredChatType].push(partnerId);
            debugLog(`[PARTNER DEBUG] Added partner ${partnerId} back to waiting list`);
            socket.to(connectedUsers[partnerId]).emit('waiting', { 
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
          io.to(roomId).emit('connectionConfirmed', { roomId });
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

  socket.on('heartbeat', ({ userId, waiting, chatType }) => {
    debugLog(`[SERVER DEBUG] Received heartbeat from ${userId}, waiting: ${waiting}, chatType: ${chatType}`);
    
    // Check if the user exists in our connected users
    if (connectedUsers[userId]) {
      debugLog(`[SERVER DEBUG] User ${userId} is in connected users with socket ID ${connectedUsers[userId]}`);
      
      // Update the socket ID if it has changed
      if (connectedUsers[userId] !== socket.id) {
        debugLog(`[SERVER DEBUG] Updating socket ID for ${userId} from ${connectedUsers[userId]} to ${socket.id}`);
        connectedUsers[userId] = socket.id;
      }
      
      // Check if user is in waiting list but should be
      if (waiting && chatType) {
        const isInWaiting = waitingUsers[chatType].includes(userId);
        debugLog(`[SERVER DEBUG] User ${userId} is waiting for ${chatType}, in waiting list: ${isInWaiting}`);
        
        // If user should be waiting but isn't in the list, add them
        if (!isInWaiting) {
          debugLog(`[SERVER DEBUG] Adding ${userId} back to ${chatType} waiting list`);
          waitingUsers[chatType].push(userId);
          
          // Send waiting status back to client
          socket.emit('waiting', {
            message: `Waiting for a ${chatType} chat partner...`
          });
          
          // Try to find a partner immediately after adding back to waiting list
          findCompatiblePartner(userId, chatType).then(partnerInfo => {
            if (partnerInfo) {
              const { partnerId, partnerIndex } = partnerInfo;
              
              // Remove the partner from waiting list
              waitingUsers[chatType].splice(partnerIndex, 1);
              debugLog(`[PARTNER DEBUG] Removed partner ${partnerId} from waiting list`);
              
              // Create a unique room ID
              const roomId = `${chatType}_room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              debugLog(`[PARTNER DEBUG] Created room ${roomId} for ${userId} and ${partnerId}`);
              
              // Get both user sockets
              const userSocket = io.sockets.sockets.get(connectedUsers[userId]);
              const partnerSocket = io.sockets.sockets.get(connectedUsers[partnerId]);
              
              // Only proceed if both sockets exist
              if (userSocket && partnerSocket) {
                // Add both users to the room
                userSocket.join(roomId);
                partnerSocket.join(roomId);
                
                // Store room information
                chatRooms[roomId] = { 
                  participants: [userId, partnerId],
                  chatType: chatType,
                  createdAt: new Date()
                };
                
                userPairs[userId] = { partnerId, roomId };
                userPairs[partnerId] = { partnerId: userId, roomId };
                
                // Notify the partner who was waiting
                io.to(connectedUsers[partnerId]).emit('partnerFound', { 
                  partnerId: userId, 
                  partnerNickname: userNicknames[userId] || 'Anonymous',
                  roomId,
                  chatType: chatType
                });
                
                // Then notify the new user who initiated the search
                io.to(connectedUsers[userId]).emit('partnerFound', { 
                  partnerId, 
                  partnerNickname: userNicknames[partnerId] || 'Anonymous',
                  roomId,
                  chatType: chatType
                });
                
                // Send a confirmation that ensures both clients respond
                setTimeout(() => {
                  io.to(roomId).emit('connectionConfirmed', { roomId });
                }, 500);
              }
            }
          }).catch(err => {
            console.error('[PARTNER DEBUG] Error finding compatible partner during heartbeat:', err);
          });
        }
      }
    } else {
      // User not in connected users, re-add them
      debugLog(`[SERVER DEBUG] User ${userId} not found in connected users, re-registering`);
      connectedUsers[userId] = socket.id;
      userServerType[userId] = isHttps ? 'HTTPS' : 'HTTP';
      
      // If they were waiting, re-add them to waiting list
      if (waiting && chatType) {
        debugLog(`[SERVER DEBUG] Adding ${userId} back to ${chatType} waiting list`);
        
        // First ensure they're not already in the list
        waitingUsers.text = waitingUsers.text.filter(id => id !== userId);
        waitingUsers.video = waitingUsers.video.filter(id => id !== userId);
        
        // Then add to correct list
        waitingUsers[chatType].push(userId);
        
        // Send waiting status back to client
        socket.emit('waiting', {
          message: `Waiting for a ${chatType} chat partner...`
        });
        
        // Try to find a partner immediately
        findCompatiblePartner(userId, chatType).then(partnerInfo => {
          if (partnerInfo) {
            // Same partner matching logic as above
            const { partnerId, partnerIndex } = partnerInfo;
            
            // Remove the partner from waiting list
            waitingUsers[chatType].splice(partnerIndex, 1);
            
            // Create a unique room ID
            const roomId = `${chatType}_room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Get both user sockets
            const userSocket = io.sockets.sockets.get(connectedUsers[userId]);
            const partnerSocket = io.sockets.sockets.get(connectedUsers[partnerId]);
            
            // Only proceed if both sockets exist
            if (userSocket && partnerSocket) {
              // Add both users to the room
              userSocket.join(roomId);
              partnerSocket.join(roomId);
              
              // Store room information
              chatRooms[roomId] = { 
                participants: [userId, partnerId],
                chatType: chatType,
                createdAt: new Date()
              };
              
              userPairs[userId] = { partnerId, roomId };
              userPairs[partnerId] = { partnerId: userId, roomId };
              
              // Notify both users
              io.to(connectedUsers[partnerId]).emit('partnerFound', { 
                partnerId: userId, 
                partnerNickname: userNicknames[userId] || 'Anonymous',
                roomId,
                chatType: chatType
              });
              
              io.to(connectedUsers[userId]).emit('partnerFound', { 
                partnerId, 
                partnerNickname: userNicknames[partnerId] || 'Anonymous',
                roomId,
                chatType: chatType
              });
              
              // Send confirmation
              setTimeout(() => {
                io.to(roomId).emit('connectionConfirmed', { roomId });
              }, 500);
            }
          }
        }).catch(err => {
          console.error('[PARTNER DEBUG] Error finding compatible partner during heartbeat:', err);
        });
      }
      
      // Broadcast updated active users
      io.emit('activeUsers', Object.keys(connectedUsers));
    }
  });

  // ------------------ SKIP ------------------
  
  socket.on('skip', (userId) => {
    console.log(`➡️ ${userId} skipped the chat`);
  
    if (userPairs[userId]) {
      const { partnerId, roomId } = userPairs[userId];
      
      // Notify the partner
      if (partnerId && connectedUsers[partnerId]) {
        io.to(connectedUsers[partnerId]).emit('partnerDisconnected');
      }
  
      // Remove both users from the room
      socket.leave(roomId);
      if (partnerId && connectedUsers[partnerId]) {
        const partnerSocket = io.sockets.sockets.get(connectedUsers[partnerId]);
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
        io.to(connectedUsers[partnerId]).emit('partnerDisconnected');
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
    
    // Update active users list
    io.emit('activeUsers', Object.keys(connectedUsers));
  });

  // ------------------ CONNECTION CHECK ------------------
  
  // Add connection status check
  socket.on('checkConnection', ({ userId, roomId }) => {
    if (roomId && chatRooms[roomId]) {
      debugLog(`Connection check from ${userId} for room ${roomId}`);
      
      // Emit confirmation to the room
      io.to(roomId).emit('connectionConfirmed', { roomId });
    }
  });
  
  // ------------------ CLIENT READY ------------------
  
  socket.on('clientReady', ({ roomId, userId }) => {
    debugLog(`Client ${userId} is ready in room ${roomId}`);
    
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

  // On the server side, modify the sendMessage handler:
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

    // Broadcast to room - include roomId here
    io.to(roomId).emit('receiveMessage', { 
      senderId, 
      message, 
      roomId,  // Add this line to include roomId in the emitted message
      createdAt: new Date() 
    });
  } else {
    console.log(`⚠️ Message not sent: Invalid room ${roomId}`);
  }
});

  // ------------------ TYPING HANDLING ------------------

  socket.on('typing', ({ senderId, roomId }) => {
    if (roomId && chatRooms[roomId]) {
      // Broadcast to room
      io.to(roomId).emit('typing', { senderId });
    }
  });

  // ------------------ WEBRTC SIGNALING ------------------
  
  // Import improved WebRTC handlers
  const { registerWebRTCHandlers } = require('./improvedWebRTCHandlers');
  
  // Register WebRTC-specific event handlers
  registerWebRTCHandlers(socket, io, {
    chatRooms,
    userPairs,
    connectedUsers
  }, debugLog);
  
  // Handle media controls
  socket.on('toggleVideo', ({ enabled, roomId, senderId }) => {
    if (roomId && chatRooms[roomId]) {
      // Send to room
      io.to(roomId).emit('partnerToggleVideo', { enabled, senderId });
    }
  });
  
  socket.on('toggleAudio', ({ enabled, roomId, senderId }) => {
    if (roomId && chatRooms[roomId]) {
      // Send to room
      io.to(roomId).emit('partnerToggleAudio', { enabled, senderId });
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
      console.log(`⚠️ User disconnected: ${disconnectedUserId} (${userNicknames[disconnectedUserId] || 'Anonymous'})`);
      
      // Handle chat partner notification
      if (userPairs[disconnectedUserId]) {
        const { partnerId, roomId } = userPairs[disconnectedUserId];
        
        if (partnerId && connectedUsers[partnerId]) {
          io.to(connectedUsers[partnerId]).emit('partnerDisconnected');
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
      
      // Remove from connected lists
      delete connectedUsers[disconnectedUserId];
      delete userServerType[disconnectedUserId];
      
      // Remove from waiting lists
      waitingUsers.text = waitingUsers.text.filter(id => id !== disconnectedUserId);
      waitingUsers.video = waitingUsers.video.filter(id => id !== disconnectedUserId);
      delete userPreferences[disconnectedUserId];
      delete userNicknames[disconnectedUserId];
      
      // Update active users list
      io.emit('activeUsers', Object.keys(connectedUsers));
    }
  });
}

module.exports = {
  registerHandlers,
  findCompatiblePartner
};