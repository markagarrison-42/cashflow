import { useState, useEffect } from "react";
import { apiFetch } from "../App";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState({ accounts: [], total_balance: 0 });
  const [monthly, setMonthly] = useState([]);
  const [byCat, setByCat] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [recentTx, setRecentTx] = useState([]);

  useEffect(() => {
    apiFetch("/api/accounts/").then(r => r.json()).then(setAccounts);
    apiFetch(`/api/transactions/summary/monthly?year=${new Date().getFullYear()}`)
      .then(r => r.json()).then(data => setMonthly(data.map(d => ({
        ...d, month: MONTHS[d.month - 1]
      }))));
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    apiFetch(`/api/transactions/summary/by-category?start_date=${firstOfMonth}`)
      .then(r => r.json()).then(d => setByCat(d.slice(0, 6)));
    apiFetch("/api/forecast/cashflow?days=30").then(r => r.json()).then(setForecast);
    apiFetch("/api/transactions/?limit=5").then(r => r.json()).then(d => setRecentTx(d.items || []));
  }, []);

  const thisMonth = monthly[new Date().getMonth()] || {};

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <span className="page-sub">{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
      </div>

      {/* Summary cards */}
      <div className="card-grid">
        <div className="stat-card primary">
          <div className="stat-label">Net Worth</div>
          <div className="stat-value">{fmt(accounts.total_balance)}</div>
          <div className="stat-sub">{accounts.accounts?.length} accounts</div>
        </div>
        <div className="stat-card income">
          <div className="stat-label">Income this month</div>
          <div className="stat-value">{fmt(thisMonth.income || 0)}</div>
        </div>
        <div className="stat-card expense">
          <div className="stat-label">Spending this month</div>
          <div className="stat-value">{fmt(thisMonth.expense || 0)}</div>
        </div>
        <div className="stat-card neutral">
          <div className="stat-label">30-day forecast</div>
          <div className={`stat-value ${forecast?.ending_balance < 0 ? "negative" : ""}`}>
            {forecast ? fmt(forecast.ending_balance) : "—"}
          </div>
          {forecast?.shortfall_days > 0 && (
            <div className="stat-warning">⚠ {forecast.shortfall_days} shortfall days</div>
          )}
        </div>
      </div>

      <div className="chart-grid">
        {/* Income vs Expense bar chart */}
        <div className="chart-card wide">
          <h3>Income vs Spending — {new Date().getFullYear()}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)" }} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="var(--green)" radius={[3,3,0,0]} />
              <Bar dataKey="expense" name="Expense" fill="var(--accent)" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Spending by category donut */}
        <div className="chart-card">
          <h3>Spending by Category</h3>
          {byCat.length === 0 ? (
            <div className="empty-chart">No transactions this month</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byCat} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85}>
                  {byCat.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)" }} />
                <Legend iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="chart-card">
        <h3>Recent Transactions</h3>
        {recentTx.length === 0 ? (
          <div className="empty-state">No transactions yet. Add one to get started.</div>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map(tx => (
                <tr key={tx.id}>
                  <td className="muted">{new Date(tx.date).toLocaleDateString()}</td>
                  <td>{tx.description || tx.merchant || "—"}</td>
                  <td><span className="cat-badge">{tx.category?.name || "—"}</span></td>
                  <td className={`right amount ${tx.transaction_type === "income" ? "pos" : "neg"}`}>
                    {tx.transaction_type === "income" ? "+" : "-"}{fmt(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
