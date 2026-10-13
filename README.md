# Neon Siege FPS - Upgraded Starter

This branch contains an upgraded browser-based 3D FPS starter built with Three.js (no game engine).

What's included

- First-person camera (PointerLockControls)
- WASD movement, jump, simple gravity
- Projectile bullets, muzzle flash, recoil
- Enemy waves with simple AI and health
- HUD: health, score, wave, crosshair
- Neon sci-fi look and simple audio (WebAudio)
- Start and pause UI

Run locally

1. Serve the files with a local HTTP server (recommended):
   - Python 3: `python -m http.server 8000`
   - or use any static server / dev server
2. Open http://localhost:8000
3. Click Start, then click the canvas to lock pointer. Use WASD to move, left click to shoot.

Optional: Backend

A minimal FastAPI server is included as `server.py` to show how you can add a leaderboard API.

Next steps you can ask me to add

- GLTF enemy/player models + animations
- Sound effects and music (preloaded) and volume controls
- More advanced collision/capsule physics or cannon-es integration
- Networking (WebSocket) for multiplayer
- Better enemy pathfinding (navmesh / A*)

If you'd like, I can open a pull request from this branch into your default branch when you review the changes.
