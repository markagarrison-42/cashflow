from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models, auth

router = APIRouter()


class AccountCreate(BaseModel):
    name: str
    account_type: str = "checking"
    balance: float = 0.0
    currency: str = "USD"


@router.get("/")
def list_accounts(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    q = db.query(models.Account).filter(models.Account.user_id == current_user.id)
    if not include_archived:
        q = q.filter(models.Account.is_active == True)
    accounts = q.all()
    active = [a for a in accounts if a.is_active]
    total_balance = sum(a.balance for a in active)
    return {"accounts": accounts, "total_balance": round(total_balance, 2)}


@router.post("/")
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    account = models.Account(user_id=current_user.id, **payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/{account_id}")
def update_account(
    account_id: int,
    payload: AccountCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    for k, v in payload.model_dump().items():
        setattr(account, k, v)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/{account_id}/restore")
def restore_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_active = True
    db.commit()
    return {"ok": True}
