import { useState, useEffect } from "react";
import { apiFetch } from "../App";
import ImportYNAB from "../components/ImportYNAB";

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const EMPTY_FORM = {
  account_id: "", category_id: "", amount: "", transaction_type: "expense",
  description: "", merchant: "", date: new Date().toISOString().slice(0, 10), notes: ""
};

const STATUS_ICONS = { uncleared: "○", cleared: "◉", reconciled: "✓" };
const STATUS_COLORS = { uncleared: "var(--text-dim)", cleared: "var(--green)", reconciled: "var(--accent)" };
const STATUS_NEXT = { uncleared: "cleared", cleared: "reconciled", reconciled: "uncleared" };
const STATUS_LABELS = { uncleared: "Uncleared", cleared: "Cleared", reconciled: "Reconciled" };

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <span style={{ color: "var(--text-dim)", marginLeft: 4 }}>⇅</span>;
  return <span style={{ color: "var(--accent)", marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

export default function Transactions() {
  const [txs, setTxs] = useState({ total: 0, items: [] });
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filters, setFilters] = useState({ type: "", account_id: "" });
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showFuture, setShowFuture] = useState(true);

  const load = () => {
    const params = new URLSearchParams({ limit: "200" });
    if (filters.type) params.set("transaction_type", filters.type);
    if (filters.account_id) params.set("account_id", filters.account_id);
    apiFetch(`/api/transactions/?${params}`).then(r => r.json()).then(setTxs);
  };

  useEffect(() => {
    apiFetch("/api/accounts/").then(r => r.json()).then(d => setAccounts(d.accounts || []));
    apiFetch("/api/categories/").then(r => r.json()).then(setCategories);
  }, []);

  useEffect(() => { load(); }, [filters]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...(txs.items || [])].sort((a, b) => {
    let av, bv;
    if (sortCol === "date") { av = new Date(a.date); bv = new Date(b.date); }
    else if (sortCol === "amount") { av = a.amount; bv = b.amount; }
    else if (sortCol === "description") { av = (a.description || a.merchant || "").toLowerCase(); bv = (b.description || b.merchant || "").toLowerCase(); }
    else if (sortCol === "account") { av = (a.account?.name || "").toLowerCase(); bv = (b.account?.name || "").toLowerCase(); }
    else if (sortCol === "category") { av = (a.category?.name || "").toLowerCase(); bv = (b.category?.name || "").toLowerCase(); }
    else if (sortCol === "status") { av = a.status || "uncleared"; bv = b.status || "uncleared"; }
    else { av = a[sortCol]; bv = b[sortCol]; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    // Secondary sort: always sort by date desc within same group
    return new Date(b.date) - new Date(a.date);
  });

  // Default view: sort by account name, then date desc within each account
  const defaultSorted = sortCol === "date" 
    ? [...sorted].sort((a, b) => {
        const acctA = (a.account?.name || "").toLowerCase();
        const acctB = (b.account?.name || "").toLowerCase();
        if (acctA < acctB) return -1;
        if (acctA > acctB) return 1;
        return new Date(b.date) - new Date(a.date);
      })
    : sorted;

  const pastTxs = defaultSorted.filter(tx => { const d = new Date(tx.date); d.setHours(0,0,0,0); return d <= today; });
  const futureTxs = defaultSorted.filter(tx => { const d = new Date(tx.date); d.setHours(0,0,0,0); return d > today; });

  const cycleStatus = async (tx) => {
    if (tx.status === "reconciled") return;
    const nextStatus = STATUS_NEXT[tx.status || "uncleared"];
    await apiFetch(`/api/transactions/${tx.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: nextStatus })
    });
    load();
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      account_id: parseInt(form.account_id),
      category_id: form.category_id ? parseInt(form.category_id) : null,
      date: new Date(form.date).toISOString(),
    };
    const res = await apiFetch(
      editId ? `/api/transactions/${editId}` : "/api/transactions/",
      { method: editId ? "PUT" : "POST", body: JSON.stringify(payload) }
    );
    if (res.ok) { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); load(); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (tx) => {
    if (tx.status === "reconciled") return;
    setForm({
      account_id: tx.account_id,
      category_id: tx.category_id || "",
      amount: tx.amount,
      transaction_type: tx.transaction_type,
      description: tx.description || "",
      merchant: tx.merchant || "",
      date: tx.date.slice(0, 10),
      notes: tx.notes || "",
    });
    setEditId(tx.id);
    setShowForm(true);
  };

  const filteredCats = categories.filter(c =>
    form.transaction_type === "income" ? c.is_income : !c.is_income
  );

  const thStyle = { cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };

  const TxRow = ({ tx }) => {
    const status = tx.status || "uncleared";
    const isReconciled = status === "reconciled";
    return (
      <tr>
        <td>
          <button onClick={() => cycleStatus(tx)}
            title={isReconciled ? "Reconciled — locked" : `Mark as ${STATUS_NEXT[status]}`}
            style={{ background: "none", border: "none", cursor: isReconciled ? "default" : "pointer", color: STATUS_COLORS[status], fontSize: 16, padding: "0 4px" }}>
            {STATUS_ICONS[status]}
          </button>
        </td>
        <td className="muted">{new Date(tx.date).toLocaleDateString()}</td>
        <td style={{ color: isReconciled ? "var(--text-muted)" : "inherit" }}>
          <div>{tx.description || tx.merchant || "—"}</div>
          {tx.merchant && tx.description && <div className="muted small">{tx.merchant}</div>}
        </td>
        <td className="muted">{tx.account?.name || "—"}</td>
        <td>{tx.category ? <span className="cat-badge" style={{ background: tx.category.color + "22", color: tx.category.color }}>{tx.category.name}</span> : "—"}</td>
        <td className={"right amount " + (tx.transaction_type === "income" ? "pos" : "neg")}>
          {tx.transaction_type === "income" ? "+" : "-"}{fmt(tx.amount)}
        </td>
        <td className="row-actions">
          {!isReconciled && <button onClick={() => edit(tx)} title="Edit">✎</button>}
          {!isReconciled && <button onClick={() => del(tx.id)} title="Delete" className="danger">✕</button>}
          {isReconciled && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>locked</span>}
        </td>
      </tr>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Transactions</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn secondary" onClick={() => setShowImport(true)}>↑ Import YNAB</button>
          <button className="btn primary" onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); }}>+ Add</button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select value={filters.account_id} onChange={e => setFilters({ ...filters, account_id: e.target.value })}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="result-count">{txs.total} transactions</span>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 12 }}>
          {Object.entries(STATUS_LABELS).map(([s, l]) => (
            <span key={s}><span style={{ color: STATUS_COLORS[s] }}>{STATUS_ICONS[s]}</span> {l}</span>
          ))}
        </div>
      </div>

      {showImport && <ImportYNAB onClose={() => setShowImport(false)} onImported={load} />}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editId ? "Edit transaction" : "Add transaction"}</h3>
              <button className="close-btn" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={save} className="form-grid">
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
                <label>Date *</label>
                <input type="date" required value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="field">
                <label>Description</label>
                <input type="text" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was this for?" />
              </div>
              <div className="field">
                <label>Merchant</label>
                <input type="text" value={form.merchant}
                  onChange={e => setForm({ ...form, merchant: e.target.value })} placeholder="Where?" />
              </div>
              <div className="field full">
                <label>Notes</label>
                <textarea value={form.notes} rows={2}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Saving..." : editId ? "Save changes" : "Add transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="chart-card">
        {sorted.length === 0 ? (
          <div className="empty-state">No transactions found.</div>
        ) : (
          <table className="tx-table">
            <thead>
              <tr>
                <th style={{ width: 28 }} title="Status">S</th>
                <th style={thStyle} onClick={() => handleSort("date")}>Date <SortIcon col="date" sortCol={sortCol} sortDir={sortDir} /></th>
                <th style={thStyle} onClick={() => handleSort("description")}>Description <SortIcon col="description" sortCol={sortCol} sortDir={sortDir} /></th>
                <th style={thStyle} onClick={() => handleSort("account")}>Account <SortIcon col="account" sortCol={sortCol} sortDir={sortDir} /></th>
                <th style={thStyle} onClick={() => handleSort("category")}>Category <SortIcon col="category" sortCol={sortCol} sortDir={sortDir} /></th>
                <th className="right" style={thStyle} onClick={() => handleSort("amount")}>Amount <SortIcon col="amount" sortCol={sortCol} sortDir={sortDir} /></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* Future transactions at top when sorted by date desc */}
              {futureTxs.length > 0 && (
                <>
                  <tr>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <button
                        onClick={() => setShowFuture(!showFuture)}
                        style={{
                          width: "100%", padding: "7px 10px", background: "var(--accent-dim)",
                          border: "none", borderBottom: "2px solid var(--accent)", cursor: "pointer",
                          color: "var(--accent)", fontSize: 11, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "left",
                          display: "flex", justifyContent: "space-between"
                        }}>
                        <span>↑ Future / Planned ({futureTxs.length})</span>
                        <span>{showFuture ? "▲ Collapse" : "▼ Expand"}</span>
                      </button>
                    </td>
                  </tr>
                  {showFuture && futureTxs.map(tx => <TxRow key={tx.id} tx={tx} />)}
                  <tr>
                    <td colSpan={7} style={{ padding: "4px 10px", background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        ── Today & Past ──
                      </span>
                    </td>
                  </tr>
                </>
              )}
              {pastTxs.map(tx => <TxRow key={tx.id} tx={tx} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
