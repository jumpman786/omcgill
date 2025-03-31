import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { getSocketUrl, SOCKET_OPTIONS, WEBRTC_CONFIG, debugLog } from '../utils/api';
import './Chat.css';

const Chat = () => {
  const navigate = useNavigate();
  
  // Consolidated state variables
  const [user, setUser] = useState({
    id: '',
    nickname: '',
  });
  
  const [chat, setChat] = useState({
    roomId: null,
    messages: [],
    message: '',
    typing: false,
    activeUsers: [],
    waiting: false,
    connectedPartner: null,
    chatType: 'text',
    receiverId: ''
  });
  
  const [media, setMedia] = useState({
    isVideoEnabled: true,
    isAudioEnabled: true,
    isConnecting: false,
    error: null,
    localVideoLoaded: false,
    remoteVideoLoaded: false,
  });
  
  const [connection, setConnection] = useState({
    socketStatus: 'connecting',
    isMobileDevice: /android|iPad|iPhone|iPod|webOS/i.test(navigator.userAgent),
    isWebRTCSupported: !!(navigator.mediaDevices && 
                          navigator.mediaDevices.getUserMedia && 
                          window.RTCPeerConnection)
  });

  // Add filters state
  const [filters, setFilters] = useState({
    faculty: 'Any',
    yearOfStudy: 'Any'
  });

  // Refs
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const connectionTimeout = useRef(null);
  const isInitiator = useRef(false);
  const currentRoomIdRef = useRef(null);
  const offerSent = useRef(false);
  const messageQueue = useRef([]);
  const reconnectionAttempts = useRef(0);
  const lastKnownRoomId = useRef(null);

  // Check authentication on page load
  useEffect(() => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    
    if (!token) {
      navigate('/');
      return;
    }
    
    try {
      const decoded = jwtDecode(token);
      setUser(prev => ({ ...prev, id: decoded.email }));
    } catch (error) {
      console.error('Invalid token:', error);
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      navigate('/');
    }
  }, [navigate]);

  // Initialize socket connection with improved handling
  useEffect(() => {
    if (!user.id) return;
    
    // Clean up any existing connection
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    const socketURL = getSocketUrl();
    debugLog(`Connecting to socket server at: ${socketURL}`);
    
    try {
      // Initialize socket with improved configuration from api.js
      socketRef.current = io(socketURL, SOCKET_OPTIONS);
      
      // Connection event handlers
      socketRef.current.on('connect', () => {
        debugLog(`Socket connected successfully with ID: ${socketRef.current.id}`);
        setConnection(prev => ({ ...prev, socketStatus: 'connected' }));
        socketRef.current.emit('join', user.id);
        socketRef.current.emit('requestActiveUsers');
        if (chat.roomId) {
          lastKnownRoomId.current = chat.roomId;
        }
        if (chat.waiting) {
          debugLog(`Re-registering for ${chat.chatType} chat after reconnection`);
          setTimeout(() => {
            findPartner(chat.chatType);
          }, 1000);
        }
      });
      socketRef.current.on('connect_error', (error) => {
        console.error("Socket connection error:", error);
        debugLog(`Connection error details: ${error.message}`);
        setConnection(prev => ({ ...prev, socketStatus: 'error' }));
      });
      
      socketRef.current.io.on('reconnect_attempt', (attempt) => {
        debugLog(`Reconnection attempt #${attempt}`);
      });
      
      socketRef.current.on('disconnect', (reason) => {
        debugLog(`Socket disconnected: ${reason}`);
        setConnection(prev => ({ ...prev, socketStatus: 'disconnected' }));
        
        if (chat.roomId) {
          resetChat();
        }
      });
    } catch (error) {
      console.error("Error initializing socket:", error);
      debugLog(`Socket initialization error: ${error.message}`);
      setConnection(prev => ({ ...prev, socketStatus: 'error' }));
    }
    
    // Clean up socket connection on unmount
    return () => {
      debugLog('Cleaning up socket connection');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user.id]);

  // Set up socket event handlers
  useEffect(() => {
    if (!user.id || !socketRef.current) return;
    
    // Store room ID in a ref to avoid race conditions with state updates
    currentRoomIdRef.current = chat.roomId;
    
    // Chat message handlers
    socketRef.current.on('receiveMessage', (data) => {
      debugLog(`Message received at ${new Date().toISOString()}:`, data);
      
      // If roomId is not included in the message, use the current room
      const messageRoomId = data.roomId || currentRoomIdRef.current;
      
      // Check if this message is for our current room
      if (messageRoomId !== currentRoomIdRef.current) {
        debugLog(`Ignoring message for room ${messageRoomId} as we're in ${currentRoomIdRef.current}`);
        return;
      }
      
      // Prevent duplicate messages by checking if we already have a message with the same content
      setChat(prev => {
        // Check if this appears to be a duplicate message
        const isDuplicate = prev.messages.some(msg => 
          msg.senderId === data.senderId && 
          msg.message === data.message && 
          Math.abs(new Date(msg.createdAt) - new Date(data.createdAt)) < 1000
        );
        
        if (isDuplicate) {
          debugLog(`Ignoring duplicate message: ${data.message.substring(0, 20)}...`);
          return prev;
        }
        
        // Create a completely new messages array with the new message
        const newMessages = [...prev.messages, data];
        debugLog(`Updated messages array, new length: ${newMessages.length}`);
        return { ...prev, messages: newMessages };
      });
    });
    
    socketRef.current.on('typing', ({ senderId }) => {
      if (senderId !== user.id) {
        setChat(prev => ({ ...prev, typing: true }));
        setTimeout(() => setChat(prev => ({ ...prev, typing: false })), 2000);
      }
    });
    
    // Active users
    socketRef.current.on('activeUsers', (users) => {
      setChat(prev => ({ ...prev, activeUsers: users.filter(u => u !== user.id) }));
    });
    
    // Partner matching
    socketRef.current.on('waiting', () => {
      setChat(prev => ({ ...prev, waiting: true }));
    });
    
    socketRef.current.on('partnerFound', async ({ partnerId, partnerNickname, roomId: newRoomId, chatType: newChatType }) => {
      debugLog(`Partner found: ${partnerId} in room ${newRoomId}`);
      
      // Reset any existing connection
      resetConnection();
      
      // Store room ID in ref for immediate access
      currentRoomIdRef.current = newRoomId;
      
      // Update chat state
      setChat({
        roomId: newRoomId,
        messages: [], // Fresh empty array
        message: '',
        typing: false,
        activeUsers: [...chat.activeUsers],
        waiting: false,
        connectedPartner: partnerNickname || partnerId,
        chatType: newChatType,
        receiverId: partnerId
      });
      
      // Explicitly join the room to ensure socket server adds us correctly
      if (socketRef.current) {
        debugLog(`Explicitly joining room: ${newRoomId}`);
        socketRef.current.emit('joinRoom', { 
          roomId: newRoomId, 
          userId: user.id 
        });
      }
      
      // For video chat, initialize WebRTC with the direct roomId from ref
      if (newChatType === 'video' && connection.isWebRTCSupported) {
        // Small delay to ensure everything is ready
        setTimeout(() => {
          debugLog(`Initializing video chat with room ID from ref: ${currentRoomIdRef.current}`);
          initializeVideoChat(partnerId, currentRoomIdRef.current);
        }, 200);
      }
    });
    
    // Handle connection confirmation explicitly
    socketRef.current.on('connectionConfirmed', ({ roomId: confirmedRoomId }) => {
      debugLog(`Connection confirmed for room: ${confirmedRoomId}`);
      
      // Only act on confirmations for our current room
      if (confirmedRoomId === currentRoomIdRef.current) {
        // Only create an offer once if we're the initiator
        if (isInitiator.current && peerConnection.current && !offerSent.current) {
          debugLog(`We are the initiator, creating offer with room ID: ${currentRoomIdRef.current}`);
          // Mark that we've sent an offer
          offerSent.current = true;
          
          // Small delay to ensure peer connection is ready
          setTimeout(() => {
            createOffer(currentRoomIdRef.current);
          }, 500);
        }
      }
    });
    
    // Handle partner disconnection
    socketRef.current.on('partnerDisconnected', () => {
      debugLog('Partner disconnected');
      resetChat();
      currentRoomIdRef.current = null;
    });
    
    // WebRTC signaling events
    socketRef.current.on('sdp', async (data) => {
      if (data.roomId === currentRoomIdRef.current) {
        debugLog(`Received SDP (${data.sdp.type}) for room: ${data.roomId}`);
        
        // Ensure peer connection exists
        if (!peerConnection.current) {
          debugLog('Creating peer connection as it does not exist yet');
          createPeerConnection(data.roomId);
        }
        
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          debugLog('Remote description set successfully');
          
          // If we received an offer and we're not the initiator, create an answer
          if (data.sdp.type === 'offer' && !isInitiator.current) {
            debugLog('Creating answer to received offer');
            
            const answer = await peerConnection.current.createAnswer();
            debugLog('Answer created, setting local description');
            await peerConnection.current.setLocalDescription(answer);
            
            // Send the answer back
            debugLog('Sending answer via signaling');
            socketRef.current.emit('relay_sdp', {
              roomId: data.roomId,
              sdp: peerConnection.current.localDescription
            });
          }
        } catch (error) {
          console.error('Failed to handle SDP:', error);
          debugLog(`SDP handling error: ${error.message}`);
          setMedia(prev => ({ ...prev, error: 'Connection error. Try refreshing the page.' }));
        }
      } else {
        debugLog(`Ignoring SDP for wrong room (expected ${currentRoomIdRef.current}, got ${data.roomId})`);
      }
    });
    
    // Handle ICE candidates
    socketRef.current.on('ice_candidate', (data) => {
      if (data.roomId === currentRoomIdRef.current && peerConnection.current) {
        debugLog(`Received ICE candidate for room: ${data.roomId}`);
        
        try {
          peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate))
            .then(() => debugLog('Added ICE candidate successfully'))
            .catch(error => {
              console.error('Failed to add ICE candidate:', error);
              debugLog(`ICE candidate error: ${error.message}`);
            });
        } catch (error) {
          console.error('Error handling ICE candidate:', error);
          debugLog(`ICE handling error: ${error.message}`);
        }
      }
    });
    
    // Handle partner media toggles
    socketRef.current.on('partnerToggleVideo', ({ enabled }) => {
      debugLog(`Partner ${enabled ? 'enabled' : 'disabled'} video`);
      // Optional: Add UI indicator showing partner's video status
    });
    
    socketRef.current.on('partnerToggleAudio', ({ enabled }) => {
      debugLog(`Partner ${enabled ? 'enabled' : 'disabled'} audio`);
      // Optional: Add UI indicator showing partner's audio status
    });
    
    // Clean up event listeners
    return () => {
      if (socketRef.current) {
        const events = [
          'receiveMessage', 'typing', 'partnerFound', 'waiting', 
          'partnerDisconnected', 'activeUsers', 'sdp', 
          'ice_candidate', 'partnerToggleVideo', 'partnerToggleAudio',
          'connectionConfirmed'
        ];
        
        events.forEach(event => socketRef.current.off(event));
      }
      currentRoomIdRef.current = null;
    };
  }, [user.id, connection.isWebRTCSupported]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  // Initialize video chat with improved synchronization and state management
  const initializeVideoChat = async (partnerId, roomId) => {
    if (!connection.isWebRTCSupported) {
      setMedia(prev => ({ 
        ...prev, 
        error: 'Video chat is not supported on this device or browser.' 
      }));
      return;
    }
    
    // Ensure we have a valid room ID
    if (!roomId) {
      debugLog('Cannot initialize video chat - missing room ID');
      return;
    }
    
    // Store the roomId locally to avoid any state issues during async operations
    const currentRoomId = roomId;
    
    setMedia(prev => ({ ...prev, isConnecting: true, error: null }));
    debugLog(`Initializing video chat for room: ${currentRoomId} with partner: ${partnerId}`);
    
    // Determine if we're the initiator (user with smaller ID creates the offer)
    const shouldInitiate = user.id < partnerId;
    isInitiator.current = shouldInitiate;
    debugLog(`This client ${shouldInitiate ? 'IS' : 'is NOT'} the initiator`);
    
    try {
      // Initialize media first
      debugLog('Requesting media access...');
      const stream = await initializeMedia();
      
      if (!stream) {
        debugLog('Failed to get media stream, aborting video chat setup');
        return;
      }
      
      debugLog('Media initialized successfully, creating peer connection');
      
      // Close any existing peer connection first
      if (peerConnection.current) {
        debugLog('Closing existing peer connection before creating a new one');
        peerConnection.current.close();
        peerConnection.current = null;
      }
      
      // Create and set up the peer connection with the stored room ID
      const pc = createPeerConnection(currentRoomId);
      
      if (!pc) {
        debugLog('Failed to create peer connection');
        return;
      }
      
      // Verify peer connection was created and stored properly
      if (!peerConnection.current) {
        debugLog('Peer connection not available after creation');
        return;
      }
      
      // Emit client ready signal to confirm we're set up for WebRTC
      if (socketRef.current && socketRef.current.connected) {
        debugLog(`Emitting client ready signal to server for room ${currentRoomId}`);
        socketRef.current.emit('clientReady', { 
          roomId: currentRoomId, 
          userId: user.id 
        });
      } else {
        debugLog('Socket not connected, cannot emit ready signal');
        return;
      }
      
      // Wait for server to acknowledge room joining
      debugLog('Waiting for server confirmation...');
      
      // If we're the initiator, we'll wait for connection confirmation before creating an offer
      // The offer creation will be triggered by the 'connectionConfirmed' event handler
      if (shouldInitiate) {
        debugLog('As initiator, waiting for connection confirmation before creating offer');
      } else {
        debugLog('Not initiator, waiting for offer from peer');
      }
      
      // Set connection timeout
      setConnectionTimeout(40000); // Longer timeout to allow for confirmation
    } catch (error) {
      console.error('Error initializing WebRTC:', error);
      debugLog(`WebRTC initialization error: ${error.message}`);
      setMedia(prev => ({ 
        ...prev, 
        error: 'Error initializing video chat. Please try again.',
        isConnecting: false 
      }));
    }
  };

  // Create and send offer with better error handling and synchronization
  const createOffer = async (roomId) => {
    // Add detailed checks with logging
    if (!peerConnection.current) {
      debugLog('Cannot create offer - peer connection not initialized');
      return;
    }
    
    if (!roomId) {
      debugLog('Cannot create offer - room ID not available');
      return;
    }
    
    if (!socketRef.current || !socketRef.current.connected) {
      debugLog('Cannot create offer - socket not connected');
      return;
    }
    
    // Make sure the peer connection is in a valid state
    if (peerConnection.current.connectionState === 'closed' || 
        peerConnection.current.connectionState === 'failed') {
      debugLog(`Cannot create offer - connection in invalid state: ${peerConnection.current.connectionState}`);
      return;
    }
    
    // Log the current state to help with debugging
    debugLog(`Current state before creating offer: 
      - Room ID: ${roomId}
      - Connection state: ${peerConnection.current.connectionState}
      - ICE connection state: ${peerConnection.current.iceConnectionState}
      - Signaling state: ${peerConnection.current.signalingState}
    `);
    
    try {
      // Store the room ID locally to ensure it doesn't change during async operations
      const currentRoomId = roomId;
      debugLog(`Creating offer for room: ${currentRoomId}`);
      
      // Create the offer with proper constraints
      const offer = await peerConnection.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      // Check if peer connection is still valid after async operation
      if (!peerConnection.current) {
        debugLog('Peer connection no longer exists after creating offer');
        return;
      }
      
      debugLog('Offer created successfully, setting local description');
      await peerConnection.current.setLocalDescription(offer);
      
      // Add a small delay to ensure everything is ready
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check if peer connection is still valid after the delay
      if (!peerConnection.current) {
        debugLog('Peer connection no longer exists after setting local description');
        return;
      }
      
      if (!peerConnection.current.localDescription) {
        debugLog('Local description not set after delay, aborting offer send');
        return;
      }
      
      debugLog(`Sending offer via socket for room: ${currentRoomId}`);
      socketRef.current.emit('relay_sdp', {
        roomId: currentRoomId,
        sdp: peerConnection.current.localDescription
      });
      
      debugLog('Offer sent successfully');
    } catch (error) {
      console.error('Failed to create or send offer:', error);
      debugLog(`Offer creation error: ${error.message}`);
      setMedia(prev => ({ 
        ...prev, 
        error: 'Failed to establish connection. Try refreshing the page.',
        isConnecting: false
      }));
    }
  };

  // Create WebRTC peer connection with enhanced monitoring and error handling
  const createPeerConnection = (roomId) => {
    try {
      // Validate room ID
      if (!roomId) {
        debugLog('Cannot create peer connection - missing room ID');
        return null;
      }
      
      debugLog(`Creating peer connection for room: ${roomId}`);
      
      // Close any existing connection
      if (peerConnection.current) {
        debugLog('Closing existing peer connection');
        peerConnection.current.close();
        peerConnection.current = null;
      }
      
      // Use WEBRTC_CONFIG from api.js instead of local configuration
      peerConnection.current = new RTCPeerConnection(WEBRTC_CONFIG);
      
      // ICE candidate handler
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          debugLog(`Generated ICE candidate: ${event.candidate.sdpMid}:${event.candidate.sdpMLineIndex}`);
          
          socketRef.current.emit('relay_ice_candidate', {
            roomId: roomId,
            candidate: event.candidate
          });
        } else if (!event.candidate) {
          debugLog('ICE candidate gathering complete');
        }
      };
      
      // ICE gathering state monitoring
      peerConnection.current.onicegatheringstatechange = () => {
        if (!peerConnection.current) return;
        debugLog(`ICE gathering state: ${peerConnection.current.iceGatheringState}`);
      };
      
      // ICE connection state monitoring
      peerConnection.current.oniceconnectionstatechange = () => {
        if (!peerConnection.current) return;
        
        const state = peerConnection.current.iceConnectionState;
        debugLog(`ICE connection state changed: ${state}`);
        
        if (state === 'connected' || state === 'completed') {
          debugLog('ICE connection established successfully');
          clearConnectionTimeout();
          setMedia(prev => ({ ...prev, isConnecting: false }));
        } else if (state === 'failed') {
          debugLog('ICE connection failed');
          setMedia(prev => ({ 
            ...prev, 
            isConnecting: false,
            error: 'Connection failed. Check your network connection or try refreshing.'
          }));
        }
      };
      
      // Connection state monitoring
      peerConnection.current.onconnectionstatechange = () => {
        if (!peerConnection.current) return;
        
        const state = peerConnection.current.connectionState;
        debugLog(`Connection state changed: ${state}`);
        
        if (state === 'connected') {
          debugLog('Peer connection established successfully');
          clearConnectionTimeout();
          setMedia(prev => ({ ...prev, isConnecting: false }));
        } else if (state === 'failed' || state === 'disconnected') {
          debugLog(`Peer connection ${state}`);
          setMedia(prev => ({ 
            ...prev, 
            isConnecting: false,
            error: `Connection ${state}. Check your network connection.`
          }));
        }
      };
      
      // Signaling state monitoring
      peerConnection.current.onsignalingstatechange = () => {
        if (!peerConnection.current) return;
        debugLog(`Signaling state: ${peerConnection.current.signalingState}`);
      };
      
      // Remote track handler with improved error handling
      peerConnection.current.ontrack = (event) => {
        debugLog(`Received remote track: ${event.track.kind}`);
        
        try {
          if (remoteVideo.current) {
            if (!remoteVideo.current.srcObject) {
              debugLog('Creating new MediaStream for remote video');
              remoteVideo.current.srcObject = new MediaStream();
            }
            
            remoteVideo.current.srcObject.addTrack(event.track);
            debugLog(`Added ${event.track.kind} track to remote stream`);
            
            if (event.track.kind === 'video') {
              // Listen for the video to start playing
              remoteVideo.current.onplaying = () => {
                debugLog('Remote video started playing');
                setMedia(prev => ({ ...prev, remoteVideoLoaded: true }));
              };
              
              // Try to play the video
              remoteVideo.current.play().catch(e => {
                debugLog(`Error playing remote video: ${e.message}`);
              });
            }
          } else {
            debugLog('Remote video element not available');
          }
        } catch (error) {
          console.error('Error handling remote track:', error);
          debugLog(`Remote track error: ${error.message}`);
        }
      };
      
      // Add local tracks to the connection if available
      if (localStream.current) {
        debugLog('Adding local tracks to peer connection');
        localStream.current.getTracks().forEach(track => {
          debugLog(`Adding ${track.kind} track to connection`);
          peerConnection.current.addTrack(track, localStream.current);
        });
      } else {
        debugLog('No local stream available when creating peer connection');
      }
      
      debugLog('Peer connection created successfully');
      return peerConnection.current;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      debugLog(`Peer connection creation error: ${error.message}`);
      setMedia(prev => ({ 
        ...prev, 
        error: 'Error setting up video chat. Please try refreshing.',
        isConnecting: false
      }));
      
      return null;
    }
  };

  // Initialize media (camera/mic)
  const initializeMedia = async () => {
    try {
      // Stop any existing media
      stopLocalMedia();
      
      // Determine if running on iOS Safari
      const isIOSSafari = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && 
                         navigator.userAgent.toLowerCase().includes('safari') &&
                         !navigator.userAgent.toLowerCase().includes('chrome');
      
      // Use simpler constraints for iOS
      const constraints = isIOSSafari ? {
        audio: true,
        video: { facingMode: 'user' } // Simple constraint for iOS Safari
      } : {
        audio: true,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      };
      
      debugLog('Requesting media with constraints:', constraints);
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      debugLog('Media access granted successfully');
      
      // Store stream and update state
      localStream.current = stream;
      
      setMedia(prev => ({ 
        ...prev,
        isVideoEnabled: true,
        isAudioEnabled: true
      }));
      
      // Display local video
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
        
        // Create a handler to detect when the video actually starts playing
        const handleVideoPlaying = () => {
          debugLog('Local video is now playing');
          setMedia(prev => ({ ...prev, localVideoLoaded: true }));
          // Remove the event listener to avoid memory leaks
          localVideo.current.removeEventListener('playing', handleVideoPlaying);
        };
        
        // Listen for the playing event
        localVideo.current.addEventListener('playing', handleVideoPlaying);
        
        // Try to play the video
        localVideo.current.play().catch(e => {
          console.error('Error playing local video:', e);
          debugLog(`Error playing local video: ${e.message}`);
        });
      }
      
      return stream;
    } catch (error) {
      console.error('Error getting user media:', error);
      debugLog(`Media access error: ${error.message}`);
      
      // Handle specific errors with user-friendly messages
      let errorMessage = 'Could not access camera/microphone';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Camera access was denied. Please allow access in your browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found on this device.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Your camera is in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'Your camera does not support the requested resolution. Try refreshing.';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Media access was aborted. Please try again.';
      }
      
      setMedia(prev => ({ ...prev, error: errorMessage }));
      
      // Try audio only as fallback
      try {
        debugLog('Trying audio-only as fallback');
        const audioStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: false 
        });
        
        localStream.current = audioStream;
        setMedia(prev => ({ 
          ...prev, 
          isVideoEnabled: false, 
          isAudioEnabled: true,
          error: 'Video not available. Using audio only.'
        }));
        
        debugLog('Audio-only fallback successful');
        return audioStream;
      } catch (audioError) {
        console.error('Audio fallback failed:', audioError);
        debugLog(`Audio fallback error: ${audioError.message}`);
        setMedia(prev => ({ ...prev, isAudioEnabled: false }));
        return null;
      }
    }
  };

  // Set connection timeout
  const setConnectionTimeout = (duration = 30000) => {
    clearConnectionTimeout();
    debugLog(`Setting connection timeout for ${duration}ms`);
    
    connectionTimeout.current = setTimeout(() => {
      setMedia(prev => ({ 
        ...prev, 
        isConnecting: false,
        error: 'Connection timed out. Try skipping or refreshing.'
      }));
      debugLog('Connection timeout reached');
    }, duration);
  };

  // Clear connection timeout
  const clearConnectionTimeout = () => {
    if (connectionTimeout.current) {
      clearTimeout(connectionTimeout.current);
      connectionTimeout.current = null;
      debugLog('Connection timeout cleared');
    }
  };

  // Stop local media
  const stopLocalMedia = () => {
    if (localStream.current) {
      debugLog('Stopping all local media tracks');
      localStream.current.getTracks().forEach(track => {
        debugLog(`Stopping ${track.kind} track`);
        track.stop();
      });
      localStream.current = null;
    }
    
    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }
    
    setMedia(prev => ({ 
      ...prev,
      localVideoLoaded: false,
      remoteVideoLoaded: false
    }));
  };

  // Reset connection
  const resetConnection = () => {
    debugLog('Resetting WebRTC connection');
    stopLocalMedia();
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
    
    clearConnectionTimeout();
    
    setMedia(prev => ({ 
      ...prev,
      isConnecting: false,
      error: null,
      localVideoLoaded: false,
      remoteVideoLoaded: false
    }));
    
    debugLog('WebRTC connection reset complete');
  };

  // Reset chat state
  const resetChat = () => {
    debugLog('Resetting chat state with completely new arrays');
    
    // Create a completely new state object to avoid any reference issues
    setChat({
      roomId: null,
      messages: [], // Create a completely new empty array
      message: '',
      typing: false,
      activeUsers: [...chat.activeUsers], // Create a new copy of activeUsers
      waiting: false,
      connectedPartner: null,
      chatType: chat.chatType, // Preserve the chat type
      receiverId: ''
    });
    offerSent.current = false;
    lastKnownRoomId.current = null;
    messageQueue.current = [];
    
    // Reset room ID ref
    currentRoomIdRef.current = null;
    
    // Reset connection
    resetConnection();
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream.current) {
      const videoTracks = localStream.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const enabled = !media.isVideoEnabled;
        videoTracks[0].enabled = enabled;
        
        setMedia(prev => ({ ...prev, isVideoEnabled: enabled }));
        
        if (socketRef.current && chat.roomId) {
          socketRef.current.emit('toggleVideo', {
            enabled: enabled,
            roomId: chat.roomId,
            senderId: user.id
          });
          
          debugLog(`Video ${enabled ? 'enabled' : 'disabled'} and notified server`);
        }
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream.current) {
      const audioTracks = localStream.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const enabled = !media.isAudioEnabled;
        audioTracks[0].enabled = enabled;
        
        setMedia(prev => ({ ...prev, isAudioEnabled: enabled }));
        
        if (socketRef.current && chat.roomId) {
          socketRef.current.emit('toggleAudio', {
            enabled: enabled,
            roomId: chat.roomId,
            senderId: user.id
          });
          
          debugLog(`Audio ${enabled ? 'enabled' : 'disabled'} and notified server`);
        }
      }
    }
  };

  // Retry media access
  const retryMediaAccess = async () => {
    debugLog('Retrying media access');
    setMedia(prev => ({ ...prev, error: null }));
    
    const stream = await initializeMedia();
    if (stream && currentRoomIdRef.current) {
      createPeerConnection(currentRoomIdRef.current);
      
      if (isInitiator.current && socketRef.current) {
        // Notify server that we're ready again
        socketRef.current.emit('clientReady', { 
          roomId: currentRoomIdRef.current, 
          userId: user.id 
        });
      }
    }
  };

  // Find a chat partner with filters
  const findPartner = async (type) => {
    if (!user.nickname || !user.nickname.trim()) {
      alert("Please enter a nickname before starting a chat.");
      return;
    }
    
    debugLog(`[CLIENT DEBUG] Finding ${type} partner with filters:`, filters);
    debugLog(`[CLIENT DEBUG] User ID: ${user.id}, Nickname: ${user.nickname.trim()}`);
    
    // Reset any existing connection
    resetConnection();
    resetChat();
    
    setChat(prev => ({ ...prev, chatType: type, waiting: true }));
    setMedia(prev => ({ ...prev, error: null }));
    
    if (socketRef.current) {
      debugLog(`[CLIENT DEBUG] Socket connected: ${socketRef.current.connected}, Socket ID: ${socketRef.current.id}`);
      
      socketRef.current.emit('setChatPreference', { userId: user.id, preference: type });
      debugLog(`[CLIENT DEBUG] Emitted setChatPreference for ${type}`);
      
      socketRef.current.emit('findPartner', { 
        userId: user.id, 
        chatType: type,
        nickname: user.nickname.trim(),
        filters: filters
      });
      
      debugLog(`[CLIENT DEBUG] Emitted findPartner request for ${type} chat with filters`, filters);
      debugLog(`[CLIENT DEBUG] Now waiting for partnerFound or waiting event...`);
    } else {
      debugLog('[CLIENT DEBUG] Socket not connected, cannot find partner');
      setChat(prev => ({ ...prev, waiting: false }));
      setMedia(prev => ({ 
        ...prev, 
        error: 'Socket connection issue. Please refresh the page.' 
      }));
    }
  };
  
  // Add heartbeat mechanism to detect and respond to disconnections
  useEffect(() => {
    if (!socketRef.current || !user.id) return;
    
    const heartbeatInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        debugLog(`[CLIENT DEBUG] Sending heartbeat, socket ID: ${socketRef.current.id}`);
        socketRef.current.emit('heartbeat', { 
          userId: user.id,
          waiting: chat.waiting,
          chatType: chat.chatType
        });
      } else if (socketRef.current) {
        debugLog(`[CLIENT DEBUG] Socket not connected during heartbeat check`);
      }
    }, 10000); // Every 10 seconds
    
    return () => clearInterval(heartbeatInterval);
  }, [socketRef.current, user.id, chat.waiting, chat.chatType]);
  
  // Add enhanced socket reconnect handling
  useEffect(() => {
    if (!socketRef.current || !user.id) return;
    
    socketRef.current.io.on('reconnect', (attemptNumber) => {
      debugLog(`[CLIENT DEBUG] Socket reconnected on attempt #${attemptNumber} with ID: ${socketRef.current.id}`);
      reconnectionAttempts.current = 0;
      
      // Reset some connection state for improved stability
      socketRef.current.sendBuffer = [];
      
      // Re-register and rejoin
      socketRef.current.emit('join', user.id);
      debugLog(`[CLIENT DEBUG] Re-registered user ${user.id} after reconnection`);
      
      // Process any queued messages
      if (messageQueue.current.length > 0) {
        debugLog(`Processing ${messageQueue.current.length} queued messages`);
        
        // Use a small delay to allow socket to fully establish
        setTimeout(() => {
          [...messageQueue.current].forEach(msg => {
            socketRef.current.emit('sendMessage', msg);
            debugLog(`Sent queued message: ${msg.message.substring(0, 20)}...`);
          });
          
          // Clear the queue
          messageQueue.current = [];
        }, 1000);
      }
      
      // If we were waiting for a partner, re-enter the queue
      if (chat.waiting) {
        debugLog(`[CLIENT DEBUG] We were waiting for a ${chat.chatType} partner, rejoining queue`);
        // Small delay to ensure server has processed the join event
        setTimeout(() => {
          findPartner(chat.chatType);
        }, 1000);
      }
      
      if (lastKnownRoomId.current) {
        debugLog(`[CLIENT DEBUG] We were in room ${lastKnownRoomId.current}, attempting to rejoin`);
        socketRef.current.emit('joinRoom', { 
          roomId: lastKnownRoomId.current, 
          userId: user.id 
        });
      } else if (chat.roomId) {
        debugLog(`[CLIENT DEBUG] We were in room ${chat.roomId}, attempting to rejoin`);
        socketRef.current.emit('joinRoom', { 
          roomId: chat.roomId, 
          userId: user.id 
        });
      }
    });
    
    // Add handler for the 'waiting' event from server
    socketRef.current.on('waiting', (data) => {
      debugLog(`[CLIENT DEBUG] Received waiting event from server:`, data);
      setChat(prev => ({ ...prev, waiting: true }));
    });
    
    // Add more detailed logging for partnerFound event
    socketRef.current.on('partnerFound', async (data) => {
      debugLog(`[CLIENT DEBUG] Received partnerFound event:`, data);
      // Rest of your existing code...
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.io.off('reconnect');
        socketRef.current.off('waiting');
      }
    };
  }, [socketRef.current, user.id, chat.waiting, chat.chatType, chat.roomId]);
  useEffect(() => {
    if (!socketRef.current || !user.id) return;
    
    const userCountInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        // Request fresh user count
        debugLog('Requesting updated active user count');
        socketRef.current.emit('requestActiveUsers');
      }
    }, 15000); // Every 15 seconds
    
    return () => clearInterval(userCountInterval);
  }, [socketRef.current, user.id]);
  // Add enhanced periodic connection check
useEffect(() => {
  if (!socketRef.current || !user.id) return;
  
  const connectionCheckInterval = setInterval(() => {
    if (chat.roomId && (!socketRef.current.connected || socketRef.current.disconnected)) {
      debugLog('Connection check: Socket appears disconnected but we have an active chat');
      
      // First try reconnecting through socket.io
      if (socketRef.current) {
        debugLog('Attempting socket reconnection...');
        socketRef.current.connect();
      }
      
      // If we have a valid room ID, try to ping it directly
      if (chat.roomId && socketRef.current && socketRef.current.connected) {
        debugLog(`Sending explicit room check for ${chat.roomId}`);
        socketRef.current.emit('checkConnection', {
          userId: user.id,
          roomId: chat.roomId
        });
      }
    }
  }, 7000); // Check every 7 seconds
  
  return () => clearInterval(connectionCheckInterval);
}, [socketRef.current, user.id, chat.roomId]);
 
  
  

  // Skip current partner
  const skipPartner = () => {
    if (!socketRef.current || !user.id) return;
    
    debugLog('Skipping current partner');
    
    if (chat.roomId) {
      socketRef.current.emit('skip', user.id);
    }
    
    // Completely reset the chat state first
    resetChat();
    
    // Wait a moment before finding a new partner to ensure state is reset
    setTimeout(() => {
      // Find a new partner with the same chat type
      findPartner(chat.chatType);
    }, 300);
  };

  // Send a message
  const sendMessage = () => {
    if (!chat.message.trim() || !chat.roomId) return;
    
    debugLog(`Sending message to room ${chat.roomId}`);
    
    const messageId = Date.now() + Math.random().toString(36).substring(2, 9);
    const messageData = {
      senderId: user.id,
      receiverId: chat.receiverId,
      message: chat.message.trim(),
      roomId: chat.roomId,
      messageId: messageId,
      createdAt: new Date()
    };
    
    // First add the message to our local state for immediate feedback
    setChat(prev => ({
      ...prev,
      message: '',
      messages: [...prev.messages, {
        ...messageData,
        pending: true
      }]
    }));
    
    // Try to send it
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('sendMessage', messageData);
    } else {
      // Queue the message for later
      messageQueue.current.push(messageData);
      debugLog(`Socket not connected. Message queued (${messageQueue.current.length} pending)`);
      
      // Try to reconnect if socket is disconnected
      if (socketRef.current && !socketRef.current.connected) {
        debugLog('Trying to reconnect socket...');
        socketRef.current.connect();
      }
    }
  };

  // Handle typing indicator
  const handleTyping = () => {
    if (!socketRef.current || !chat.roomId) return;
    
    socketRef.current.emit('typing', { 
      senderId: user.id, 
      roomId: chat.roomId 
    });
  };

  // Handle logout
  const handleLogout = () => {
    debugLog('Logging out');
    
    // Reset all connections and state
    resetConnection();
    
    if (socketRef.current) {
      if (chat.roomId) {
        socketRef.current.emit('skip', user.id);
      }
      
      // Explicitly notify server about logout
      socketRef.current.emit('logout', user.id);
      socketRef.current.disconnect();
    }
    
    // Clear chat-related localStorage items
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    
    // Redirect
    window.location.href = '/';
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>McGill Random Chat</h2>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </div>
      
      <div className="active-users">
        <h3>Active Users: {chat.activeUsers.length}</h3>
      </div>
      
      {/* Connection status */}
      <div className={`network-status ${connection.socketStatus}`}>
        <span className="status-dot"></span>
        <span className="status-text">
          {connection.socketStatus === 'connected' ? 'Connected to server' : 
           connection.socketStatus === 'disconnected' ? 'Disconnected from server' : 
           connection.socketStatus === 'error' ? 'Connection error' : 'Connecting...'}
        </span>
      </div>
      
      {/* WebRTC support warning */}
      {!connection.isWebRTCSupported && (
        <div className="webrtc-warning">
          <p>⚠️ Video chat is not supported on this device or browser.</p>
          <p>Please use Chrome or Safari for video chat functionality.</p>
        </div>
      )}
      
      {/* Connect options */}
      {!chat.connectedPartner && !chat.waiting && (
        <>
          <div className="nickname-input-container">
            <label htmlFor="nickname">Your Nickname:</label>
            <input
              id="nickname"
              type="text"
              placeholder="Enter a nickname"
              value={user.nickname || ''}
              onChange={(e) => setUser(prev => ({ ...prev, nickname: e.target.value }))}
              className="nickname-input"
            />
          </div>
          
          {/* Filter options */}
          <div className="filter-options">
            <h4>Match Preferences</h4>
            <div className="filter-row">
              <div className="filter-item">
                <label htmlFor="faculty-filter">Faculty:</label>
                <select 
                  id="faculty-filter"
                  value={filters.faculty}
                  onChange={(e) => setFilters(prev => ({ ...prev, faculty: e.target.value }))}
                >
                  <option value="Any">Any Faculty</option>
                  <option value="Arts">Arts</option>
                  <option value="Science">Science</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Management">Management</option>
                  <option value="Education">Education</option>
                  <option value="Medicine">Medicine</option>
                  <option value="Law">Law</option>
                  <option value="Music">Music</option>
                  <option value="Dentistry">Dentistry</option>
                  <option value="Agricultural & Environmental Sciences">Agricultural & Environmental Sciences</option>
                </select>
              </div>
              <div className="filter-item">
                <label htmlFor="year-filter">Year of Study:</label>
                <select 
                  id="year-filter"
                  value={filters.yearOfStudy}
                  onChange={(e) => setFilters(prev => ({ ...prev, yearOfStudy: e.target.value }))}
                >
                  <option value="Any">Any Year</option>
                  <option value="U0">U0</option>
                  <option value="U1">U1</option>
                  <option value="U2">U2</option>
                  <option value="U3">U3</option>
                  <option value="U4">U4</option>
                  <option value="Graduate">Graduate</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="connect-options">
            <button 
              onClick={() => findPartner('text')} 
              className="connect-button text-chat"
            >
              Start Text Chat
            </button>
            <button 
              onClick={() => findPartner('video')} 
              className={`connect-button video-chat ${!connection.isWebRTCSupported ? 'disabled' : ''}`}
              disabled={!connection.isWebRTCSupported}
            >
              Start Video Chat
            </button>
          </div>
        </>
      )}
      
      {/* Waiting indicator */}
      {chat.waiting && !chat.connectedPartner && (
        <div className="waiting-indicator">
          <p>Looking for a {chat.chatType} partner...</p>
          <div className="spinner"></div>
        </div>
      )}
      
      {/* Connected partner info */}
      {chat.connectedPartner && (
        <div className="partner-info">
          <p>Connected with: <span className="partner-email">{chat.connectedPartner}</span></p>
        </div>
      )}
      
      {/* Text chat interface */}
      {chat.connectedPartner && chat.chatType === 'text' && (
        <>
          <div className="messages-container">
            {chat.messages.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.senderId === user.id ? 'my-message' : 'other-message'}`}
              >
                <div className="message-content">{msg.message}</div>
                <div className="message-timestamp">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
            {chat.typing && (
              <div className="typing-indicator">Partner is typing...</div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="message-input-container">
            <input
              type="text"
              placeholder="Type a message..."
              value={chat.message}
              onChange={(e) => setChat(prev => ({ ...prev, message: e.target.value }))}
              onKeyUp={handleTyping}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              className="message-input"
            />
            <button onClick={sendMessage} className="send-button">Send</button>
            <button onClick={skipPartner} className="skip-button">Skip</button>
          </div>
        </>
      )}
      
      {/* Video chat interface */}
      {chat.connectedPartner && chat.chatType === 'video' && (
        <div className="video-chat-layout">
          <div className="video-container">
            <div className="video-grid">
              {/* Remote video */}
              <div className={`video-wrapper remote-video ${media.isConnecting ? 'connecting' : ''} ${media.remoteVideoLoaded ? 'video-loaded' : ''}`}>
                <video 
                  ref={remoteVideo} 
                  autoPlay 
                  playsInline
                ></video>
                {media.isConnecting && (
                  <div className="connecting-overlay">Connecting...</div>
                )}
              </div>
              
              {/* Local video */}
              <div className={`video-wrapper local-video ${media.localVideoLoaded ? 'video-loaded' : ''}`}>
                <video 
                  ref={localVideo} 
                  autoPlay 
                  muted 
                  playsInline
                ></video>
                {!media.isVideoEnabled && (
                  <div className="video-disabled-overlay">Camera Off</div>
                )}
              </div>
            </div>
            
            {/* Media error */}
            {media.error && (
              <div className="media-error-container">
                <p className="media-error-message">{media.error}</p>
                <button onClick={retryMediaAccess} className="retry-button">
                  Retry Camera/Mic
                </button>
              </div>
            )}
            
            {/* Video controls */}
            <div className="video-controls">
              <button 
                onClick={toggleVideo} 
                className={`control-button ${!media.isVideoEnabled ? 'disabled' : ''}`}
              >
                {media.isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
              </button>
              
              <button 
                onClick={toggleAudio} 
                className={`control-button ${!media.isAudioEnabled ? 'disabled' : ''}`}
              >
                {media.isAudioEnabled ? 'Mute' : 'Unmute'}
              </button>
              
              <button onClick={skipPartner} className="end-call-button">
                Skip
              </button>
            </div>
          </div>
          
          {/* Chat sidebar */}
          <div className="video-chat-side">
            <div className="messages-container">
              {chat.messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`message ${msg.senderId === user.id ? 'my-message' : 'other-message'}`}
                >
                  <div className="message-content">{msg.message}</div>
                  <div className="message-timestamp">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {chat.typing && (
                <div className="typing-indicator">Partner is typing...</div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="message-input-container">
              <input
                type="text"
                placeholder="Type a message..."
                value={chat.message}
                onChange={(e) => setChat(prev => ({ ...prev, message: e.target.value }))}
                onKeyUp={handleTyping}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className="message-input"
              />
              <button onClick={sendMessage} className="send-button">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;