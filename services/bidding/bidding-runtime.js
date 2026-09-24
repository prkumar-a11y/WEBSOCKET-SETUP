const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('../../server/node_modules/ws');

const port = Number(process.env.PORT || 8084);
const durationMs = Number(process.env.AUCTION_DURATION_MS || 120000);
const auction = {
  id: 'GOLD-NECKLACE-2026',
  title: 'Gold Necklace',
  startingBid: 50000,
  currentBid: 50000,
  highestBidder: null,
  bidCount: 0,
  sequence: 0,
  status: 'waiting',
  startedAt: null,
  endsAt: null,
};
const bids = [];
const state = { auction, bids, winner: null };
const clients = new Set();
let bidQueue = Promise.resolve();
let simulatedUser = 0;
let closeTimer;

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  });
}

function snapshot() {
  const remainingMs = auction.endsAt ? Math.max(0, new Date(auction.endsAt).getTime() - Date.now()) : durationMs;
  return { type: 'auction-snapshot', auction: { ...auction, remainingMs }, bids: bids.slice(-50), winner: state.winner };
}

function startAuction() {
  if (auction.status === 'open') return;
  auction.currentBid = auction.startingBid;
  auction.highestBidder = null;
  auction.bidCount = 0;
  auction.sequence = 0;
  auction.status = 'open';
  auction.startedAt = new Date().toISOString();
  auction.endsAt = new Date(Date.now() + durationMs).toISOString();
  state.winner = null;
  bids.length = 0;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(closeAuction, durationMs);
}

function acceptBid(input) {
  if (auction.status === 'waiting') startAuction();
  const bidder = String(input.bidder || '').trim();
  const amount = Number(input.amount);
  if (!bidder || !Number.isFinite(amount) || amount <= auction.currentBid) {
    return { error: `Bid must be higher than ₹${auction.currentBid.toLocaleString('en-IN')}` };
  }
  if (auction.status !== 'open') return { error: 'Auction is closed' };

  auction.sequence += 1;
  auction.bidCount += 1;
  auction.currentBid = amount;
  auction.highestBidder = bidder;
  const bid = { sequence: auction.sequence, bidder, amount, timestamp: new Date().toISOString() };
  bids.push(bid);
  broadcast({ type: 'bid-update', bid, auction: { ...auction } });
  return { bid };
}

function queueBid(input) {
  return new Promise((resolve) => {
    bidQueue = bidQueue.then(() => resolve(acceptBid(input)));
  });
}

function closeAuction() {
  if (auction.status !== 'open') return;
  auction.status = 'closed';
  state.winner = auction.highestBidder ? { bidder: auction.highestBidder, amount: auction.currentBid, auctionId: auction.id } : null;
  broadcast({ type: 'auction-closed', auction: { ...auction }, winner: state.winner });
}

function simulateBid() {
  if (auction.status !== 'open') return;
  simulatedUser += 1;
  const increment = auction.currentBid < 100000 ? 1000 : 2500;
  queueBid({ bidder: `SimUser-${(simulatedUser % 4) + 1}`, amount: auction.currentBid + increment });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true, service: 'Live Bidding Platform', port });
  if (req.method === 'GET' && req.url === '/api/state') return sendJson(res, 200, { ...snapshot(), winner: state.winner });
  if (req.method === 'POST' && req.url === '/api/bids') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      let input;
      try { input = JSON.parse(body || '{}'); } catch { return sendJson(res, 400, { error: 'Request body must be valid JSON' }); }
      const result = await queueBid(input);
      return result.error ? sendJson(res, 400, result) : sendJson(res, 202, { accepted: true, bid: result.bid });
    });
    return;
  }
  if (req.method === 'GET') {
    fs.readFile(path.join(__dirname, '../../clients/bidding.html'), (error, content) => error ? sendJson(res, 500, { error: 'Client unavailable' }) : (res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }), res.end(content)));
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  clients.add(ws);
  if (auction.status !== 'open') startAuction();
  ws.send(JSON.stringify(snapshot()));
  ws.on('message', async (raw) => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'help') return ws.send(JSON.stringify({ type: 'help', text: 'Gold Necklace auction starts at ₹50,000 and runs for two minutes after the first connection. Simulated users bid every two seconds. Bids are serialized with sequence numbers, the highest valid bid wins, and auction-closed sends the winner. HTTP API: POST /api/bids and GET /api/state.' }));
    if (message.type === 'place-bid') {
      const result = await queueBid(message);
      if (result.error) ws.send(JSON.stringify({ type: 'bid-error', text: result.error }));
    }
  });
  ws.on('close', () => clients.delete(ws));
});

setInterval(simulateBid, 2000);
server.listen(port, () => {
  console.log(`Live Bidding Platform listening on http://localhost:${port}`);
  console.log(`Auction ready: Gold Necklace, starting bid ₹${auction.startingBid.toLocaleString('en-IN')}`);
});
