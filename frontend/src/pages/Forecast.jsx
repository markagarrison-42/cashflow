import { useState, useEffect } from "react";
import { apiFetch } from "../App";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function Forecast() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/forecast/cashflow?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  // Thin out series for chart readability
  const chartData = data?.series?.filter((_, i) => i % (days > 60 ? 3 : 1) === 0) || [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Cash Flow Forecast</h2>
        <div className="day-toggle">
          {[30, 60, 90, 180, 365].map(d => (
            <button key={d} className={days === d ? "active" : ""} onClick={() => setDays(d)}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Calculating forecast...</div>
      ) : data ? (
        <>
          <div className="card-grid">
            <div className="stat-card primary">
              <div className="stat-label">Current balance</div>
              <div className="stat-value">{fmt(data.starting_balance)}</div>
            </div>
            <div className={`stat-card ${data.ending_balance >= data.starting_balance ? "income" : "expense"}`}>
              <div className="stat-label">Projected in {days} days</div>
              <div className="stat-value">{fmt(data.ending_balance)}</div>
            </div>
            <div className={`stat-card ${data.shortfall_days > 0 ? "expense" : "income"}`}>
              <div className="stat-label">Shortfall days</div>
              <div className="stat-value">{data.shortfall_days}</div>
              <div className="stat-sub">{data.shortfall_days > 0 ? "Days balance goes negative" : "No shortfalls projected"}</div>
            </div>
            <div className="stat-card neutral">
              <div className="stat-label">Lowest point</div>
              <div className={`stat-value ${data.lowest_balance < 0 ? "negative" : ""}`}>
                {fmt(data.lowest_balance)}
              </div>
              <div className="stat-sub">{data.lowest_balance_date}</div>
            </div>
          </div>

          <div className="chart-card">
            <h3>Projected Balance Over {days} Days</h3>
            <p className="chart-note">Based on active recurring income and expenses. Actual results depend on variable spending.</p>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-muted)"
                  tickFormatter={d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "8px" }}
                  formatter={(v, name) => [fmt(v), name === "balance" ? "Balance" : name]}
                  labelFormatter={d => new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                />
                <ReferenceLine y={0} stroke="var(--red)" strokeDasharray="4 2" label={{ value: "$0", position: "right", fontSize: 11 }} />
                <Area type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={2} fill="url(#balGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Upcoming events */}
          <div className="chart-card">
            <h3>Upcoming Payments (next 14 days)</h3>
            <table className="tx-table">
              <thead>
                <tr><th>Date</th><th>Name</th><th>Category</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {data.series
                  .slice(0, 14)
                  .flatMap(day => day.events.map(e => ({ ...e, date: day.date })))
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map((e, i) => (
                    <tr key={i}>
                      <td className="muted">{new Date(e.date).toLocaleDateString()}</td>
                      <td>{e.name}</td>
                      <td><span className="cat-badge">{e.category}</span></td>
                      <td className={`right amount ${e.type === "income" ? "pos" : "neg"}`}>
                        {e.type === "income" ? "+" : "-"}{fmt(e.amount)}
                      </td>
                    </tr>
                  ))}
                {data.series.slice(0, 14).every(d => d.events.length === 0) && (
                  <tr><td colSpan={4} className="empty-state">No recurring items in the next 14 days.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
