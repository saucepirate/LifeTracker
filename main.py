import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

import config
import database
from routers import tasks, goals, events, notes, media, tags, calendar, recurrences, dashboard, settings


@asynccontextmanager
async def lifespan(app):
    database.init_db()
    yield


app = FastAPI(title="LifeTracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(goals.router, prefix="/api/goals", tags=["goals"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(media.router, prefix="/api/media", tags=["media"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(recurrences.router, prefix="/api/recurrences", tags=["recurrences"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    return FileResponse(os.path.join(static_dir, "index.html"))


if __name__ == "__main__":
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=config.DEBUG)
