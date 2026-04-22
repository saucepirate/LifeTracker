from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_media():
    return {"items": [], "total": 0}
