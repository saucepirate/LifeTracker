from pydantic import BaseModel
from typing import Optional


class TripCreate(BaseModel):
    name: str
    destination: Optional[str] = None
    start_date: str
    end_date: str
    status: str = 'Planning'
    color: str = 'blue'


class TripUpdate(BaseModel):
    name: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    color: Optional[str] = None
    flight_confirmation: Optional[str] = None
    hotel_confirmation: Optional[str] = None
    car_rental: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    passport_notes: Optional[str] = None
    custom_field_1_label: Optional[str] = None
    custom_field_1_value: Optional[str] = None
    custom_field_2_label: Optional[str] = None
    custom_field_2_value: Optional[str] = None
    budget_total: Optional[float] = None
    budget_currency: Optional[str] = None
    clear_budget_total: bool = False


class AttendeeCreate(BaseModel):
    name: str
    is_me: int = 0
    sort_order: int = 0


class AttendeeUpdate(BaseModel):
    name: Optional[str] = None
    is_me: Optional[int] = None
    sort_order: Optional[int] = None
