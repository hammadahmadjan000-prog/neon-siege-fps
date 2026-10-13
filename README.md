Advanced realism upgrade — how to add real assets

What I added
- GLTF/GLB loader for a realistic player model (first-person arms/head positioning when possible)
- HDRI environment loading (RGBE) for PBR lighting
- PMREM setup so materials reflect realistic lighting
- Improved movement inertia and camera bob
- Projectile and weapon muzzle visuals that match PBR environment
- Fallback procedural model if GLTF not found

How to get realistic assets (recommended)
1) Player (animated glTF/glb)
   - Download "Soldier" or a humanoid with animations from the Khronos glTF Sample Models:
     https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/Soldier
   - Save the binary as: assets/models/player.glb

2) HDR environment (for realistic reflections)
   - Download an HDR equirectangular from Poly Haven / HDRI Haven (1k or 2k recommended). Example:
     https://polyhaven.com/a/venice_sunset (choose a 1k .hdr)
   - Save it as: assets/env/env.hdr

3) Optional: Replace procedural props with authored GLB models in assets/models/*.glb

Notes
- The code will attempt to load assets from assets/... first, then fall back to a public URL. For offline or repeatable results, download the model and HDR and place them in the assets folder.
- Large HDR files may cause long load times; use 1k sized HDRs for the browser.

Running locally
1. git checkout feature/upgrade-fps-starter
2. python -m http.server 8000
3. open http://localhost:8000

If you want, I can:
- Integrate a mocap-based humanoid with IK and foot placement
- Add root-motion walking/running blending and inverse kinematics for realistic limbs
- Replace the procedural arena with authored glTF environment models and lightmaps
- Convert audio from synth to layered soundtracks and footsteps per material
- Implement client-side prediction and authoritative server for multiplayer

Tell me which of these advanced realism items you want next and I will push them into the repo.