from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from app.database import get_db
from app import models, auth

router = APIRouter()

FREQUENCY_DELTAS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
    "biweekly": timedelta(weeks=2),
    "monthly": None,   # use relativedelta
    "quarterly": None,
    "yearly": None,
}


def next_occurrence(current: datetime, frequency: str) -> datetime:
    if frequency == "daily":
        return current + timedelta(days=1)
    elif frequency == "weekly":
        return current + timedelta(weeks=1)
    elif frequency == "biweekly":
        return current + timedelta(weeks=2)
    elif frequency == "monthly":
        return current + relativedelta(months=1)
    elif frequency == "quarterly":
        return current + relativedelta(months=3)
    elif frequency == "yearly":
        return current + relativedelta(years=1)
    return current


@router.get("/cashflow")
def cashflow_forecast(
    days: int = Query(default=90, le=365),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Projects cash flow forward N days based on:
    1. Current account balances
    2. Active recurring rules
    Returns a daily running balance series for charting.
    """
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = today + timedelta(days=days)

    # Starting balance: sum of all active accounts
    user_accounts = db.query(models.Account).filter(
        models.Account.user_id == current_user.id,
        models.Account.is_active == True
    ).all()
    starting_balance = sum(a.balance for a in user_accounts)

    # Get active recurring rules
    rules = db.query(models.RecurringRule).filter(
        models.RecurringRule.user_id == current_user.id,
        models.RecurringRule.is_active == True,
        models.RecurringRule.start_date <= end_date,
    ).all()

    # Build a day-by-day event map
    daily_events: dict[str, list] = {}

    for rule in rules:
        cursor = rule.next_due
        # Rewind to find first occurrence on or after today
        while cursor < today:
            cursor = next_occurrence(cursor, rule.frequency)

        while cursor <= end_date:
            if rule.end_date and cursor > rule.end_date:
                break
            key = cursor.strftime("%Y-%m-%d")
            if key not in daily_events:
                daily_events[key] = []
            daily_events[key].append({
                "name": rule.name,
                "amount": rule.amount,
                "type": rule.transaction_type,
                "category": rule.category.name if rule.category else "Other",
                "recurring_id": rule.id
            })
            cursor = next_occurrence(cursor, rule.frequency)

    # Build running balance series
    series = []
    running = starting_balance
    current = today

    while current <= end_date:
        key = current.strftime("%Y-%m-%d")
        events = daily_events.get(key, [])
        day_income = sum(e["amount"] for e in events if e["type"] == "income")
        day_expense = sum(e["amount"] for e in events if e["type"] == "expense")
        running = running + day_income - day_expense

        series.append({
            "date": key,
            "balance": round(running, 2),
            "income": round(day_income, 2),
            "expense": round(day_expense, 2),
            "events": events
        })
        current += timedelta(days=1)

    # Find shortfall periods
    shortfalls = [s for s in series if s["balance"] < 0]

    return {
        "starting_balance": round(starting_balance, 2),
        "ending_balance": round(running, 2),
        "days": days,
        "series": series,
        "shortfall_days": len(shortfalls),
        "lowest_balance": round(min(s["balance"] for s in series), 2) if series else 0,
        "lowest_balance_date": min(series, key=lambda x: x["balance"])["date"] if series else None
    }
