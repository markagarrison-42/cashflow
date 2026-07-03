from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models, auth

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: str = "tag"
    is_income: bool = False


@router.get("/")
def list_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return db.query(models.Category).filter(
        models.Category.user_id == current_user.id
    ).order_by(models.Category.is_income.desc(), models.Category.name).all()


@router.post("/")
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    cat = models.Category(user_id=current_user.id, **payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/{cat_id}")
def update_category(
    cat_id: int,
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    cat = db.query(models.Category).filter(
        models.Category.id == cat_id,
        models.Category.user_id == current_user.id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    for k, v in payload.model_dump().items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}")
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    cat = db.query(models.Category).filter(
        models.Category.id == cat_id,
        models.Category.user_id == current_user.id,
        models.Category.is_default == False
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found or is a default")

    db.delete(cat)
    db.commit()
    return {"ok": True}
