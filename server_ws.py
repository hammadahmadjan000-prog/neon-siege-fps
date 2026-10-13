# Multiplayer server (FastAPI + WebSocket)

This is a very small WebSocket broadcast server to use as a multiplayer skeleton.
Run with: pip install fastapi uvicorn

Example:
uvicorn server_ws:app --port 9001

It accepts WebSocket connections at /ws and broadcasts simple text messages to all connected clients.

```python
# server_ws.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from typing import List

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except:
                self.disconnect(connection)

manager = ConnectionManager()

@app.get('/')
async def root():
    return {"message": "Neon Siege WS server"}

@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # echo/broadcast to others (simple)
            await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```
