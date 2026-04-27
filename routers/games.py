from fastapi import APIRouter
import database

router = APIRouter()


@router.get("/scores")
def get_scores():
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT game, MAX(score) as score FROM high_scores GROUP BY game"
    ).fetchall()
    conn.close()
    return {row['game']: row['score'] for row in rows}


@router.post("/scores")
def save_score(body: dict):
    game = body.get('game')
    score = int(body.get('score', 0))
    if not game:
        return {'error': 'game required'}
    conn = database.get_connection()
    conn.execute(
        "INSERT INTO high_scores (game, score) VALUES (?, ?)", (game, score)
    )
    conn.commit()
    row = conn.execute(
        "SELECT MAX(score) as hs FROM high_scores WHERE game = ?", (game,)
    ).fetchone()
    conn.close()
    return {'game': game, 'high_score': row['hs'] if row else score}
