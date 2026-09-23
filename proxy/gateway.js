const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

const PORT = Number(process.env.PORT || 8000);
const routes = {
  '/chat': 8081,
  '/ecommerce': 8082,
  '/trading': 8083,
  '/bidding': 8084,
};

function routeFor(url) {
  return Object.entries(routes).find(([prefix]) => url === prefix || url.startsWith(`${prefix}/`));
}

function targetPath(url, prefix) {
  const suffix = url.slice(prefix.length);
  return suffix || '/';
}

const server = http.createServer((req, res) => {
  const route = routeFor(req.url);
  if (!route) {
    if (req.url !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    fs.readFile(path.join(__dirname, 'public', 'index.html'), (error, content) => {
      if (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Test console unavailable');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(content);
    });
    return;
  }

  const [prefix, port] = route;
  const proxyRequest = http.request({
    hostname: 'localhost',
    port,
    method: req.method,
    path: targetPath(req.url, prefix),
    headers: { ...req.headers, host: `localhost:${port}` },
  }, (upstream) => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res);
  });

  proxyRequest.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Upstream service unavailable');
  });
  req.pipe(proxyRequest);
});

const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const route = routeFor(req.url);
  if (!route) {
    socket.destroy();
    return;
  }

  const [prefix, port] = route;
  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(`ws://localhost:${port}`, {
      headers: { 'x-forwarded-path': targetPath(req.url, prefix) },
    });
    const pending = [];

    client.on('message', (message) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(message);
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        pending.push(message);
      }
    });
    client.on('close', () => upstream.close());
    upstream.on('open', () => {
      pending.splice(0).forEach((message) => upstream.send(message));
    });
    upstream.on('message', (message) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
    upstream.on('close', () => client.close());
    upstream.on('error', () => client.close());
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket application proxy listening on http://localhost:${PORT}`);
  Object.keys(routes).forEach((prefix) => console.log(`  ${prefix} -> localhost:${routes[prefix]}`));
});
