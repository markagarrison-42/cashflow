from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app import models, auth
import csv
import io

router = APIRouter()
BATCH_SIZE = 500


def parse_ynab_amount(inflow: str, outflow: str) -> tuple[float, str]:
    def clean(s):
        return float(s.replace("$", "").replace(",", "").strip() or "0")
    inflow_val = clean(inflow)
    outflow_val = clean(outflow)
    if inflow_val > 0:
        return inflow_val, "income"
    else:
        return outflow_val, "expense"


def parse_ynab_date(date_str: str) -> datetime:
    date_str = date_str.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str}")


def get_or_create_account(name: str, user_id: int, db: Session, cache: dict) -> models.Account:
    if name in cache:
        return cache[name]
    account = db.query(models.Account).filter_by(user_id=user_id, name=name).first()
    if not account:
        name_lower = name.lower()
        if any(w in name_lower for w in ["credit", "card", "visa", "mastercard", "amex"]):
            account_type = "credit"
        elif any(w in name_lower for w in ["saving", "savings"]):
            account_type = "savings"
        elif any(w in name_lower for w in ["loan", "mortgage", "auto", "student", "heloc", "loc", "line of credit"]):
            account_type = "loan"
        elif any(w in name_lower for w in ["invest", "brokerage", "401k", "ira", "roth", "thrift", "tsp"]):
            account_type = "investment"
        else:
            account_type = "checking"
        account = models.Account(
            user_id=user_id, name=name,
            account_type=account_type, balance=0.0, currency="USD"
        )
        db.add(account)
        db.flush()
    cache[name] = account
    return account


@router.post("/ynab")
async def import_ynab(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    contents = await file.read()
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="Empty or invalid CSV file")

    headers = [h.strip() for h in reader.fieldnames]
    ynab_required = {"Date", "Payee", "Outflow", "Inflow"}
    if not ynab_required.issubset(set(headers)):
        raise HTTPException(status_code=400, detail=f"Not a valid YNAB CSV. Got: {set(headers)}")

    has_account_col = "Account" in headers

    user_categories = db.query(models.Category).filter_by(user_id=current_user.id).all()
    cat_map = {c.name.lower(): c for c in user_categories}

    # Build dedup set: (account_name, date_str, amount, payee)
    existing = db.query(
        models.Transaction.account_id,
        models.Transaction.date,
        models.Transaction.amount,
        models.Transaction.description
    ).join(models.Account).filter(
        models.Account.user_id == current_user.id
    ).all()

    dedup_set = set()
    for row in existing:
        key = (row.account_id, row.date.strftime("%Y-%m-%d") if row.date else "", row.amount, (row.description or "").lower())
        dedup_set.add(key)

    account_cache = {}
    imported = skipped = dupes = 0
    batch = 0

    for i, row in enumerate(reader, start=2):
        try:
            payee = row.get("Payee", "").strip()
            if not payee or payee.lower() in ("starting balance", "reconciliation balance adjustment"):
                skipped += 1
                continue

            date_str = row.get("Date", "").strip()
            if not date_str:
                skipped += 1
                continue

            date = parse_ynab_date(date_str)
            amount, tx_type = parse_ynab_amount(row.get("Inflow", "0"), row.get("Outflow", "0"))
            if amount == 0:
                skipped += 1
                continue

            account_name = row.get("Account", "").strip() if has_account_col else "Imported"
            if not account_name:
                account_name = "Imported"

            account = get_or_create_account(account_name, current_user.id, db, account_cache)

            # Deduplication check
            dedup_key = (account.id, date.strftime("%Y-%m-%d"), amount, payee.lower())
            if dedup_key in dedup_set:
                dupes += 1
                continue
            dedup_set.add(dedup_key)

            ynab_cat = (row.get("Category Group/Category", "") or "").strip()
            category_id = None
            if ynab_cat:
                cat = cat_map.get(ynab_cat.lower())
                if not cat:
                    for name, c in cat_map.items():
                        if name in ynab_cat.lower() or ynab_cat.lower() in name:
                            cat = c
                            break
                if cat:
                    category_id = cat.id

            memo = row.get("Memo", "").strip()
            db.add(models.Transaction(
                account_id=account.id, category_id=category_id,
                amount=amount, transaction_type=tx_type,
                description=payee, merchant=payee,
                notes=memo if memo else None, date=date,
            ))

            if tx_type == "income":
                account.balance += amount
            else:
                account.balance -= amount

            imported += 1
            batch += 1

            if batch >= BATCH_SIZE:
                db.commit()
                batch = 0

        except Exception as e:
            skipped += 1
            continue

    db.commit()

    account_summaries = []
    for name, account in account_cache.items():
        db.refresh(account)
        account_summaries.append({
            "name": account.name,
            "type": account.account_type,
            "balance": round(account.balance, 2)
        })

    return {
        "imported": imported,
        "skipped": skipped,
        "duplicates": dupes,
        "accounts": account_summaries,
        "errors": []
    }


@router.post("/preview")
async def preview_ynab(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    contents = await file.read()
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    all_rows = list(reader)
    accounts = list(set(r.get("Account", "").strip() for r in all_rows if r.get("Account", "").strip()))
    preview_rows = [{k.strip(): v.strip() for k, v in row.items()} for row in all_rows[:5]]

    return {
        "headers": headers,
        "preview": preview_rows,
        "accounts": accounts,
        "total_rows": len(all_rows)
    }
