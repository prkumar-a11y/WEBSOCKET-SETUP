import asyncio
import json
import sys

import websockets

SERVER_URI = "ws://localhost:8081"
HELP_TEXT = "Commands: /help shows this help, /quit or /exit disconnects. Enter a message to broadcast it to everyone."


async def receive_messages(ws):
    async for raw in ws:
        data = json.loads(raw)
        if data["type"] == "system":
            print(f"\n*** {data['text']} ***")
        elif data["type"] == "message":
            print(f"\n{data['username']}: {data['text']}")
        print("> ", end="", flush=True)


async def send_messages(ws, username):
    loop = asyncio.get_event_loop()
    while True:
        text = await loop.run_in_executor(None, input, "> ")
        command = text.strip().lower()
        if command == "/help":
            await ws.send(json.dumps({"type": "help"}))
            continue
        if command in ("/quit", "/exit"):
            break
        if text.strip():
            await ws.send(json.dumps({"type": "message", "text": text}))


async def main():
    username = input("Enter your username: ").strip() or "Anonymous"

    async with websockets.connect(SERVER_URI) as ws:
        await ws.send(json.dumps({"type": "join", "username": username}))

        receiver_task = asyncio.create_task(receive_messages(ws))
        try:
            await send_messages(ws, username)
        finally:
            receiver_task.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
