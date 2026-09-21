# WebSocket Chat Room

Node.js WebSocket server + Python WebSocket client(s) forming a multi-user chat room.

## Server (Node.js)

```bash
cd server
npm install
npm start
```

Server listens on `ws://localhost:8080` by default (override with `PORT` env var).

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
