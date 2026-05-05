from pydantic import BaseModel
from typing import Optional, List


class AccountCreate(BaseModel):
    name: str
    type: str = 'credit'           # checking | credit | savings | brokerage | cash | other
    institution: Optional[str] = None
    notes: Optional[str] = None
    is_active: int = 1


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    institution: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[int] = None


class CategoryCreate(BaseModel):
    name: str
    color: str = 'blue'
    icon: Optional[str] = None
    is_income: int = 0
    is_savings: int = 0
    is_excluded: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_income: Optional[int] = None
    is_savings: Optional[int] = None
    is_excluded: Optional[int] = None
    sort_order: Optional[int] = None


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    clear_category: bool = False
    notes: Optional[str] = None
    name: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None
    is_transfer: Optional[int] = None
    user_classified: Optional[int] = None


class TransactionCreate(BaseModel):
    account_id: Optional[int] = None
    date: str
    name: str
    amount: float
    memo: Optional[str] = None
    mcc: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None


class CategoryRuleCreate(BaseModel):
    category_id: int
    rule_type: str               # 'mcc' | 'merchant'
    pattern: str
    priority: int = 10           # user rules default high


class CategoryRuleUpdate(BaseModel):
    category_id: Optional[int] = None
    pattern: Optional[str] = None
    priority: Optional[int] = None


class IncomeCreate(BaseModel):
    name: str
    amount: float
    frequency: str = 'monthly'   # monthly | biweekly | weekly | annual | one-time
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: int = 1
    notes: Optional[str] = None


class IncomeUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[int] = None
    notes: Optional[str] = None


class HoldingCreate(BaseModel):
    account_id: Optional[int] = None
    symbol: Optional[str] = None
    name: str
    type: str = 'stock'          # cash | stock | etf | crypto | real_estate | private | bond | other
    value: Optional[float] = None        # direct manual valuation (preferred for cash/private)
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    current_price: Optional[float] = None
    notes: Optional[str] = None


class HoldingUpdate(BaseModel):
    account_id: Optional[int] = None
    symbol: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    value: Optional[float] = None
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    current_price: Optional[float] = None
    notes: Optional[str] = None


class LiabilityCreate(BaseModel):
    name: str
    kind: str = 'loan'           # loan | credit_card | mortgage | student_loan | line_of_credit | other
    principal: Optional[float] = None
    current_balance: float
    interest_rate: Optional[float] = None       # annual percentage rate (e.g. 5.25)
    payment_amount: Optional[float] = None
    payment_frequency: Optional[str] = None     # monthly | biweekly | weekly | annual | one-time
    next_payment_date: Optional[str] = None
    lender: Optional[str] = None
    notes: Optional[str] = None


class LiabilityUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    principal: Optional[float] = None
    current_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    payment_amount: Optional[float] = None
    payment_frequency: Optional[str] = None
    next_payment_date: Optional[str] = None
    lender: Optional[str] = None
    notes: Optional[str] = None


class FinGoalCreate(BaseModel):
    name: str
    kind: str = 'savings'        # savings | debt_payoff | investment | retirement | emergency | other
    target_amount: float
    current_amount: float = 0
    target_date: Optional[str] = None
    notes: Optional[str] = None


class FinGoalUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    target_date: Optional[str] = None
    notes: Optional[str] = None


class ImportClassifyAssign(BaseModel):
    """When the user resolves a reconciliation item, optionally creating a rule."""
    transaction_id: int
    category_id: int
    create_rule: bool = False
    rule_type: Optional[str] = None       # 'mcc' | 'merchant'
    rule_pattern: Optional[str] = None    # the merchant substring or MCC to match
    overwrite_classified: bool = False    # if True, re-classify already-classified transactions too


class ExpenditureCreate(BaseModel):
    name: str
    amount: float
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    is_recurring: int = 0
    recurrence_months: Optional[int] = None


class ExpenditureUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    is_recurring: Optional[int] = None
    recurrence_months: Optional[int] = None


class PlanningAssumptions(BaseModel):
    return_rate: Optional[float] = None
    inflation_rate: Optional[float] = None
    target_retire_age: Optional[int] = None
    plan_mode: Optional[str] = None        # 'safe' | 'aggressive'
