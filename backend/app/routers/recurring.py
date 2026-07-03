from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app import models, auth

router = APIRouter()


class RecurringCreate(BaseModel):
    account_id: int
    category_id: Optional[int] = None
    name: str
    amount: float
    transaction_type: str
    frequency: str
    start_date: datetime
    end_date: Optional[datetime] = None
    notes: Optional[str] = None


@router.get("/")
def list_recurring(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    rules = db.query(models.RecurringRule).filter(
        models.RecurringRule.user_id == current_user.id,
        models.RecurringRule.is_active == True
    ).order_by(models.RecurringRule.next_due).all()
    return rules


@router.post("/")
def create_recurring(
    payload: RecurringCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    account = db.query(models.Account).filter(
        models.Account.id == payload.account_id,
        models.Account.user_id == current_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    rule = models.RecurringRule(
        user_id=current_user.id,
        next_due=payload.start_date,
        **payload.model_dump()
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/{rule_id}")
def update_recurring(
    rule_id: int,
    payload: RecurringCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    rule = db.query(models.RecurringRule).filter(
        models.RecurringRule.id == rule_id,
        models.RecurringRule.user_id == current_user.id
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_recurring(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    rule = db.query(models.RecurringRule).filter(
        models.RecurringRule.id == rule_id,
        models.RecurringRule.user_id == current_user.id
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    rule.is_active = False  # soft delete
    db.commit()
    return {"ok": True}
