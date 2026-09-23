const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

const port = Number(process.env.PORT || 8081);
const serviceName = process.env.SERVICE_NAME || 'Realtime Service';
const clientFile = process.env.CLIENT_FILE;
const eventLabel = process.env.EVENT_LABEL || 'update';
const allowedEventTypes = process.env.EVENT_TYPES ? process.env.EVENT_TYPES.split(',') : null;
const state = {
  service: serviceName,
  lastEvent: null,
  events: [],
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function createEvent(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'Event must be a JSON object' };
  }
  if (allowedEventTypes && !allowedEventTypes.includes(input.type)) {
    return { error: `Event type must be one of: ${allowedEventTypes.join(', ')}` };
  }
  return { event: { ...input, receivedAt: new Date().toISOString() } };
}

function publishEvent(event) {
  state.lastEvent = event;
  state.events = [event, ...state.events].slice(0, 25);
  broadcast({ type: eventLabel, service: serviceName, event });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, service: serviceName, port });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/state') {
    sendJson(res, 200, state);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/events') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let event;
      try {
        event = JSON.parse(body || '{}');
      } catch {
        sendJson(res, 400, { error: 'Request body must be valid JSON' });
        return;
      }

      const result = createEvent(event);
      if (result.error) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      publishEvent(result.event);
      sendJson(res, 202, { accepted: true, event: result.event });
    });
    return;
  }

  if (req.method !== 'GET' || !clientFile) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  fs.readFile(path.join(__dirname, clientFile), (error, content) => {
    if (error) {
      sendJson(res, 500, { error: 'Client file is unavailable' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(content);
  });
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', service: serviceName, state }));

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === 'help') {
      ws.send(JSON.stringify({
        type: 'help',
        text: `This is the ${serviceName}. Send POST /api/events to publish updates or use the browser form.`,
      }));
      return;
    }

    if (message.type === 'event' && message.event) {
      const result = createEvent(message.event);
      if (result.error) {
        ws.send(JSON.stringify({ type: 'error', text: result.error }));
        return;
      }
      publishEvent(result.event);
    }
  });
});

server.listen(port, () => {
  console.log(`${serviceName} listening on http://localhost:${port}`);
  console.log(`${serviceName} WebSocket listening on ws://localhost:${port}`);
});
