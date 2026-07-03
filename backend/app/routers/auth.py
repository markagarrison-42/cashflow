from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app import models, auth

router = APIRouter()


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str | None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


@router.post("/register", response_model=Token)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=payload.email,
        hashed_password=auth.hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed default categories
    _seed_categories(user.id, db)

    token = auth.create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = auth.create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


def _seed_categories(user_id: int, db: Session):
    defaults = [
        ("Housing", "#6366f1", "home", False),
        ("Food & Dining", "#f59e0b", "utensils", False),
        ("Transportation", "#3b82f6", "car", False),
        ("Healthcare", "#ef4444", "heart", False),
        ("Entertainment", "#8b5cf6", "tv", False),
        ("Shopping", "#ec4899", "shopping-bag", False),
        ("Utilities", "#14b8a6", "zap", False),
        ("Insurance", "#64748b", "shield", False),
        ("Savings", "#22c55e", "piggy-bank", False),
        ("Salary", "#10b981", "briefcase", True),
        ("Freelance", "#06b6d4", "code", True),
        ("Investment", "#84cc16", "trending-up", True),
        ("Other Income", "#a3e635", "plus-circle", True),
        ("Other Expense", "#94a3b8", "minus-circle", False),
    ]
    for name, color, icon, is_income in defaults:
        db.add(models.Category(
            user_id=user_id, name=name, color=color,
            icon=icon, is_income=is_income, is_default=True
        ))
    db.commit()
