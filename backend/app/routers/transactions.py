from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, extract
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app import models, auth

router = APIRouter()


class TransactionCreate(BaseModel):
    account_id: int
    category_id: Optional[int] = None
    amount: float
    transaction_type: str
    description: Optional[str] = None
    merchant: Optional[str] = None
    date: datetime
    notes: Optional[str] = None
    status: Optional[str] = None


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None
    merchant: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[datetime] = None


@router.get("/")
def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Get all account IDs for this user
    user_account_ids = [a.id for a in db.query(models.Account).filter(
        models.Account.user_id == current_user.id
    ).all()]

    q = db.query(models.Transaction).filter(
        models.Transaction.account_id.in_(user_account_ids)
    )

    if account_id:
        if account_id not in user_account_ids:
            raise HTTPException(status_code=403, detail="Not your account")
        q = q.filter(models.Transaction.account_id == account_id)
    if category_id:
        q = q.filter(models.Transaction.category_id == category_id)
    if transaction_type:
        q = q.filter(models.Transaction.transaction_type == transaction_type)
    if start_date:
        q = q.filter(models.Transaction.date >= start_date)
    if end_date:
        q = q.filter(models.Transaction.date <= end_date)

    total = q.count()
    transactions = q.order_by(models.Transaction.date.desc()).offset(offset).limit(limit).all()

    return {"total": total, "items": transactions}


@router.post("/")
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    account = db.query(models.Account).filter(
        models.Account.id == payload.account_id,
        models.Account.user_id == current_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    tx = models.Transaction(**payload.model_dump())
    db.add(tx)

    # Update account balance
    if payload.transaction_type == "income":
        account.balance += payload.amount
    elif payload.transaction_type == "expense":
        account.balance -= payload.amount

    db.commit()
    db.refresh(tx)
    return tx


@router.put("/{tx_id}")
def update_transaction(
    tx_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    user_account_ids = [a.id for a in db.query(models.Account).filter(
        models.Account.user_id == current_user.id
    ).all()]

    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id,
        models.Transaction.account_id.in_(user_account_ids)
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(tx, k, v)

    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    user_account_ids = [a.id for a in db.query(models.Account).filter(
        models.Account.user_id == current_user.id
    ).all()]

    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id,
        models.Transaction.account_id.in_(user_account_ids)
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Reverse balance
    account = tx.account
    if tx.transaction_type == "income":
        account.balance -= tx.amount
    elif tx.transaction_type == "expense":
        account.balance += tx.amount

    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.get("/summary/monthly")
def monthly_summary(
    year: int = Query(default=datetime.now().year),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Returns monthly income vs expense totals for charts."""
    user_account_ids = [a.id for a in db.query(models.Account).filter(
        models.Account.user_id == current_user.id
    ).all()]

    results = []
    for month in range(1, 13):
        txs = db.query(models.Transaction).filter(
            models.Transaction.account_id.in_(user_account_ids),
            extract("year", models.Transaction.date) == year,
            extract("month", models.Transaction.date) == month,
        ).all()

        income = sum(t.amount for t in txs if t.transaction_type == "income")
        expense = sum(t.amount for t in txs if t.transaction_type == "expense")
        results.append({
            "month": month,
            "income": round(income, 2),
            "expense": round(expense, 2),
            "net": round(income - expense, 2)
        })

    return results


@router.get("/summary/by-category")
def category_summary(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Returns spending totals grouped by category for pie/donut charts."""
    user_account_ids = [a.id for a in db.query(models.Account).filter(
        models.Account.user_id == current_user.id
    ).all()]

    q = db.query(models.Transaction).filter(
        models.Transaction.account_id.in_(user_account_ids),
        models.Transaction.transaction_type == "expense"
    )
    if start_date:
        q = q.filter(models.Transaction.date >= start_date)
    if end_date:
        q = q.filter(models.Transaction.date <= end_date)

    txs = q.all()
    by_category = {}
    for tx in txs:
        cat_name = tx.category.name if tx.category else "Uncategorized"
        cat_color = tx.category.color if tx.category else "#94a3b8"
        key = cat_name
        if key not in by_category:
            by_category[key] = {"name": cat_name, "color": cat_color, "total": 0}
        by_category[key]["total"] += tx.amount

    return sorted(by_category.values(), key=lambda x: x["total"], reverse=True)
