import { useState, useEffect, createContext, useContext } from "react";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Forecast from "./pages/Forecast";
import Recurring from "./pages/Recurring";
import Accounts from "./pages/Accounts";
import Login from "./pages/Login";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function apiFetch(path, options = {}) {
  const token = localStorage.getItem("cf_token");
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");

  useEffect(() => {
    const token = localStorage.getItem("cf_token");
    if (!token) { setLoading(false); return; }
    apiFetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setUser(u); })
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("cf_token", token);
    setUser(userData);
    setPage("dashboard");
  };

  const logout = () => {
    localStorage.removeItem("cf_token");
    setUser(null);
    setPage("dashboard");
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  );

  if (!user) return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <Login />
    </AuthContext.Provider>
  );

  const pages = {
    dashboard: <Dashboard />,
    transactions: <Transactions />,
    forecast: <Forecast />,
    recurring: <Recurring />,
    accounts: <Accounts />,
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <div className="app-shell">
        <Sidebar page={page} setPage={setPage} user={user} logout={logout} />
        <main className="main-content">
          {pages[page] || <Dashboard />}
        </main>
      </div>
    </AuthContext.Provider>
  );
}

function Sidebar({ page, setPage, user, logout }) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "⬡" },
    { id: "transactions", label: "Transactions", icon: "↕" },
    { id: "recurring", label: "Recurring", icon: "↺" },
    { id: "forecast", label: "Forecast", icon: "◈" },
    { id: "accounts", label: "Accounts", icon: "◻" },
  ];

  return (
    <nav className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-mark">⬡</span>
          {!collapsed && <span className="logo-text">CashFlow</span>}
        </div>
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <ul className="nav-list">
        {navItems.map(item => (
          <li key={item.id}>
            <button
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
              title={collapsed ? item.label : ""}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="user-info">
            <div className="user-avatar">{user.email[0].toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{user.full_name || user.email}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
        )}
        <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
      </div>
    </nav>
  );
}
