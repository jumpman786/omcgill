/**
 * Improved WebRTC signaling handlers
 */

// Store pending ICE candidates until SDP exchange completes
const pendingIceCandidates = {};

// Track connection state to prevent race conditions
const connectionState = {};

/**
 * Register WebRTC event handlers for a socket
 * @param {Object} socket - Socket.io socket object 
 * @param {Object} io - Socket.io server instance
 * @param {Object} state - Socket state (chatRooms, etc)
 * @param {Function} debugLog - Debug logging function
 */
function registerWebRTCHandlers(socket, io, state, debugLog) {
  const { chatRooms } = state;

  // WebRTC signaling for SDP exchange (offer/answer)
  socket.on('relay_sdp', async (data) => {
    const { roomId, sdp, userId } = data;
    debugLog(`Relaying SDP (${sdp.type}) for room ${roomId} from ${userId || 'unknown'}`);
    
    if (!roomId || !chatRooms[roomId]) {
      debugLog(`SDP relay failed - room ${roomId} not found or invalid`);
      return;
    }

    // Track connection state to prevent race conditions
    if (!connectionState[roomId]) {
      connectionState[roomId] = {
        offerCreated: sdp.type === 'offer',
        answerCreated: sdp.type === 'answer',
        lastSdpType: sdp.type,
        lastSdpTime: Date.now()
      };
    } else {
      // Update the state
      if (sdp.type === 'offer') {
        // If we already have an offer in this room, check if we should replace it
        if (connectionState[roomId].offerCreated) {
          const timeSinceLastOffer = Date.now() - connectionState[roomId].lastSdpTime;
          
          // If the new offer came too quickly after the previous one, 
          // only allow it if it comes from a different user
          if (timeSinceLastOffer < 2000 && !userId) {
            debugLog(`Ignoring duplicate offer for room ${roomId} - too soon after previous offer`);
            return;
          }
        }
        
        connectionState[roomId].offerCreated = true;
        connectionState[roomId].lastSdpType = 'offer';
        connectionState[roomId].lastSdpTime = Date.now();
      } else if (sdp.type === 'answer') {
        // Only process answer if we have already processed an offer
        if (!connectionState[roomId].offerCreated) {
          debugLog(`Ignoring answer for room ${roomId} - no offer has been relayed yet`);
          return;
        }
        
        connectionState[roomId].answerCreated = true;
        connectionState[roomId].lastSdpType = 'answer';
        connectionState[roomId].lastSdpTime = Date.now();
      }
    }

    // Broadcast SDP to the room (excluding the sender)
    socket.to(roomId).emit('sdp', data);
    debugLog(`SDP (${sdp.type}) relayed successfully to room ${roomId}`);
    
    // If this is an answer, release any pending ICE candidates
    if (sdp.type === 'answer') {
      setTimeout(() => {
        releasePendingCandidates(io, roomId, userId, debugLog);
      }, 500);
    }
  });
  
  // WebRTC signaling for ICE candidates
  socket.on('relay_ice_candidate', (data) => {
    const { roomId, candidate, userId } = data;
    
    if (!roomId || !chatRooms[roomId]) {
      debugLog(`ICE candidate relay failed - room ${roomId} not found`);
      return;
    }
    
    // If we don't have a connection state yet, or no SDP has been exchanged,
    // queue the candidate for later
    if (!connectionState[roomId] || 
        (!connectionState[roomId].offerCreated && !connectionState[roomId].answerCreated)) {
      // Store candidate to send later
      if (!pendingIceCandidates[roomId]) {
        pendingIceCandidates[roomId] = [];
      }
      
      pendingIceCandidates[roomId].push(data);
      debugLog(`Queued ICE candidate for room ${roomId} until SDP exchange completes`);
      return;
    }
    
    // Only after answer is created, immediate forwarding is safe
    if (connectionState[roomId].answerCreated) {
      socket.to(roomId).emit('ice_candidate', data);
      debugLog(`ICE candidate relayed immediately to room ${roomId}`);
    } else {
      // Store for later if answer not yet created
      if (!pendingIceCandidates[roomId]) {
        pendingIceCandidates[roomId] = [];
      }
      
      pendingIceCandidates[roomId].push(data);
      debugLog(`Queued ICE candidate for room ${roomId} - answer not yet created`);
    }
  });
  
  // Handle explicit WebRTC readiness signal
  socket.on('webrtc_ready', ({ roomId, userId, isInitiator }) => {
    if (!roomId || !chatRooms[roomId]) {
      debugLog(`WebRTC ready signal failed - room ${roomId} not found`);
      return;
    }
    
    debugLog(`User ${userId} signaled WebRTC ready in room ${roomId}, isInitiator: ${isInitiator}`);
    
    // Reset connection state for this room
    connectionState[roomId] = {
      offerCreated: false,
      answerCreated: false,
      lastSdpType: null,
      lastSdpTime: null
    };
    
    // Notify peer that this client is ready
    socket.to(roomId).emit('peer_webrtc_ready', {
      roomId,
      userId,
      isInitiator: !isInitiator  // Pass opposing initiator status to peer
    });
  });
  
  // Handle WebRTC failure notification
  socket.on('webrtc_failed', ({ roomId, userId }) => {
    if (!roomId || !chatRooms[roomId]) {
      debugLog(`WebRTC failure notification failed - room ${roomId} not found`);
      return;
    }
    
    debugLog(`User ${userId} reported WebRTC failure in room ${roomId}`);
    
    // Reset connection state
    delete connectionState[roomId];
    delete pendingIceCandidates[roomId];
    
    // Notify room about failure
    socket.to(roomId).emit('peer_webrtc_failed', { roomId, userId });
    
    // Send restart instruction to all clients in the room
    io.to(roomId).emit('webrtc_restart', {
      roomId,
      initiator: userId // Designate this user as the initiator for restart
    });
  });
  
  // Clean up on disconnect
  socket.on('disconnect', () => {
    // Clean up any rooms this socket was in
    for (const roomId in connectionState) {
      if (socket.rooms && socket.rooms.has(roomId)) {
        debugLog(`Cleaning up WebRTC state for room ${roomId} on disconnect`);
        delete connectionState[roomId];
        delete pendingIceCandidates[roomId];
      }
    }
  });
}

/**
 * Release queued ICE candidates after SDP exchange is complete
 */
function releasePendingCandidates(io, roomId, excludeUserId, debugLog) {
  if (!pendingIceCandidates[roomId] || pendingIceCandidates[roomId].length === 0) {
    return;
  }
  
  debugLog(`Releasing ${pendingIceCandidates[roomId].length} pending ICE candidates for room ${roomId}`);
  
  // Send each pending candidate to room, excluding any from the sender
  pendingIceCandidates[roomId].forEach(data => {
    if (data.userId !== excludeUserId) {
      io.to(roomId).emit('ice_candidate', data);
    }
  });
  
  // Clear pending candidates
  delete pendingIceCandidates[roomId];
}

module.exports = {
  registerWebRTCHandlers,
  pendingIceCandidates,
  connectionState
};