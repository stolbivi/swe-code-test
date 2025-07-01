# WebSocket Chat Code Test

## 1. Goal
Build a multi-instance chat system. When you run multiple server instances, they should work together as one unified chat platform.

## 2. Testing Criteria
Testing will be conducted in the following steps:

```bash
# 1. Install dependencies
npm install

# 2. Start two Node.js instances (in separate terminals)
PORT=3000 node server.js
PORT=3001 node server.js

# 3. Connect two clients (e.g. with wscat)
wscat -c ws://localhost:3000
wscat -c ws://localhost:3001

# 4. Join a room & send a message
> { "type":"join",    "room":"lobby", "user":"alice" }
> { "type":"message", "room":"lobby", "user":"alice", "text":"hello!" }
# "hello!" should appear in both clients.

# 5. Test health endpoint
curl -i http://localhost:3000/health   # should return HTTP/1.1 200 OK when healthy
```

## 3. Implementation Requirements

You need to implement exactly **5 methods**:

1. **`healthCheck()`** - Handle health endpoint requests
2. **`markAlive()`** - Mark WebSocket connections as alive (heartbeat)
3. **`handleMessage()`** - Process incoming WebSocket messages
4. **`cleanup()`** - Clean up resources when connections close
5. **`broadcast()`** - Broadcast messages across all server instances

## 4. Success Criteria

Your solution will be evaluated on:

| Aspect | Requirements |
|--------|-------------|
| **Functionality** | Cross-instance messaging works correctly in all scenarios |
| **Reliability** | Proper handling of disconnections, errors, and edge cases |
| **Performance** | Efficient resource usage, no memory leaks |
| **Code Quality** | Clean, maintainable code with proper error handling |
| **Architecture** | Well-designed solution demonstrating systems thinking |
| **Scalability** | High availability with horizontal scaling support and load distribution |

## 5. Notes
- Focus on making the distributed system work correctly
- You are allowed to use any third-party databases, caching systems, or tools to optimize performance and scalability
- Document your approach and any trade-offs