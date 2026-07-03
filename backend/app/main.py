from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, accounts, transactions, categories, forecast, recurring, imports
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CashFlow API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(forecast.router, prefix="/api/forecast", tags=["forecast"])
app.include_router(recurring.router, prefix="/api/recurring", tags=["recurring"])
app.include_router(imports.router, prefix="/api/import", tags=["import"])

@app.get("/api/health")
def health():
    return {"status": "ok"}

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(static_dir, "index.html"))
