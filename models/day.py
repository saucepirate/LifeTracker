from pydantic import BaseModel
from typing import Optional


class DayItemCreate(BaseModel):
    plan_date: str
    title: str
    source_type: str = 'manual'   # manual | task | habit
    source_id: Optional[int] = None
    section: str = 'later'         # must_do | later
    start_time: Optional[str] = None   # HH:MM
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    sort_order: int = 0
    priority: str = 'medium'
    notes: Optional[str] = None
    goal_id: Optional[int] = None
    task_id: Optional[int] = None
    habit_id: Optional[int] = None
    tag_id: Optional[int] = None
    cal_event_id: Optional[int] = None


class DayItemUpdate(BaseModel):
    title: Optional[str] = None
    section: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    tag_id: Optional[int] = None
    cal_event_id: Optional[int] = None
    clear_start_time: bool = False
    clear_end_time: bool = False
    clear_notes: bool = False
    clear_tag_id: bool = False


class DayNoteUpdate(BaseModel):
    plan_date: str
    morning_plan: Optional[str] = None
    evening_reflection: Optional[str] = None


class DayItemMove(BaseModel):
    target_date: str
