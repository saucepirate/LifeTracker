from pydantic import BaseModel
from typing import Optional


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    area: Optional[str] = None
    goal_type: Optional[str] = 'general'
    target_date: Optional[str] = None
    start_value: Optional[float] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    weekly_target_minutes: Optional[int] = None
    min_days_per_week: Optional[int] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    area: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    clear_target_date: bool = False
    start_value: Optional[float] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    weekly_target_minutes: Optional[int] = None
    min_days_per_week: Optional[int] = None
    pinned: Optional[int] = None


class MilestoneCreate(BaseModel):
    title: str
    target_date: Optional[str] = None
    sort_order: int = 0
    metric_id: Optional[int] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    target_date: Optional[str] = None
    clear_target_date: bool = False
    completed: Optional[int] = None
    sort_order: Optional[int] = None
    metric_id: Optional[int] = None
    clear_metric_id: bool = False


class LogEntryCreate(BaseModel):
    value: Optional[float] = None
    note: Optional[str] = None
    logged_at: Optional[str] = None
    habit_id: Optional[int] = None


class MetricCreate(BaseModel):
    label: str = 'Target'
    start_value: Optional[float] = 0
    current_value: Optional[float] = None
    target_value: Optional[float] = None
    unit: Optional[str] = None
    sort_order: int = 0
    milestone_id: Optional[int] = None


class MetricUpdate(BaseModel):
    label: Optional[str] = None
    start_value: Optional[float] = None
    current_value: Optional[float] = None
    target_value: Optional[float] = None
    unit: Optional[str] = None
    sort_order: Optional[int] = None
    completed: Optional[int] = None
    milestone_id: Optional[int] = None
    clear_milestone_id: bool = False


class HabitCreate(BaseModel):
    label: str = 'Habit'
    weekly_target_minutes: Optional[int] = None
    min_days_per_week: Optional[int] = None
    sort_order: int = 0

class HabitUpdate(BaseModel):
    label: Optional[str] = None
    weekly_target_minutes: Optional[int] = None
    min_days_per_week: Optional[int] = None
    sort_order: Optional[int] = None
