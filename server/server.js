const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8081;
const clients = new Map();
const HELP_TEXT = 'Commands: /help shows this help, /quit or /exit disconnects. Enter a message to broadcast it to everyone.';

const server = http.createServer((req, res) => {
  if (req.url === '/help') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ service: 'WebSocket Chat Server', help: HELP_TEXT }));
    return;
  }

  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, 'public', requestPath.replace(/^\/+/, ''));

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
    };

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
});

const wss = new WebSocket.Server({ server });

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws) => {
  clients.set(ws, { username: null });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === 'join') {
      const username = String(data.username || 'Anonymous').slice(0, 32);
      clients.set(ws, { username });
      broadcast({ type: 'system', text: `${username} joined the chat` });
      ws.send(JSON.stringify({ type: 'system', text: `Welcome, ${username}!` }));
      return;
    }

    if (data.type === 'help') {
      ws.send(JSON.stringify({ type: 'system', text: HELP_TEXT }));
      return;
    }

    if (data.type === 'message') {
      const { username } = clients.get(ws) || {};
      if (!username) return;
      broadcast({
        type: 'message',
        username,
        text: String(data.text || '').slice(0, 2000),
        timestamp: Date.now(),
      });
    }
  });

  ws.on('close', () => {
    const { username } = clients.get(ws) || {};
    clients.delete(ws);
    if (username) {
      broadcast({ type: 'system', text: `${username} left the chat` });
    }
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket chat server listening on ws://localhost:${PORT}`);
  console.log(`Web UI available at http://localhost:${PORT}`);
});
