from pydantic import BaseModel
from typing import Optional


class InvNoteCreate(BaseModel):
    symbol: str
    note_type: str = 'general'   # 'thesis' | 'action' | 'watchlist' | 'general'
    content: str


class InvNoteUpdate(BaseModel):
    note_type: Optional[str] = None
    content: Optional[str] = None


class InvActionCreate(BaseModel):
    symbol: Optional[str] = None
    account_number: Optional[str] = None
    action_type: str = 'review'   # 'buy_more'|'sell'|'trim'|'rebalance'|'research'|'review'|'stop_recurring'|'other'
    title: str
    notes: Optional[str] = None
    due_date: Optional[str] = None


class InvActionUpdate(BaseModel):
    symbol: Optional[str] = None
    account_number: Optional[str] = None
    action_type: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None   # 'open'|'completed'|'deferred'|'dismissed'
    due_date: Optional[str] = None
