const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('../server/node_modules/ws');

const PORT = Number(process.env.PORT || 8000);
const routes = {
  '/chat': { host: process.env.CHAT_HOST || 'localhost', port: 8081 },
  '/ecommerce': { host: process.env.ECOMMERCE_HOST || 'localhost', port: 8082 },
  '/trading': { host: process.env.TRADING_HOST || 'localhost', port: 8083 },
  '/bidding': { host: process.env.BIDDING_HOST || 'localhost', port: 8084 },
};
const helpPage = path.join(__dirname, 'public', 'help.html');

function routeFor(url) {
  return Object.entries(routes).find(([prefix]) => url === prefix || url.startsWith(`${prefix}/`));
}

function targetPath(url, prefix) {
  const suffix = url.slice(prefix.length);
  return suffix || '/';
}

const server = http.createServer((req, res) => {
  if (req.url === '/help' || req.url === '/help/') {
    fs.readFile(helpPage, (error, content) => {
      if (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Help page unavailable');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(content);
    });
    return;
  }

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

  const [prefix, target] = route;
  const proxyRequest = http.request({
    hostname: target.host,
    port: target.port,
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

  const [prefix, target] = route;
  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(`ws://${target.host}:${target.port}`, {
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
