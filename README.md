# CashFlow

Personal expense tracker with cash flow forecasting. FastAPI backend + React frontend.

---

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Deploy to PythonAnywhere

### 1. Upload code
```bash
# From your machine
zip -r cashflow.zip cashflow/
# Upload via PA Files tab, then:
unzip cashflow.zip
```

### 2. Backend (FastAPI via WSGI)
```bash
cd ~/cashflow/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

In PA Web tab:
- Source code: `/home/YOURUSERNAME/cashflow/backend`
- WSGI file: edit to match `wsgi.py` contents
- Virtualenv: `/home/YOURUSERNAME/cashflow/backend/venv`

### 3. Environment variables
Create `backend/.env`:
```
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
DATABASE_URL=postgresql://YOURUSERNAME:PASSWORD@YOURUSERNAME.postgres.pythonanywhere-services.com/cashflow
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_sandbox_secret
PLAID_ENV=sandbox
```

### 4. Frontend build
```bash
cd ~/cashflow/frontend
npm install
VITE_API_URL=https://YOURUSERNAME.pythonanywhere.com npm run build
```

Serve the `dist/` folder as a static site from PA, or host on Netlify/Vercel pointing at your PA API.

### 5. PostgreSQL on PA
- In PA Databases tab → PostgreSQL → create database named `cashflow`
- Use the connection string format above

---

## Plaid Setup

1. Sign up at https://dashboard.plaid.com
2. Create an app, get sandbox credentials
3. Add to `.env`
4. Plaid Link integration is ready to wire into the Accounts page

---

## What's built

- Auth: JWT login/register, bcrypt passwords, 7-day tokens
- Accounts: manual account management, balance tracking
- Transactions: full CRUD, filtering, monthly + category summaries
- Recurring rules: daily/weekly/biweekly/monthly/quarterly/yearly
- Forecast: day-by-day cash flow projection up to 365 days, shortfall detection
- Charts: income vs expense bar chart, spending by category donut, forecast area chart
- Mobile responsive: works on phone and desktop

## Next steps

- [ ] Wire in Plaid Link for bank import
- [ ] CSV import endpoint
- [ ] Budget targets per category
- [ ] Email/push alerts for shortfall forecasts
- [ ] Export to CSV/PDF
