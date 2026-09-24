const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('./node_modules/ws');

const port = Number(process.env.PORT || 8081);
const users = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
const clients = new Map();
const messages = [];
let sequence = 0;
let simulatedUserIndex = 0;
let simulationStarted = false;

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function broadcast(payload) {
  const raw = JSON.stringify(payload);
  for (const client of clients.keys()) {
    if (client.readyState === WebSocket.OPEN) client.send(raw);
  }
}

function snapshot() {
  return {
    type: 'chat-snapshot',
    users,
    messages: messages.slice(-50),
    connectedUsers: [...clients.values()].filter(user => user.username).map(user => user.username),
  };
}

function deliverReceipt(messageId, status, username) {
  const message = messages.find(item => item.id === messageId);
  if (!message) return;
  message.receipts[username] = status;
  broadcast({ type: 'delivery-receipt', messageId, username, status, sequence: message.sequence });
}

function publishMessage(username, text) {
  sequence += 1;
  const message = {
    id: `MSG-${sequence}`,
    sequence,
    username,
    text,
    timestamp: new Date().toISOString(),
    receipts: {},
  };
  messages.push(message);
  broadcast({ type: 'chat-message', message });

  for (const recipient of users.filter(user => user !== username)) {
    setTimeout(() => deliverReceipt(message.id, 'delivered', recipient), 100);
    setTimeout(() => deliverReceipt(message.id, 'read', recipient), 500);
    const recipientClient = [...clients.values()].find(client => client.username === recipient);
    if (!recipientClient?.active) {
      setTimeout(() => broadcast({ type: 'idle-notification', messageId: message.id, username: recipient, text: `${recipient} has a new message from ${username}` }), 500);
    }
  }
}

function simulateConversation() {
  const username = users[simulatedUserIndex % users.length];
  simulatedUserIndex += 1;
  broadcast({ type: 'typing', username, composing: true });
  setTimeout(() => {
    broadcast({ type: 'typing', username, composing: false });
    publishMessage(username, ['Hello everyone!', 'Any updates?', 'This stream is live.', 'Great progress.', 'Thanks team!'][simulatedUserIndex % 5]);
  }, 650);
}

function startSimulation() {
  if (simulationStarted) return;
  simulationStarted = true;
  users.forEach((username, index) => {
    setTimeout(() => broadcast({ type: 'user-joined', username }), index * 180);
  });
  setInterval(simulateConversation, 3000);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true, service: 'WebSocket Chat Server', port, users });
  if (req.method === 'GET' && req.url === '/api/state') return sendJson(res, 200, snapshot());
  if (req.method === 'GET') {
    fs.readFile(path.join(__dirname, 'public/index.html'), (error, content) => error ? sendJson(res, 500, { error: 'Client unavailable' }) : (res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }), res.end(content)));
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
});

const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
  clients.set(ws, { username: null, active: true });
  startSimulation();
  ws.send(JSON.stringify(snapshot()));
  ws.on('message', raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const client = clients.get(ws);
    if (data.type === 'join') {
      client.username = String(data.username || 'BrowserUser').slice(0, 32);
      client.active = true;
      broadcast({ type: 'user-joined', username: client.username });
      return;
    }
    if (data.type === 'activity') {
      client.active = Boolean(data.active);
      return;
    }
    if (data.type === 'typing') {
      broadcast({ type: 'typing', username: client.username || 'BrowserUser', composing: Boolean(data.composing) });
      return;
    }
    if (data.type === 'message' && client.username) {
      publishMessage(client.username, String(data.text || '').slice(0, 2000));
      return;
    }
    if (data.type === 'help') ws.send(JSON.stringify({ type: 'system', text: 'Chat simulates Alice, Bob, Carol, Dave, and Eve. Users type and send messages every 3 seconds. Each message gets an increasing sequence number, delivered/read receipts, and an idle notification when this tab is inactive. Type a message and press Send to publish your own message.' }));
  });
  ws.on('close', () => clients.delete(ws));
});

server.listen(port, () => console.log(`WebSocket Chat Server listening on http://localhost:${port}`));
