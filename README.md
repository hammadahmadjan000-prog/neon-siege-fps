# Neon Siege - Advanced run instructions

This branch includes advanced features: mission progression, save/load (localStorage), larger arena, improved AI, background music (synth), and a simple WebSocket multiplayer skeleton.

Run the static game locally:
1. git checkout feature/upgrade-fps-starter
2. python -m http.server 8000
3. open http://localhost:8000

Optional: run the WebSocket server for multiplayer testing:
1. pip install fastapi uvicorn
2. uvicorn server_ws:app --port 9001
3. The game will attempt to connect to ws://localhost:9001/ws (client is a stub in main.js)

Notes & next steps:
- Music is a simple WebAudio synth pulse. Replace or add audio assets for a richer soundtrack.
- Multiplayer is a skeleton (broadcast-only). For authoritative multiplayer you'll need server-side state.
- Save/load uses localStorage. For server-save use the FastAPI example server as an API endpoint.
- For improved performance with many entities, consider using instanced meshes.

