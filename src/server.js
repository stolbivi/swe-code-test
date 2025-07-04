const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('redis');
const { healthCheck } = require('./health');

const PORT = process.env.PORT || 3000;

// Generate unique consumer ID for this server instance
const CONSUMER_ID = `server-${PORT}-${Date.now()}`;
const CONSUMER_GROUP = 'chat-consumers';

// Track connected clients - only store user ID
const clientUsers = new Map(); // Map<WebSocket, string> - ws → userId

// Track active polling loops per room
const activePollingLoops = new Set();

// Optional: Cache user-room mappings with TTL to avoid frequent Redis hits
const userRoomCache = new Map(); // Map<userId, {room: string, timestamp: number}>
const CACHE_TTL = 10000; // 10 seconds

// Redis client setup
const redis = createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379
  }
});

let isRedisConnected = false;

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
  console.log('Note: Make sure Redis is running. Start with: brew services start redis');
  isRedisConnected = false;
});

redis.on('connect', () => {
  console.log('Connected to Redis');
  isRedisConnected = true;
});

redis.on('ready', () => {
  console.log('Redis is ready');
  isRedisConnected = true;
});

// Connect to Redis
redis.connect().catch(err => {
  console.error('Failed to connect to Redis:', err.message);
  console.log('Server will continue running, but room management will be disabled');
});

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    return healthCheck(req, res);
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocket.Server({ server });

// Function to ensure consumer group exists
async function ensureConsumerGroup(streamName) {
  try {
    // Try to create the consumer group
    await redis.xGroupCreate(streamName, CONSUMER_GROUP, '$', { MKSTREAM: true });
    console.log(`Consumer group ${CONSUMER_GROUP} created for stream ${streamName}`);
  } catch (error) {
    if (error.message.includes('BUSYGROUP')) {
      console.log(`Consumer group ${CONSUMER_GROUP} already exists for stream ${streamName}`);
    } else {
      throw error;
    }
  }
}

// Function to get user's room from Redis with caching
async function getUserRoom(userId) {
  try {
    // Check cache first
    const cached = userRoomCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.room;
    }
    
    // Fetch from Redis
    const room = await redis.hGet(`user:${userId}`, 'room');
    
    // Update cache
    if (room) {
      userRoomCache.set(userId, { room, timestamp: Date.now() });
    }
    
    return room;
  } catch (error) {
    console.error(`Error getting room for user ${userId}:`, error);
    return null;
  }
}

// Function to broadcast message to all clients based on Redis room membership
async function broadcastToRoom(targetRoom, message) {
  if (!isRedisConnected) {
    console.log(`Redis not connected. Cannot broadcast to room ${targetRoom}`);
    return;
  }
  
  const messageStr = JSON.stringify(message);
  let broadcastCount = 0;
  let lookupCount = 0;
  
  // Iterate through all connected clients
  for (const [ws, userId] of clientUsers) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        lookupCount++;
        const userRoom = await getUserRoom(userId);
        
        console.log(`Room lookup for user ${userId}: ${userRoom} (target: ${targetRoom})`);
        
        if (userRoom === targetRoom) {
          ws.send(messageStr);
          broadcastCount++;
        }
      } catch (error) {
        console.error(`Error checking room for user ${userId}:`, error);
      }
    }
  }
  
  console.log(`Broadcasting message from ${message.user} to room ${targetRoom} (${broadcastCount}/${lookupCount} clients)`);
}

// Function to start polling loop for a room
async function startPollingLoop(room) {
  const streamName = `chat:room:${room}`;
  
  if (activePollingLoops.has(room)) {
    console.log(`Polling loop already active for room ${room}`);
    return;
  }
  
  activePollingLoops.add(room);
  console.log(`Starting polling loop for room ${room}`);
  
  // Ensure consumer group exists
  await ensureConsumerGroup(streamName);
  
  // Start the polling loop
  const poll = async () => {
    try {
      if (!isRedisConnected) {
        console.log(`Redis not connected. Pausing polling for room ${room}`);
        setTimeout(poll, 5000);
        return;
      }
      
      // Check if room still has active clients (check Redis instead of memory)
      const roomMembers = await redis.sMembers(`room:${room}`);
      const hasActiveClients = roomMembers.some(userId => 
        Array.from(clientUsers.values()).includes(userId)
      );
      
      if (!hasActiveClients) {
        console.log(`No active clients in room ${room}, stopping polling loop`);
        activePollingLoops.delete(room);
        return;
      }
      
      // Read messages from the stream
      const messages = await redis.xReadGroup(
        CONSUMER_GROUP,
        CONSUMER_ID,
        [{ key: streamName, id: '>' }],
        { BLOCK: 5000 }
      );
      
      if (messages && messages.length > 0) {
        for (const stream of messages) {
          for (const message of stream.messages) {
            const { id, message: fields } = message;
            const { user, text, timestamp } = fields;
            
            // Broadcast to all clients in the room (using Redis lookup)
            await broadcastToRoom(room, {
              type: 'message',
              user,
              text,
              timestamp,
              id
            });
            
            // Acknowledge the message
            await redis.xAck(streamName, CONSUMER_GROUP, id);
          }
        }
      }
      
      // Continue polling
      setTimeout(poll, 100);
    } catch (error) {
      console.error(`Error in polling loop for room ${room}:`, error);
      // Continue polling after error
      setTimeout(poll, 5000);
    }
  };
  
  poll();
}

// Function to add client to user tracking
function addClientToUser(ws, userId) {
  // Remove from previous tracking if exists
  const prevUserId = clientUsers.get(ws);
  if (prevUserId) {
    removeClientFromUser(ws, prevUserId);
  }
  
  // Add to new tracking
  clientUsers.set(ws, userId);
  
  // Invalidate cache for this user
  userRoomCache.delete(userId);
  
  console.log(`Client WebSocket associated with user ${userId}`);
}

// Function to remove client from user tracking
function removeClientFromUser(ws, userId) {
  clientUsers.delete(ws);
  
  // Invalidate cache for this user
  userRoomCache.delete(userId);
  
  console.log(`Client WebSocket disassociated from user ${userId}`);
}

async function handleMessage(ws, message) {
  try {
    const data = JSON.parse(message);
    
    if (data.type === 'init' && data.user) {
      const { user, room } = data;
      
      if (!isRedisConnected) {
        console.log(`Redis not connected. Cannot handle init for ${user}`);
        return;
      }
      
      let targetRoom = room;
      
      if (room) {
        // Save user-room mapping in Redis
        await redis.hSet(`user:${user}`, 'room', room);
        
        // Add user to room set
        await redis.sAdd(`room:${room}`, user);
        
        console.log(`${user} joined ${room}`);
      } else {
        // Lookup and rejoin previous room
        const previousRoom = await redis.hGet(`user:${user}`, 'room');
        
        if (previousRoom) {
          targetRoom = previousRoom;
          
          // Add user to room set
          await redis.sAdd(`room:${previousRoom}`, user);
          
          console.log(`${user} rejoined ${previousRoom}`);
        } else {
          console.log(`No previous room found for ${user}`);
          return;
        }
      }
      
      // Add client to user tracking (no room stored in memory)
      addClientToUser(ws, user);
      
      // Start polling loop for the room if not already active
      if (!activePollingLoops.has(targetRoom)) {
        startPollingLoop(targetRoom);
      }
      
    } else if (data.type === 'message' && data.user && data.text) {
      const { user, text } = data;
      
      if (!isRedisConnected) {
        console.log(`Redis not connected. Cannot handle message for ${user}`);
        return;
      }
      
      try {
        // Look up user's current room from Redis
        const room = await getUserRoom(user);
        
        if (room) {
          // Add message to Redis Stream
          const timestamp = Date.now().toString();
          await redis.xAdd(`chat:room:${room}`, '*', {
            user: user,
            text: text,
            timestamp: timestamp
          });
          
          console.log(`Message from ${user} stored in chat:room:${room}`);
        } else {
          console.warn(`No room found for user ${user}, skipping message`);
        }
      } catch (error) {
        console.error(`Error storing message for ${user}:`, error);
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('message', (message) => {
    handleMessage(ws, message);
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    
    // Clean up client tracking
    const userId = clientUsers.get(ws);
    if (userId) {
      removeClientFromUser(ws, userId);
    }
  });
});

// Keep-alive ping
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, cached] of userRoomCache) {
    if (now - cached.timestamp > CACHE_TTL) {
      userRoomCache.delete(userId);
    }
  }
}, 30000);

server.listen(PORT, () => console.log(`Listening on ${PORT} with consumer ID: ${CONSUMER_ID}`));