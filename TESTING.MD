# Testing Scenarios

## Testing WebSocket Rejoin Functionality with Multiple Instances

This scenario tests the ability for users to rejoin their previous room when reconnecting to a different server instance.

### Prerequisites
- Redis server running locally
- `wscat` installed globally (`npm install -g wscat`)
- Multiple terminal windows

### Test Steps

1. **Start Redis** (if not already running):
   ```bash
   brew services start redis
   ```

2. **Start first server instance** (Terminal 1):
   ```bash
   PORT=3000 npm start
   ```

3. **Start second server instance** (Terminal 2):
   ```bash
   PORT=3001 npm start
   ```

4. **Connect to first instance and join room** (Terminal 3):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send initial message:
   ```json
   { "type": "init", "user": "alice", "room": "lobby" }
   ```
   
   Expected log in Terminal 1:
   ```
   alice joined lobby
   ```

5. **Disconnect from first instance**:
   - Press `Ctrl+C` in Terminal 3 to close wscat connection

6. **Connect to second instance without room** (Terminal 3):
   ```bash
   wscat -c ws://localhost:3001
   ```
   
   Send rejoin message:
   ```json
   { "type": "init", "user": "alice" }
   ```
   
   Expected log in Terminal 2:
   ```
   alice rejoined lobby
   ```

### Expected Behavior
- First instance should log: `alice joined lobby`
- Second instance should log: `alice rejoined lobby`
- Redis should maintain the user-room mapping across instances
- User should be able to rejoin their previous room on any server instance

## Testing Message Broadcasting Within a Room

This scenario tests that messages sent by one user are broadcast to all other users in the same room.

### Test Steps

1. **Start server instance**:
   ```bash
   PORT=3000 npm start
   ```

2. **Connect first user** (Terminal 1):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "alice", "room": "lobby" }
   ```

3. **Connect second user** (Terminal 2):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "bob", "room": "lobby" }
   ```

4. **Send message from first user** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Hello everyone!" }
   ```

5. **Send message from second user** (Terminal 2):
   ```json
   { "type": "message", "room": "lobby", "user": "bob", "text": "Hi Alice!" }
   ```

### Expected Behavior
- Both users should receive each other's messages
- Messages should be broadcast to all users in the same room
- Server should log message broadcasting activity

---

## Testing Cross-Instance Message Broadcasting

This scenario tests that messages are broadcast across different server instances using Redis.

### Test Steps

1. **Start first server instance** (Terminal 1):
   ```bash
   PORT=3000 npm start
   ```

2. **Start second server instance** (Terminal 2):
   ```bash
   PORT=3001 npm start
   ```

3. **Connect user to first instance** (Terminal 3):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "alice", "room": "lobby" }
   ```

4. **Connect user to second instance** (Terminal 4):
   ```bash
   wscat -c ws://localhost:3001
   ```
   
   Send:
   ```json
   { "type": "init", "user": "bob", "room": "lobby" }
   ```

5. **Send message from first instance** (Terminal 3):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Hello from instance 1!" }
   ```

6. **Send message from second instance** (Terminal 4):
   ```json
   { "type": "message", "room": "lobby", "user": "bob", "text": "Hello from instance 2!" }
   ```

### Expected Behavior
- Messages should be broadcast across instances
- Users on different instances should receive each other's messages
- Redis should facilitate cross-instance message delivery

---

## Testing Room Isolation

This scenario tests that messages are only broadcast to users in the same room, not to users in different rooms.

### Test Steps

1. **Start server instance**:
   ```bash
   PORT=3000 npm start
   ```

2. **Connect first user to lobby** (Terminal 1):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "alice", "room": "lobby" }
   ```

3. **Connect second user to lobby** (Terminal 2):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "bob", "room": "lobby" }
   ```

4. **Connect third user to different room** (Terminal 3):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "charlie", "room": "gameroom" }
   ```

5. **Send message from lobby** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Lobby message!" }
   ```

6. **Send message from gameroom** (Terminal 3):
   ```json
   { "type": "message", "room": "gameroom", "user": "charlie", "text": "Gameroom message!" }
   ```

### Expected Behavior
- Alice and Bob should receive the lobby message
- Charlie should NOT receive the lobby message
- Alice and Bob should NOT receive the gameroom message
- Charlie should receive the gameroom message
- Messages should be isolated to their respective rooms

---

## Testing Late Joiner Broadcasting

This scenario tests that users who join a room after messages have been sent can still participate in ongoing conversations.

### Test Steps

1. **Start server instance**:
   ```bash
   PORT=3000 npm start
   ```

2. **Connect first user** (Terminal 1):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "alice", "room": "lobby" }
   ```

3. **Send initial messages** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "First message" }
   ```

4. **Connect second user later** (Terminal 2):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "bob", "room": "lobby" }
   ```

5. **Send message from first user** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Welcome Bob!" }
   ```

6. **Send message from second user** (Terminal 2):
   ```json
   { "type": "message", "room": "lobby", "user": "bob", "text": "Thanks Alice!" }
   ```

### Expected Behavior
- Bob should receive messages sent after he joins
- Both users should be able to exchange messages normally
- Late joiners should integrate seamlessly into ongoing conversations

---

## Testing Broadcasting After Reconnection

This scenario tests that users can continue receiving and sending broadcasts after reconnecting.

### Test Steps

1. **Start server instance**:
   ```bash
   PORT=3000 npm start
   ```

2. **Connect first user** (Terminal 1):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "alice", "room": "lobby" }
   ```

3. **Connect second user** (Terminal 2):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "bob", "room": "lobby" }
   ```

4. **Send message from first user** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Hello Bob!" }
   ```

5. **Disconnect second user** (Terminal 2):
   - Press `Ctrl+C` to close connection

6. **Send message from first user** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Bob are you there?" }
   ```

7. **Reconnect second user** (Terminal 2):
   ```bash
   wscat -c ws://localhost:3000
   ```
   
   Send:
   ```json
   { "type": "init", "user": "bob" }
   ```

8. **Send message from first user** (Terminal 1):
   ```json
   { "type": "message", "room": "lobby", "user": "alice", "text": "Welcome back!" }
   ```

9. **Send message from second user** (Terminal 2):
   ```json
   { "type": "message", "room": "lobby", "user": "bob", "text": "I'm back!" }
   ```

### Expected Behavior
- Bob should rejoin the lobby room automatically
- Both users should be able to exchange messages after reconnection
- Broadcasting should work normally after reconnection
