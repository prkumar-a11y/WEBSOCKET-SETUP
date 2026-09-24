# WebSocket Chat Room

Node.js WebSocket server + Python WebSocket client(s) forming a multi-user chat room.

## Server (Node.js)

```bash
cd server
npm install
npm start
```

The direct chat server listens on `ws://localhost:8081` by default (override with `PORT` env var).

## Client (Python)

```bash
cd client
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python client.py
```

Run the client in multiple terminals to simulate multiple chat participants.
Type `/quit` or `/exit` to leave the chat.

# WebSocket Applications

This workspace contains five Node.js applications behind one proxy:

| Application | Direct port | Proxy URL |
| --- | ---: | --- |
| Chat server and client | 8081 | http://localhost:8000/chat |
| E-Commerce live updates | 8082 | http://localhost:8000/ecommerce |
| Trading dashboard | 8083 | http://localhost:8000/trading |
| Live bidding platform | 8084 | http://localhost:8000/bidding |
| Proxy gateway | 8000 | http://localhost:8000 |

## Install

```bash
cd server
export PATH="$HOME/.nvm/versions/node/v20.16.0/bin:$PATH"
npm install
```

## Run everything

From the project directory:

```bash
node start-all.js
```

Open the browser at http://localhost:8000. Stop all applications with `Ctrl+C`.

Individual applications can also be started with the commands below:

```bash
node server/server.js
node services/ecommerce/server.js
node services/trading/server.js
node services/bidding/server.js
node proxy/gateway.js
```

## Event behavior

Each domain service provides:

- A browser client with a domain-specific update form.
- A WebSocket endpoint through the proxy.
- `GET /health` and `GET /api/state`.
- `POST /api/events` to publish an update and broadcast it to all WebSocket clients.

The full set of sample HTTP and WebSocket requests is in [requests.http](requests.http).

Example request:

```bash
curl -X POST http://localhost:8000/trading/api/events \
	-H 'Content-Type: application/json' \
	-d '{"symbol":"AAPL","price":212.50,"action":"quote-update"}'
```

The matching browser dashboard receives the event immediately.

## Ubuntu Docker deployment

The production deployment runs the four applications and Node gateway on a private Docker network. Caddy is the public edge proxy and exposes only ports `80` and `443`; it forwards HTTP and WebSocket traffic to the gateway.

| Public endpoint | Destination |
| --- | --- |
| `http://HOST/` | Caddy -> gateway -> applications |
| `https://HOST/` | Caddy TLS -> gateway -> applications |

Internal application ports remain private:

| Service | Container port |
| --- | ---: |
| Chat | 8081 |
| E-Commerce | 8082 |
| Trading | 8083 |
| Bidding | 8084 |
| Gateway | 8000 |

On Ubuntu:

```bash
cd websocket-chat-room
cp .env.example .env
# Edit .env and set DOMAIN to a DNS name pointing to this server.
sudo ./deploy/setup-ubuntu.sh
```

The script installs Docker and the Compose plugin when missing, builds all containers, and starts the stack. Caddy automatically obtains and renews a public certificate when `DOMAIN` resolves to the Ubuntu host and ports 80/443 are reachable. For local testing, set `DOMAIN=localhost`; browsers will not trust Caddy's local certificate without an explicit trust setup.

Useful commands:

```bash
docker compose ps
docker compose logs -f caddy gateway
docker compose down
```
