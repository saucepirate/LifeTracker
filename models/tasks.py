from pydantic import BaseModel
from typing import Optional, List


class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    priority: str = 'medium'
    due_date: Optional[str] = None
    goal_id: Optional[int] = None
    note_id: Optional[int] = None
    tag_ids: List[int] = []
    make_recurring: bool = False
    recurrence_cadence: Optional[str] = None
    recurrence_interval: int = 1
    recurrence_days_of_week: Optional[List[int]] = None
    recurrence_day_of_month: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    goal_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    clear_due_date: bool = False


class SubtaskCreate(BaseModel):
    title: str
    sort_order: int = 0


class SubtaskUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[int] = None
    sort_order: Optional[int] = None


class RecurrenceCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    priority: str = 'medium'
    goal_id: Optional[int] = None
    cadence: str
    interval_value: int = 1
    days_of_week: Optional[List[int]] = None
    day_of_month: Optional[int] = None
    tag_ids: List[int] = []


class RecurrenceUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    priority: Optional[str] = None
    goal_id: Optional[int] = None
    cadence: Optional[str] = None
    interval_value: Optional[int] = None
    days_of_week: Optional[List[int]] = None
    day_of_month: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    active: Optional[int] = None
