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
