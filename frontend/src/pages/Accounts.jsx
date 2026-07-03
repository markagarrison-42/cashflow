import { useState, useEffect } from "react";
import { apiFetch } from "../App";

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const TYPE_ICONS = { checking: "◻", savings: "◈", credit: "◉", investment: "◆", loan: "◈" };
const TYPE_LABELS = { checking: "Checking", savings: "Savings", credit: "Credit Cards", investment: "Investments", loan: "Loans" };
const TYPE_ORDER = ["checking", "savings", "investment", "credit", "loan"];
const EMPTY = { name: "", account_type: "checking", balance: "", currency: "USD" };

export default function Accounts() {
  const [data, setData] = useState({ accounts: [], total_balance: 0 });
  const [archived, setArchived] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    apiFetch("/api/accounts/").then(r => r.json()).then(setData);
    apiFetch("/api/accounts/?include_archived=true").then(r => r.json()).then(d => {
      setArchived((d.accounts || []).filter(a => !a.is_active));
    });
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, balance: parseFloat(form.balance || 0) };
    const res = await apiFetch(
      editId ? `/api/accounts/${editId}` : "/api/accounts/",
      { method: editId ? "PUT" : "POST", body: JSON.stringify(payload) }
    );
    if (res.ok) { setShowForm(false); setEditId(null); setForm(EMPTY); load(); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    await apiFetch(`/api/accounts/${deleting}`, { method: "DELETE" });
    setDeleting(null);
    load();
  };

  const restore = async (id) => {
    await apiFetch(`/api/accounts/${id}/restore`, { method: "POST" });
    load();
  };

  const edit = (a) => {
    setForm({ name: a.name, account_type: a.account_type, balance: a.balance, currency: a.currency });
    setEditId(a.id);
    setShowForm(true);
  };

  const grouped = data.accounts.reduce((acc, a) => {
    const type = a.account_type || "checking";
    if (!acc[type]) acc[type] = [];
    acc[type].push(a);
    return acc;
  }, {});

  const assets = data.accounts
    .filter(a => ["checking", "savings", "investment"].includes(a.account_type))
    .reduce((s, a) => s + a.balance, 0);
  const liabilities = data.accounts
    .filter(a => ["credit", "loan"].includes(a.account_type))
    .reduce((s, a) => s + Math.abs(a.balance < 0 ? a.balance : -a.balance), 0);
  const netWorth = assets - liabilities;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Accounts</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {archived.length > 0 && (
            <button className="btn secondary" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "Hide archived" : "Archived (" + archived.length + ")"}
            </button>
          )}
          <button className="btn primary" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY); }}>
            + Add account
          </button>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card primary">
          <div className="stat-label">Net Worth</div>
          <div className={"stat-value" + (netWorth < 0 ? " negative" : "")}>{fmt(netWorth)}</div>
          <div className="stat-sub">{data.accounts.length} accounts</div>
        </div>
        <div className="stat-card income">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{fmt(assets)}</div>
          <div className="stat-sub">Cash + investments</div>
        </div>
        <div className="stat-card expense">
          <div className="stat-label">Total Liabilities</div>
          <div className="stat-value">{fmt(liabilities)}</div>
          <div className="stat-sub">Cards + loans</div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editId ? "Edit account" : "Add account"}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={save} className="form-grid">
              <div className="field full">
                <label>Account name *</label>
                <input type="text" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Chase Checking" />
              </div>
              <div className="field">
                <label>Type *</label>
                <select required value={form.account_type}
                  onChange={e => setForm({ ...form, account_type: e.target.value })}>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="investment">Investment</option>
                  <option value="credit">Credit Card</option>
                  <option value="loan">Loan</option>
                </select>
              </div>
              <div className="field">
                <label>Current balance</label>
                <input type="number" step="0.01" value={form.balance}
                  onChange={e => setForm({ ...form, balance: e.target.value })}
                  placeholder="0.00" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Archive account?</h3>
              <button className="close-btn" onClick={() => setDeleting(null)}>✕</button>
            </div>
            <div style={{ padding: "20px" }}>
              <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
                This account will be hidden but its transactions will be kept. You can restore it later.
              </p>
              <div className="form-actions">
                <button className="btn secondary" onClick={() => setDeleting(null)}>Cancel</button>
                <button className="btn primary" style={{ background: "var(--red)" }} onClick={confirmDelete}>Archive</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {TYPE_ORDER.map(type => {
        const accts = grouped[type] || [];
        if (!accts.length) return null;
        const total = accts.reduce((s, a) => s + a.balance, 0);
        return (
          <div key={type} className="chart-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{TYPE_ICONS[type]} {TYPE_LABELS[type]}</h3>
              <span className={"amount " + (total < 0 ? "neg" : "pos")} style={{ fontSize: 15, fontWeight: 700 }}>{fmt(total)}</span>
            </div>
            <table className="tx-table">
              <thead>
                <tr><th>Account</th><th className="right">Balance</th><th style={{ width: 80 }}></th></tr>
              </thead>
              <tbody>
                {accts.map(a => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td className={"right amount " + (a.balance < 0 ? "neg" : "pos")}>{fmt(a.balance)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button onClick={() => edit(a)} style={{ background: "none", border: "none", color: "var(--text-muted)", padding: "4px 8px", cursor: "pointer", fontSize: 14 }}>✎</button>
                      <button onClick={() => setDeleting(a.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", padding: "4px 8px", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {showArchived && archived.length > 0 && (
        <div className="chart-card" style={{ opacity: 0.8 }}>
          <h3 style={{ color: "var(--text-muted)" }}>Archived accounts</h3>
          <table className="tx-table">
            <thead>
              <tr><th>Account</th><th>Type</th><th className="right">Balance</th><th style={{ width: 80 }}></th></tr>
            </thead>
            <tbody>
              {archived.map(a => (
                <tr key={a.id}>
                  <td style={{ color: "var(--text-muted)" }}>{a.name}</td>
                  <td><span className="cat-badge">{TYPE_LABELS[a.account_type] || a.account_type}</span></td>
                  <td className="right muted">{fmt(a.balance)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => restore(a.id)} style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.accounts.length === 0 && (
        <div className="chart-card">
          <div className="empty-state">No accounts yet. Add one to get started.</div>
        </div>
      )}
    </div>
  );
}
