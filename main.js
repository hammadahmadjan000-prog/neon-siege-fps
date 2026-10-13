:root {
  --bg:#04070d;
  --panel: rgba(10,18,28,0.82);
  --border: rgba(116,231,255,0.5);
  --neon: #69f4ff;
  --cyan: #5de6ff;
  --pink: #ff5dd9;
  --amber: #ffd166;
  --green: #83ffba;
  --text: #edf7ff;
  --muted: #9cb6c9;
}

html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at top, #0d1626 0%, #060b12 42%, #020407 100%);
  color: var(--text);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

#ui { position: fixed; inset: 0; pointer-events: none; }

.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2,5,10,0.62);
  backdrop-filter: blur(4px);
  pointer-events: auto;
}

.hidden { display: none !important; }

.panel {
  width: min(88vw, 560px);
  padding: 28px 30px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(12,20,32,0.9), rgba(6,10,18,0.78));
  border: 1px solid var(--border);
  box-shadow: 0 0 28px rgba(105, 244, 255, 0.2), inset 0 0 24px rgba(255,255,255,0.02);
  text-align: center;
}

.panel.small { width: min(70vw, 360px); }

.title-line {
  color: var(--neon);
  letter-spacing: 0.38rem;
  font-size: 11px;
  margin-bottom: 10px;
  text-transform: uppercase;
}

h1, h2 { margin: 0 0 12px; }

h1 {
  font-size: clamp(2.5rem, 5vw, 4.2rem);
  color: var(--neon);
  text-shadow: 0 0 18px rgba(105, 244, 255, 0.35);
}

p {
  color: var(--muted);
  margin: 8px 0 18px;
}

button {
  border: 1px solid rgba(117, 235, 255, 0.7);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(105, 244, 255, 0.18), rgba(105, 244, 255, 0.05));
  color: var(--text);
  cursor: pointer;
  padding: 12px 22px;
  font-size: 1rem;
  box-shadow: 0 0 16px rgba(105,244,255,0.16);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 24px rgba(105,244,255,0.25);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 18px;
  color: var(--muted);
}

#crosshair {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 30px;
  color: var(--neon);
  text-shadow: 0 0 12px rgba(105,244,255,0.7);
  pointer-events: none;
}

#topbar,
#health,
#ammo,
#weapon,
#status {
  position: fixed;
  background: rgba(5, 12, 18, 0.46);
  border: 1px solid rgba(123, 198, 255, 0.22);
  border-radius: 10px;
  padding: 8px 12px;
  color: var(--text);
  font-size: 0.9rem;
}

#topbar {
  top: 16px;
  left: 16px;
  display: flex;
  gap: 18px;
}

#health { top: 16px; right: 16px; }
#ammo { top: 62px; right: 16px; }
#weapon { top: 108px; right: 16px; }
#status { top: 154px; right: 16px; }

#hint {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  background: rgba(3, 8, 14, 0.5);
  border: 1px solid rgba(128,196,255,0.18);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.82rem;
  color: var(--muted);
}

#minimap {
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  border: 2px solid rgba(105, 244, 255, 0.5);
  background: rgba(5, 12, 18, 0.5);
  box-shadow: inset 0 0 28px rgba(105,244,255,0.08), 0 0 14px rgba(105,244,255,0.12);
}

@media (max-width: 720px) {
  #crosshair { font-size: 22px; }
  #minimap { width: 120px; height: 120px; }
  #topbar { gap: 10px; font-size: 0.75rem; }
  #health, #ammo, #weapon, #status { font-size: 0.76rem; }
  #hint { width: calc(100% - 28px); text-align: center; }
}
