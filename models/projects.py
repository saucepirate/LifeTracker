from pydantic import BaseModel
from typing import Optional, List


class OwnerIn(BaseModel):
    name: str
    role: str = 'owner'   # owner | collaborator


class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    color: str = 'cyan'
    status: str = 'active'   # active | completed | paused | cancelled
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    goal_id: Optional[int] = None
    trip_id: Optional[int] = None
    is_ongoing: bool = False
    owners: List[OwnerIn] = []


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    clear_start_date: bool = False
    deadline: Optional[str] = None
    clear_deadline: bool = False
    goal_id: Optional[int] = None
    clear_goal_id: bool = False
    trip_id: Optional[int] = None
    clear_trip_id: bool = False
    is_ongoing: Optional[bool] = None
    owners: Optional[List[OwnerIn]] = None


class MilestoneCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    is_deliverable: bool = False
    sort_order: int = 0


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    clear_due_date: bool = False
    status: Optional[str] = None
    is_deliverable: Optional[bool] = None
    sort_order: Optional[int] = None


class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    status: str = 'todo'       # todo | in_progress | done | blocked | skipped
    priority: str = 'medium'   # high | medium | low
    task_type: str = 'todo'    # todo | research | purchase | event
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    estimated_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    milestone_id: Optional[int] = None
    sort_order: int = 0


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    task_type: Optional[str] = None
    due_date: Optional[str] = None
    clear_due_date: bool = False
    assigned_to: Optional[str] = None
    clear_assigned_to: bool = False
    estimated_cost: Optional[float] = None
    clear_estimated_cost: bool = False
    actual_cost: Optional[float] = None
    clear_actual_cost: bool = False
    milestone_id: Optional[int] = None
    clear_milestone_id: bool = False
    sort_order: Optional[int] = None


class ProjectTemplateCreate(BaseModel):
    name: str
    icon: str = '📋'
    description: Optional[str] = None
    color: str = 'cyan'
    is_ongoing: bool = False
    milestones: str = '[]'
    tasks: str = '[]'
    note_title: Optional[str] = None
    note_content: Optional[str] = None
    source_id: Optional[str] = None
    filter_trip_type: str = 'any'
    filter_destination: str = 'any'
    filter_length: str = 'any'


class ProjectTemplateUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_ongoing: Optional[bool] = None
    milestones: Optional[str] = None
    tasks: Optional[str] = None
    note_title: Optional[str] = None
    note_content: Optional[str] = None
    source_id: Optional[str] = None
    filter_trip_type: Optional[str] = None
    filter_destination: Optional[str] = None
    filter_length: Optional[str] = None
