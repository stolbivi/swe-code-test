const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('redis');
const { healthCheck } = require('./health');

const PORT = process.env.PORT || 3000;

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

async function handleMessage(ws, message) {
  try {
    const data = JSON.parse(message);
    
    if (data.type === 'init' && data.user && data.room) {
      const { user, room } = data;
      
      if (!isRedisConnected) {
        console.log(`Redis not connected. Cannot store room data for ${user} in ${room}`);
        return;
      }
      
      // Save user-room mapping in Redis
      await redis.hSet(`user:${user}`, 'room', room);
      
      // Add user to room set
      await redis.sAdd(`room:${room}`, user);
      
      console.log(`${user} joined ${room}`);
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

server.listen(PORT, () => console.log(`Listening on ${PORT}`));