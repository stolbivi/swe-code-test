const http = require('http');
const WebSocket = require('ws');
const { healthCheck } = require('./health');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    return healthCheck(req, res);
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => markAlive());
  ws.on('message', msg => handleMessage());
  ws.on('close', () => cleanup());
});

wss.on('message', (channel, message) => {
  broadcast();
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => console.log(`Listening on ${PORT}`));