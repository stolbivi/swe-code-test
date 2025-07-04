# WebSocket Chat System Design Doc

## Overview

This document describes the architecture, design decisions, and tradeoffs for a horizontally scaleable WebSocket chat system that enables realtime communication across multiple server instances

## Architecture

### System Components

- **Client Layer**
  - Client A (WebSocket connection)
  - Client B (WebSocket connection)  
  - Client C (WebSocket connection)

- **Server Layer**  
  - Server A (Port 3000)
  - Server B (Port 3001)
  - Server C (Port 3002)

- **Data Layer**
  - Redis Server
    - Streams (Messages)
    - Hashes (User State)
    - Sets (Room Members)
    - Consumer Groups

### Key Design Principles

1. **Horizontal Scalability**: Multiple server instances can be added without code changes
2. **Fault Tolerance**: Redis connection failures are handled gracefuly
3. **State Consistency**: All user state is stored in Redis, not in memory
4. **Message Delivery**: Redis Streams ensure message ordering and delivery guarantees

## Implementation Approach

### 1. Stateless Server Design

Each server instance maintains minimal state:
- **WebSocket connections**: Map of `WebSocket → userId`
- **Local cache**: Short-lived user-room mappings (10-second TTL)
- **Polling loops**: Active room polling status

All persistant state is stored in Redis:
- `user:{userId}`: User session data (room, metadata)
- `room:{roomId}`: Set of users in each room
- `chat:room:{roomId}`: Message stream for each room

### 2. Redis Data Structures

#### User State Management
```redis
# User session data
HSET user:alice room "lobby"
HSET user:alice last_seen "2024-01-01T10:00:00Z"

# Room membership
SADD room:lobby alice bob charlie
```

#### Message Persistence
```redis
# Message streams per room
XADD chat:room:lobby * user alice text "Hello everyone!" timestamp 1704110400000
```

#### Consumer Groups
```redis
# Each server instance joins a consumer group
XGROUP CREATE chat:room:lobby chat-consumers $ MKSTREAM
XREADGROUP GROUP chat-consumers server-3000-1704110400000 STREAMS chat:room:lobby >
```

### 3. Message Broadcasting Strategy

#### Cross-Instance Message Flow
1. **Message Arrival**: User sends message via WebSocket
2. **Storage**: Message stored in Redis Stream for the room
3. **Distribution**: Consumer group ensures each message is processed once
4. **Polling**: Each server polls for new messages in active rooms
5. **Broadcasting**: Messages broadcast to local WebSocket clients in the room

#### Polling Loop Design
- **Per-Room Polling**: Each room has one active polling loop per server (this is pretty effecient)
- **Lazy Initialization**: Polling starts when first user joins a room
- **Automatic Cleanup**: Polling stops when no local clients remain in room
- **Resilient Recovery**: Polling continues after Redis connection issues

### 4. Connection Management

#### WebSocket Lifecycle
```javascript
// Connection established
ws.on('connection') → markAlive() → isAlive = true

// Heartbeat mechanism
setInterval() → ping() → pong() → isAlive = true

// Message handling
ws.on('message') → handleMessage() → process init/message types

// Cleanup on disconnect
ws.on('close') → cleanup() → remove from Redis
```

#### User Session Management
- **Join Room**: `HSET user:{userId} room {roomId}` + `SADD room:{roomId} {userId}`
- **Rejoin Logic**: If no room specified, lookup previous room from Redis
- **Cleanup**: Remove from room set, expire user session after 1 hour

## Tradeoffs Analysis

### 1. Performance vs Consistency

#### Chosen Approach: **Eventual Consistency with Caching**

**Benefits:**
- Fast room lookups via local cache (10s TTL)
- Reduced Redis load for frequent operations
- Good performance for typical chat usage patterns

**Trade-offs:**
- Brief inconsistency window during room changes
- Memory overhead for caching
- Cache invalidation complexity

**Alternative Considered:** Strong consistency with Redis-only lookups
- Would ensure immediate consistency but increase latency and Redis load

### 2. Message Delivery Guarantees

#### Chosen Approach: **Redis Streams with Consumer Groups**

**Benefits:**
- At-least-once delivery guarantee
- Message ordering within rooms
- Automatic failover between server instances
- Message persistence for reliability

**Trade-offs:**
- Slight complexity in consumer group management
- Potential for duplicate messages during failures
- Redis memory usage for message storage

**Alternative Considered:** Redis Pub/Sub
- Simpler implementation but no delivery guarantees or persistence

### 3. Polling vs Push Notifications

#### Chosen Approach: **Polling with Consumer Groups**

**Benefits:**
- Reliable message delivery
- Works with Redis Streams
- Automatic load balancing across servers
- Resilient to network interruptions

**Trade-offs:**
- Constant polling creates Redis load
- Slight message delivery latency (100ms polling interval)
- Resource usage for polling loops

**Alternative Considered:** Redis Pub/Sub with keyspace notifications
- Lower latency but no delivery guarantees or message persistence

### 4. State Storage Strategy

#### Chosen Approach: **Redis-First with Local Caching**

**Benefits:**
- True horizontal scalability
- Automatic failover capabilities
- Persistant user sessions across reconnects
- Simplified server deployment

**Trade-offs:**
- Network dependency on Redis
- Increased latency for state operations
- Complex cache invalidation logic

**Alternative Considered:** In-memory state with Redis sync
- Faster access but complex synchronization and no automatic failover

## Scalability Considerations

### Horizontal Scaling
- **Servers**: Add instances by starting on different ports
- **Redis**: Can be scaled with Redis Cluster or Redis Sentinel
- **Load Balancing**: WebSocket connections can be load-balanced across servers

### Performance Characteristics
- **Message Throughput**: Limited by Redis Stream throughput (~100K messages/sec)
- **Concurrent Users**: Limited by WebSocket connections per server (~10K per instance)
- **Room Scalability**: Each room creates minimal overhead (one polling loop per server)

### Monitoring and Observability
- **Health Checks**: HTTP endpoint for load balancer health checks
- **Logging**: Comprehensive logging for debugging and monitoring
- **Metrics**: Redis metrics, WebSocket connection counts, message throughput

## Security Considerations

### Current Implementation
- **Input Validation**: JSON message parsing with error handling
- **Rate Limiting**: None implemented (would need external solution)
- **Authentication**: None implemented (user IDs are self-declared)

### Recommended Enhancements
- **JWT Authentication**: Validate user tokens before WebSocket upgrade
- **Rate Limiting**: Implement message rate limiting per user
- **Input Sanitization**: Sanitize message content for XSS prevention
- **Redis Security**: Use Redis AUTH and TLS for production

## Deployment Architecture

### Development Setup
```bash
# Start Redis
npm run docker:redis

# Start multiple server instances
PORT=3000 npm start
PORT=3001 npm start
```

### Production Considerations
- **Docker Containers**: Each server instance in separate container
- **Redis Cluster**: Multi-node Redis setup for high availability
- **Load Balancer**: Nginx or HAProxy for WebSocket load balancing
- **Health Checks**: Automated health monitoring and restart policies

## Future Enhancements

### Immediate Improvements
1. **Message Persistence**: Configurable message retention policies
2. **User Presence**: Track online/offline status
3. **Room Management**: Create/delete rooms dynamically
4. **Message Types**: Support for file uploads, reactions, etc.

### Advanced Features
1. **Horizontal Pod Autoscaling**: Auto-scale based on connection count
2. **Message Encryption**: End-to-end encryption for sensitive communications
3. **Analytics**: Real-time metrics and usage analytics
4. **Message Search**: Full-text search across message history

## Conclusion

This design prioritizes horizontal scalability and reliability over raw performance, making it suitable for production chat systems that need to handle varying loads and maintain high availability. The Redis-centric approach ensures consistency across instances while the caching layer provides good performance for typical usage patterns.

The tradeoffs made favor operational simplicity and reliability, which are crucial for realtime communication systems where message delivery and system availability are more important than minimizing latency by a few milliseconds.