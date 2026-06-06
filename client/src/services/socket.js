import { io } from 'socket.io-client';

import env from '../../env.js';

// Use the dynamically generated base URL from env.js
const getSocketUrl = () => {
  // Use the pre-constructed base URL which includes protocol, dynamic host, and port
  const socketUrl = env.SERVER_BASE_URL;

  console.log(`Connecting to socket server at:`, socketUrl);
  return socketUrl;
};
const SOCKET_URL = getSocketUrl();
export { SOCKET_URL }; // Assuming you export this elsewhere

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
    this.connectionAttempts = 0;
    this.wakeLock = null;
    this.visibilityChangeHandled = false;
    this._keepAliveInterval = null;
    
    // New sync callback for triggering sync
    this.onSyncNeededCallback = null;
    
    // Disconnect timeout for auto sign-out
    this._disconnectTimeout = null;
    this._disconnectGracePeriod = 30000; // 30 seconds default
    this.onDisconnectTimeoutCallback = null;
  }

  // Register the sync callback
  registerSyncNeededCallback(callback) {
    console.log("Registering sync needed callback");
    this.onSyncNeededCallback = callback;
  }

  // Register disconnect timeout callback (for auto sign-out)
  registerDisconnectTimeoutCallback(callback, gracePeriodMs = 30000) {
    console.log(`Registering disconnect timeout callback with ${gracePeriodMs}ms grace period`);
    this.onDisconnectTimeoutCallback = callback;
    this._disconnectGracePeriod = gracePeriodMs;
  }

  // Clear disconnect timeout callback
  clearDisconnectTimeoutCallback() {
    this.onDisconnectTimeoutCallback = null;
    this._clearDisconnectTimeout();
  }

  // Start the disconnect timeout
  _startDisconnectTimeout() {
    this._clearDisconnectTimeout();
    
    if (this.onDisconnectTimeoutCallback && this._disconnectGracePeriod > 0) {
      console.log(`Socket: Starting disconnect grace period (${this._disconnectGracePeriod / 1000}s)`);
      this._disconnectTimeout = setTimeout(() => {
        console.log('Socket: Disconnect grace period expired - triggering sign out');
        if (this.onDisconnectTimeoutCallback) {
          this.onDisconnectTimeoutCallback();
        }
      }, this._disconnectGracePeriod);
    }
  }

  // Clear the disconnect timeout
  _clearDisconnectTimeout() {
    if (this._disconnectTimeout) {
      console.log('Socket: Clearing disconnect timeout (reconnected)');
      clearTimeout(this._disconnectTimeout);
      this._disconnectTimeout = null;
    }
  }

  // Helper to trigger the sync callback safely
  _triggerSync() {
    if (typeof this.onSyncNeededCallback === 'function') {
      console.log("Triggering sync needed callback");
      this.onSyncNeededCallback();
    } else {
      console.warn("Sync needed, but no callback is registered.");
    }
  }

  connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.socket && (this.socket.connecting || this.socket.connected)) {
      console.log('Socket already connected or connecting.');
      return this.socket;
    }
    
    // If we already have a socket but it's disconnected, just reconnect it
    if (this.socket) {
      console.log('Reconnecting existing socket...');
      this.socket.connect();
      return this.socket;
    }
    
    console.log('Creating new socket instance...');
    // Create a new socket with aggressive mobile-optimized settings
    this.socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000,
      transports: ['websocket', 'polling'], // Keep polling as fallback
      autoConnect: false, // We will call connect manually
      forceNew: false, // Avoid creating new connection if one exists for the URL
      pingInterval: 10000,
      pingTimeout: 5000
    });
    
    console.log('Socket instance created, setting up listeners...');
    
    // Log socket events for debugging
    this.socket.on('connect', () => {
      console.log('Socket connected with ID:', this.socket.id);
      this.connectionAttempts = 0;
      this._clearDisconnectTimeout(); // Cancel any pending sign-out
      this.requestWakeLock(); // Request wake lock when connected
      this.setupVisibilityHandler(); // Ensure visibility handler is set up
      
      // Trigger sync on successful connection
      console.log("Connection successful, triggering sync.");
      this._triggerSync();
      
      // Re-register persistent listeners if needed
      this._reapplyStoredListeners();
      
      // Start keep-alive ping if you are using it
      this.startKeepAlive();
    });
    
    this.socket.on('connect_error', (err) => {
      console.error(`Socket connection error (Attempt ${this.connectionAttempts + 1}):`, err.message);
      this.connectionAttempts++;
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.releaseWakeLock(); // Release wake lock on disconnect
      this.stopKeepAlive(); // Stop custom keep-alive pings
      
      // Start disconnect timeout for auto sign-out (unless it was a manual disconnect)
      if (reason !== 'io client disconnect') {
        this._startDisconnectTimeout();
      }
    });
    
    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      this._clearDisconnectTimeout(); // Cancel any pending sign-out
      
      // Trigger sync on successful reconnection
      console.log("Reconnection successful, triggering sync.");
      this._triggerSync();
      
      // Restart keep-alive ping
      this.startKeepAlive();
    });
    
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Socket reconnect attempt ${attemptNumber}...`);
    });
    
    this.socket.on('reconnect_error', (err) => {
      console.error('Socket reconnection error:', err.message);
    });
    
    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after max attempts (though set to Infinity). Check server/network.');
    });
    
    // Manually initiate the connection
    console.log('Calling socket.connect()');
    this.socket.connect();
    
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      console.log('Manual disconnect called.');
      this.socket.disconnect();
      // State is updated via the 'disconnect' event handler
    }
    this.stopKeepAlive(); // Stop custom keep-alive
    this.releaseWakeLock(); // Release wake lock
  }

  // Method to ensure event listeners are reapplied after reconnection
  _reapplyStoredListeners() {
    if (!this.socket) return;
    console.log('Re-applying stored event listeners...');
    Object.keys(this.listeners).forEach(event => {
      // First, remove any potential listeners left on the socket instance for this event
      this.socket.off(event);
      // Then, re-add each stored callback for the event
      this.listeners[event].forEach(callback => {
        console.log(`Re-applying listener for '${event}'`);
        this.socket.on(event, callback);
      });
    });
  }

  joinRoom(room) {
    if (this.socket) {
      this.socket.emit('join', room);
    }
  }

  leaveRoom(room) {
    if (this.socket) {
      this.socket.emit('leave', room);
    }
  }

  on(event, callback) {
    // Get or create the socket once
    if (!this.socket) {
      this.connect();
    }

    // Store the callback robustly
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    // Avoid adding the exact same callback multiple times
    if (!this.listeners[event].includes(callback)) {
      this.listeners[event].push(callback);
      
      // Add the event listener to the current socket instance
      if (this.socket) {
        // console.log(`Adding socket listener for '${event}'`); // Comment out to reduce noise
        this.socket.on(event, callback);
      } else {
        console.warn(`Socket not initialized when adding listener for '${event}'. It will be applied on connect.`);
      }
    }

    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    if (callback) {
      // console.log(`Removing specific socket listener for '${event}'`); // Can be noisy
      this.socket.off(event, callback);
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        if (this.listeners[event].length === 0) {
          delete this.listeners[event];
        }
      }
    } else {
      console.log(`Removing all socket listeners for '${event}'`);
      this.socket.off(event);
      delete this.listeners[event];
    }
  }

  emit(event, data) {
    if (!this.socket || !this.socket.connected) {
      console.warn(`Attempting to emit '${event}' while socket is not connected. Trying to connect...`);
      this.connect();

      if (!this.socket || !this.socket.connected) {
        console.error(`Cannot emit '${event}' immediately, socket still not connected.`);
        return; // Prevent emitting on a non-existent/disconnected socket
      }
    }
    this.socket.emit(event, data);
  }
  
  // Request a wake lock to prevent the device from sleeping
  async requestWakeLock() {
    // For web browsers that support the Wake Lock API
    if ('wakeLock' in navigator) {
      try {
        // Release any existing wake lock
        if (this.wakeLock) {
          await this.wakeLock.release();
          this.wakeLock = null;
        }
        
        // Request a new wake lock
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock is active');
        
        // Add a listener to reacquire the wake lock if it's released
        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock was released');
          // Try to reacquire the wake lock
          setTimeout(() => this.requestWakeLock(), 1000);
        });
      } catch (err) {
        console.error('Wake Lock error:', err.message);
      }
    } else {
      console.warn('Wake Lock API not supported in this browser');
    }
  }
  
  // Release the wake lock
  async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        console.log('Wake Lock released');
      } catch (err) {
        console.error('Error releasing Wake Lock:', err.message);
      }
    }
  }
  
  // Setup visibility handler
  setupVisibilityHandler() {
    if (this.visibilityChangeHandled) return;
    console.log("Setting up visibility change handler");

    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    this.visibilityChangeHandled = true;
  }

  // Extracted visibility logic to a bound method
  _handleVisibilityChange = () => { // Use arrow function for correct 'this'
    if (document.visibilityState === 'visible') {
      console.log('Page is now visible.');
      this.requestWakeLock(); // Re-acquire wake lock if needed/possible

      // Check socket status - Only attempt to connect if NOT already connected
      if (!this.socket || !this.socket.connected) {
        console.log('Socket is not connected. Attempting to connect/reconnect...');
        // Explicitly try to connect. This will trigger 'connect' or 'reconnect'
        // which will then call _triggerSync() upon success via the 'connect'/'reconnect' handlers.
        this.connect();
      } else {
         console.log('Socket is already connected. No proactive sync needed on visibility change.');
      }
    } else {
      console.log('Page is now hidden.');
      // We are keeping the connection alive intentionally.
    }
  };
  
  // Keep the connection alive by sending periodic pings
  startKeepAlive() {
    console.log("Starting custom keep-alive pings.");
    this.stopKeepAlive(); // Clear any existing interval first
    this._keepAliveInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        // console.log('Keep-alive: Sending ping'); // Can be noisy
        this.socket.emit('keep_alive', { timestamp: Date.now() });
      } else {
        // If disconnected, the main reconnect logic should handle it.
        console.log('Keep-alive: Socket not connected, skipping ping.');
      }
    }, 15000); // Every 15 seconds
  }
  
  // Stop the keep-alive pings
  stopKeepAlive() {
    if (this._keepAliveInterval) {
      console.log("Stopping custom keep-alive pings.");
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
  }

  // Cleanup method (important for frameworks like React)
  cleanup() {
    console.log("Cleaning up SocketService...");
    
    // Just remove the event listener without disconnecting
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    this.visibilityChangeHandled = false;
    
    // DON'T disconnect the socket
    // DON'T clear listeners cache to preserve them across UI remounts
    
    // Store the sync callback temporarily for later restoration
    if (this.onSyncNeededCallback) {
      this._previousSyncCallback = this.onSyncNeededCallback;
      // Only log if there's actually a callback to save
      console.log("Saved sync callback for later restoration");
    }
    
    // Don't null out the callback - we may need it during reconnections
    // this.onSyncNeededCallback = null;
    
    // Return a restore function to provide continuity across renders
    return () => {
      if (this._previousSyncCallback) {
        console.log("Restoring previous sync callback");
        this.onSyncNeededCallback = this._previousSyncCallback;
        this._previousSyncCallback = null;
      }
    };
  }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;
