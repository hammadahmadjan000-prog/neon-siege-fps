# server.py

# Minimal FastAPI leaderboard example (optional)

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Dict

app = FastAPI()

class Score(BaseModel):
    name: str
    score: int

scores: Dict[str, int] = {}

@app.get('/')
async def root():
    return {"message": "Neon Siege API"}

@app.get('/scores')
async def get_scores():
    return scores

@app.post('/scores')
async def post_score(s: Score):
    prev = scores.get(s.name, 0)
    if s.score > prev:
        scores[s.name] = s.score
    return {"status": "ok", "top": scores}
