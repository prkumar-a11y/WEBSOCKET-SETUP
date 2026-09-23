const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('../../server/node_modules/ws');

const port = Number(process.env.PORT || 8083);
const serviceName = 'Trading Dashboard';
const clientFile = path.join(__dirname, '../../clients/trading.html');
const symbols = {
  BTC: { price: 67250, step: 80 },
  ETH: { price: 3520, step: 12 },
};
const alerts = new Map();
const state = {
  service: serviceName,
  markets: {},
  portfolio: { cash: 100000, positions: { BTC: 0, ETH: 0 }, equity: 100000 },
  orders: [],
  alerts: [],
  events: [],
};
let orderSequence = 1000;
const orderTimers = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function createBook(symbol, mid) {
  const tick = symbol === 'BTC' ? 25 : 1;
  const bids = Array.from({ length: 10 }, (_, index) => ({ price: +(mid - tick * (index + 1)).toFixed(2), quantity: +(0.15 + index * 0.04).toFixed(4) }));
  const asks = Array.from({ length: 10 }, (_, index) => ({ price: +(mid + tick * (index + 1)).toFixed(2), quantity: +(0.12 + index * 0.03).toFixed(4) }));
  return { symbol, bids, asks, updatedAt: new Date().toISOString() };
}

function marketSnapshot() {
  return Object.fromEntries(Object.entries(symbols).map(([symbol, market]) => {
    const spread = symbol === 'BTC' ? 25 : 1;
    const book = createBook(symbol, market.price);
    return [symbol, { symbol, bid: +(market.price - spread / 2).toFixed(2), ask: +(market.price + spread / 2).toFixed(2), last: +market.price.toFixed(2), bids: book.bids, asks: book.asks, book }];
  }));
}

function updatePortfolio() {
  state.portfolio.equity = +(state.portfolio.cash + Object.entries(state.portfolio.positions).reduce((total, [symbol, quantity]) => total + quantity * symbols[symbol].price, 0)).toFixed(2);
}

function publish(type, payload) {
  const event = { type, ...payload, timestamp: new Date().toISOString() };
  state.events = [event, ...state.events].slice(0, 50);
  broadcast(event);
}

function tickMarkets() {
  for (const [symbol, market] of Object.entries(symbols)) {
    market.price = Math.max(1, market.price + (Math.random() - 0.5) * market.step);
  }
  state.markets = marketSnapshot();
  updatePortfolio();
  publish('market-update', { markets: state.markets });
  Object.entries(alerts).forEach(() => {});
  for (const [id, alert] of alerts) {
    const price = symbols[alert.symbol].price;
    const crossed = alert.direction === 'above' ? price >= alert.threshold : price <= alert.threshold;
    if (crossed && !alert.triggered) {
      alert.triggered = true;
      publish('price-alert', { alertId: id, symbol: alert.symbol, price: +price.toFixed(2), threshold: alert.threshold, direction: alert.direction });
    }
  }
}

function executeOrder(input) {
  const symbol = String(input.symbol || '').toUpperCase();
  const side = String(input.side || '').toLowerCase();
  const quantity = Number(input.quantity);
  if (!symbols[symbol] || !['buy', 'sell'].includes(side) || !Number.isFinite(quantity) || quantity <= 0) return { error: 'Order requires symbol BTC/ETH, side buy/sell, and positive quantity' };
  const order = { id: `ORD-${++orderSequence}`, symbol, side, quantity, price: +symbols[symbol].price.toFixed(2), status: 'pending', createdAt: new Date().toISOString() };
  state.orders.unshift(order);
  publish('order-status', { order });
  const fillTimer = setTimeout(() => {
    orderTimers.delete(order.id);
    if (order.status !== 'pending') return;
    const signedQuantity = side === 'buy' ? quantity : -quantity;
    const cost = order.price * quantity * (side === 'buy' ? 1 : -1);
    state.portfolio.cash = +(state.portfolio.cash - cost).toFixed(2);
    state.portfolio.positions[symbol] = +(state.portfolio.positions[symbol] + signedQuantity).toFixed(6);
    updatePortfolio();
    order.status = 'filled';
    publish('order-status', { order });
    publish('portfolio-update', { portfolio: state.portfolio, trade: order });
  }, 350);
  orderTimers.set(order.id, fillTimer);
  return { order };
}

function cancelOrder(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return { error: 'Order not found' };
  if (order.status !== 'pending') return { error: `Order is already ${order.status}` };
  clearTimeout(orderTimers.get(order.id));
  orderTimers.delete(order.id);
  order.status = 'canceled';
  publish('order-status', { order });
  return { order };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true, service: serviceName, port });
  if (req.method === 'GET' && req.url === '/api/state') return sendJson(res, 200, state);
  if (req.method === 'POST' && req.url === '/api/orders') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let input;
      try { input = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Request body must be valid JSON' }); }
      const result = executeOrder(input);
      return result.error ? sendJson(res, 400, result) : sendJson(res, 202, { accepted: true, order: result.order });
    });
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/api/orders/') && req.url.endsWith('/cancel')) {
    const orderId = req.url.slice('/api/orders/'.length, -'/cancel'.length);
    const result = cancelOrder(orderId);
    return result.error ? sendJson(res, 400, result) : sendJson(res, 200, { canceled: true, order: result.order });
  }
  if (req.method === 'GET') {
    fs.readFile(clientFile, (error, content) => error ? sendJson(res, 500, { error: 'Client unavailable' }) : (res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }), res.end(content)));
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
});

const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'trading-snapshot', markets: state.markets, portfolio: state.portfolio, orders: state.orders, alerts: [...alerts.values()] }));
  ws.on('message', raw => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'help') return ws.send(JSON.stringify({ type: 'help', text: 'Streams BTC/ETH market data every second. Commands: execute-order, set-alert, cancel-alert.' }));
    if (message.type === 'execute-order') {
      const result = executeOrder(message.order || {});
      if (result.error) ws.send(JSON.stringify({ type: 'error', text: result.error }));
    }
    if (message.type === 'cancel-order') {
      const result = cancelOrder(message.orderId);
      if (result.error) ws.send(JSON.stringify({ type: 'error', text: result.error }));
    }
    if (message.type === 'set-alert') {
      const symbol = String(message.symbol || '').toUpperCase();
      const threshold = Number(message.threshold);
      const direction = message.direction === 'below' ? 'below' : 'above';
      if (!symbols[symbol] || !Number.isFinite(threshold)) return ws.send(JSON.stringify({ type: 'error', text: 'Alert requires BTC/ETH and a numeric threshold' }));
      const id = `ALT-${Date.now()}`;
      const alert = { id, symbol, threshold, direction, triggered: false };
      alerts.set(id, alert);
      state.alerts = [...alerts.values()];
      ws.send(JSON.stringify({ type: 'alert-created', alert }));
    }
    if (message.type === 'cancel-alert' && alerts.delete(message.alertId)) {
      state.alerts = [...alerts.values()];
      ws.send(JSON.stringify({ type: 'alert-canceled', alertId: message.alertId }));
    }
  });
});

state.markets = marketSnapshot();
setInterval(tickMarkets, 1000);
server.listen(port, () => {
  console.log(`${serviceName} listening on http://localhost:${port}`);
  console.log(`${serviceName} WebSocket listening on ws://localhost:${port}`);
});
