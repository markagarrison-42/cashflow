import { useState, useEffect } from "react";
import { apiFetch } from "../App";

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

const EMPTY = {
  account_id: "", category_id: "", name: "", amount: "", transaction_type: "expense",
  frequency: "monthly", start_date: new Date().toISOString().slice(0, 10), end_date: "", notes: ""
};

export default function Recurring() {
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch("/api/recurring/").then(r => r.json()).then(setRules);

  useEffect(() => {
    load();
    apiFetch("/api/accounts/").then(r => r.json()).then(d => setAccounts(d.accounts || []));
    apiFetch("/api/categories/").then(r => r.json()).then(setCategories);
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      account_id: parseInt(form.account_id),
      category_id: form.category_id ? parseInt(form.category_id) : null,
      start_date: new Date(form.start_date).toISOString(),
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
    };
    const res = await apiFetch(
      editId ? `/api/recurring/${editId}` : "/api/recurring/",
      { method: editId ? "PUT" : "POST", body: JSON.stringify(payload) }
    );
    if (res.ok) { setShowForm(false); setEditId(null); setForm(EMPTY); load(); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("Delete this recurring rule?")) return;
    await apiFetch(`/api/recurring/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (r) => {
    setForm({
      account_id: r.account_id, category_id: r.category_id || "",
      name: r.name, amount: r.amount, transaction_type: r.transaction_type,
      frequency: r.frequency, start_date: r.start_date.slice(0, 10),
      end_date: r.end_date ? r.end_date.slice(0, 10) : "", notes: r.notes || ""
    });
    setEditId(r.id);
    setShowForm(true);
  };

  const income = rules.filter(r => r.transaction_type === "income");
  const expenses = rules.filter(r => r.transaction_type === "expense");
  const monthlyExpense = expenses.reduce((sum, r) => {
    const m = { monthly: 1, quarterly: 1/3, yearly: 1/12, weekly: 4.33, biweekly: 2.17, daily: 30 };
    return sum + r.amount * (m[r.frequency] || 1);
  }, 0);

  const filteredCats = categories.filter(c =>
    form.transaction_type === "income" ? c.is_income : !c.is_income
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>Recurring</h2>
        <button className="btn primary" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY); }}>
          + Add recurring
        </button>
      </div>

      <div className="card-grid">
        <div className="stat-card expense">
          <div className="stat-label">Monthly expenses</div>
          <div className="stat-value">{fmt(monthlyExpense)}</div>
          <div className="stat-sub">{expenses.length} rules</div>
        </div>
        <div className="stat-card income">
          <div className="stat-label">Recurring income</div>
          <div className="stat-value">{income.length} sources</div>
        </div>
        <div className="stat-card neutral">
          <div className="stat-label">Total active rules</div>
          <div className="stat-value">{rules.length}</div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editId ? "Edit recurring rule" : "Add recurring rule"}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={save} className="form-grid">
              <div className="field full">
                <label>Name *</label>
                <input type="text" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rent, Netflix, Salary" />
              </div>
              <div className="field">
                <label>Type</label>
                <div className="type-toggle">
                  {["expense", "income"].map(t => (
                    <button key={t} type="button"
                      className={form.transaction_type === t ? "active" : ""}
                      onClick={() => setForm({ ...form, transaction_type: t, category_id: "" })}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Amount *</label>
                <input type="number" step="0.01" min="0" required value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Frequency *</label>
                <select required value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Account *</label>
                <select required value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                  <option value="">Select account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Category</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Start date *</label>
                <input type="date" required value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="field">
                <label>End date <span className="optional">(optional)</span></label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {[{ label: "Expenses", items: expenses }, { label: "Income", items: income }].map(group => (
        group.items.length > 0 && (
          <div key={group.label} className="chart-card">
            <h3>{group.label}</h3>
            <table className="tx-table">
              <thead>
                <tr><th>Name</th><th>Frequency</th><th>Account</th><th>Category</th><th>Next due</th><th className="right">Amount</th><th></th></tr>
              </thead>
              <tbody>
                {group.items.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td><span className="cat-badge">{FREQ_LABELS[r.frequency]}</span></td>
                    <td className="muted">{r.account?.name || "—"}</td>
                    <td>{r.category ? <span className="cat-badge" style={{ background: r.category.color + "22", color: r.category.color }}>{r.category.name}</span> : "—"}</td>
                    <td className="muted">{new Date(r.next_due).toLocaleDateString()}</td>
                    <td className={`right amount ${r.transaction_type === "income" ? "pos" : "neg"}`}>
                      {r.transaction_type === "income" ? "+" : "-"}{fmt(r.amount)}
                    </td>
                    <td className="row-actions">
                      <button onClick={() => edit(r)} title="Edit">✎</button>
                      <button onClick={() => del(r.id)} title="Delete" className="danger">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ))}

      {rules.length === 0 && (
        <div className="chart-card">
          <div className="empty-state">No recurring rules yet. Add your rent, salary, subscriptions — anything that repeats.</div>
        </div>
      )}
    </div>
  );
}
