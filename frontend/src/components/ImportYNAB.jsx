import { useState, useRef } from "react";
import { apiFetch } from "../App";

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function ImportYNAB({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const handleFile = async (f) => {
    if (!f || !f.name.endsWith(".csv")) {
      setError("Please select a CSV file exported from YNAB.");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);

    const form = new FormData();
    form.append("file", f);
    const res = await apiFetch("/api/import/preview", { method: "POST", body: form, headers: {} });
    if (res.ok) {
      const data = await res.json();
      setPreview(data);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const doImport = async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }
    setLoading(true);
    setError("");

    const form = new FormData();
    form.append("file", file);

    const res = await apiFetch("/api/import/ynab", { method: "POST", body: form, headers: {} });
    const data = await res.json();

    if (!res.ok) {
      setError(data.detail || "Import failed.");
    } else {
      setResult(data);
      onImported && onImported();
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import from YNAB</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "20px" }}>
          {!result ? (
            <>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
                In YNAB: click your budget name → <strong>Export Budget</strong> → unzip and upload the <strong>register.csv</strong> file. Accounts will be created automatically.
              </p>

              <div
                className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={e => handleFile(e.target.files[0])}
                />
                {file ? (
                  <div className="drop-zone-content">
                    <div className="drop-icon">✓</div>
                    <div className="drop-filename">{file.name}</div>
                    <div className="drop-sub">Click to change file</div>
                  </div>
                ) : (
                  <div className="drop-zone-content">
                    <div className="drop-icon">↑</div>
                    <div className="drop-label">Drop your YNAB register.csv here</div>
                    <div className="drop-sub">or click to browse</div>
                  </div>
                )}
              </div>

              {preview && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    Found <strong style={{ color: "var(--text)" }}>{preview.total_rows} transactions</strong> across <strong style={{ color: "var(--text)" }}>{preview.accounts.length} accounts</strong>: {preview.accounts.join(", ")}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tx-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["Account", "Date", "Payee", "Category Group/Category", "Outflow", "Inflow"].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, i) => (
                          <tr key={i}>
                            <td>{row["Account"] || "—"}</td>
                            <td>{row["Date"] || "—"}</td>
                            <td>{row["Payee"] || "—"}</td>
                            <td>{row["Category Group/Category"] || row["Category"] || "—"}</td>
                            <td className="neg">{row["Outflow"] || "—"}</td>
                            <td className="pos">{row["Inflow"] || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}

              <div className="form-actions" style={{ marginTop: 20 }}>
                <button className="btn secondary" onClick={onClose}>Cancel</button>
                <button
                  className="btn primary"
                  onClick={doImport}
                  disabled={loading || !file}
                >
                  {loading ? "Importing..." : `Import ${preview ? preview.total_rows + " transactions" : ""}`}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
              <h3 style={{ marginBottom: 8 }}>Import complete</h3>
              <div className="card-grid" style={{ marginTop: 20, textAlign: "left" }}>
                <div className="stat-card income">
                  <div className="stat-label">Imported</div>
                  <div className="stat-value">{result.imported}</div>
                  <div className="stat-sub">transactions</div>
                </div>
                <div className="stat-card neutral">
                  <div className="stat-label">Skipped</div>
                  <div className="stat-value">{result.skipped}</div>
                  <div className="stat-sub">empty/invalid rows</div>
                </div>
              </div>

              {result.accounts?.length > 0 && (
                <div style={{ marginTop: 20, textAlign: "left" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Account balances after import</div>
                  <table className="tx-table">
                    <thead>
                      <tr><th>Account</th><th>Type</th><th className="right">Balance</th></tr>
                    </thead>
                    <tbody>
                      {result.accounts.map((a, i) => (
                        <tr key={i}>
                          <td>{a.name}</td>
                          <td><span className="cat-badge">{a.type}</span></td>
                          <td className={`right amount ${a.balance < 0 ? "neg" : "pos"}`}>{fmt(a.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.errors?.length > 0 && (
                <div style={{ marginTop: 16, textAlign: "left" }}>
                  <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 6 }}>Warnings:</div>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "var(--text-muted)" }}>{e}</div>
                  ))}
                </div>
              )}

              <button className="btn primary" style={{ marginTop: 24 }} onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
