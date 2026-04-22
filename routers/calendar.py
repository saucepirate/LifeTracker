from fastapi import APIRouter

router = APIRouter()


@router.get("/month")
def calendar_month():
    return {"items": [], "total": 0}


@router.get("/day")
def calendar_day():
    return {"items": [], "total": 0}
