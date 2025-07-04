# WebSocket Chat Code Test

## 1. Goal
Build a multi-instance chat system. When you run multiple server instances, they should work together as one unified chat platform.

## 2. Testing Criteria
Testing will be conducted in the following steps:

```bash
# 1. Install dependencies
npm install

# 2. Start Redis server (Docker)
npm run docker:redis

# 3. Start two Node.js instances (in separate terminals)
PORT=3000 node server.js
PORT=3001 node server.js

# 4. Connect two clients (e.g. with wscat)
wscat -c ws://localhost:3000
wscat -c ws://localhost:3001

# 5. Join a room & send a message
> { "type":"init",    "room":"lobby", "user":"alice" }
> { "type":"message", "room":"lobby", "user":"alice", "text":"hello!" }
# "hello!" should appear in both clients.

# 6. Test health endpoint
curl -i http://localhost:3000/health   # should return HTTP/1.1 200 OK when healthy
```

## 3. Redis Server Setup (Docker)

This application uses Redis for real-time room management and cross-instance messaging. Redis runs in a Docker container for easy setup and isolation.

### Prerequisites
- Docker and Docker Compose installed on your system
- No need to install Redis locally anymore!

### Quick Start
```bash
# Start Redis in Docker (daemon mode)
npm run docker:redis

# Or start Redis with management tools
npm run docker:redis-tools

# Check Redis status
npm run redis:check
# Should return: PONG

# View Redis logs
npm run docker:logs

# Stop Redis
npm run docker:down
```

### Configuration
The server connects to Redis using environment variables (see `.env` file):
- `REDIS_HOST` (default: `127.0.0.1`)
- `REDIS_PORT` (default: `6379`)

### Optional: Redis Management UI
If you started with `npm run docker:redis-tools`, you can access Redis Commander at:
- URL: http://localhost:8081
- This provides a web interface to view and manage Redis data

### Docker Commands
```bash
# Start only Redis
docker-compose up redis -d

# Start Redis + management tools
docker-compose --profile tools up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs redis

# Access Redis CLI
docker-compose exec redis redis-cli

# Monitor Redis commands
docker-compose exec redis redis-cli monitor
```

## 4. Implementation Requirements

You need to implement exactly **5 methods**:

1. **`healthCheck()`** - Handle health endpoint requests
2. **`markAlive()`** - Mark WebSocket connections as alive (heartbeat)
3. **`handleMessage()`** - Process incoming WebSocket messages
4. **`cleanup()`** - Clean up resources when connections close
5. **`broadcast()`** - Broadcast messages across all server instances

## 5. Success Criteria

Your solution will be evaluated on:

| Aspect | Requirements |
|--------|-------------|
| **Functionality** | Cross-instance messaging works correctly in all scenarios |
| **Reliability** | Proper handling of disconnections, errors, and edge cases |
| **Performance** | Efficient resource usage, no memory leaks |
| **Code Quality** | Clean, maintainable code with proper error handling |
| **Architecture** | Well-designed solution demonstrating systems thinking |
| **Scalability** | High availability with horizontal scaling support and load distribution |

## 6. Notes
- Focus on making the distributed system work correctly
- You are allowed to use any third-party databases, caching systems, or tools to optimize performance and scalability
- Document your approach and any trade-offs