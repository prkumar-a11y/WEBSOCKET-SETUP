const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Track connected clients with their chosen usernames
const clients = new Map();

function broadcast(payload, exclude) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== exclude) {
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
      return; // ignore malformed messages
    }

    if (data.type === 'join') {
      const username = String(data.username || 'Anonymous').slice(0, 32);
      clients.set(ws, { username });
      broadcast({ type: 'system', text: `${username} joined the chat` }, ws);
      ws.send(JSON.stringify({ type: 'system', text: `Welcome, ${username}!` }));
      return;
    }

    if (data.type === 'message') {
      const { username } = clients.get(ws) || {};
      if (!username) return; // must join first
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

console.log(`WebSocket chat server listening on ws://localhost:${PORT}`);
