import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../state/AdminAuthContext";

export default function LoginPage() {
  const { admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (admin) return <Navigate to="/admin/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/admin/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to sign in to the admin portal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <section className="admin-login-copy">
        <div className="admin-login-brand"><span>TB</span><strong>Translation Bot</strong></div>
        <div><p>Administration</p><h1>Operate the platform with clarity.</h1><span>Manage users, inspect meetings, review system health, and prepare future operational modules without entering the participant application.</span></div>
        <ul><li><ShieldCheck size={17} />Admin-role verification</li><li><LockKeyhole size={17} />Existing JWT authentication</li></ul>
      </section>
      <main className="admin-login-form-wrap">
        <form className="admin-login-form" onSubmit={submit}>
          <div className="admin-login-icon"><LockKeyhole size={23} /></div>
          <h2>Admin sign in</h2><p>Use an existing account with the admin role.</p>
          {error && <div className="admin-alert admin-alert--error">{error}</div>}
          <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></label>
          <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required autoComplete="current-password" /></label>
          <button type="submit" disabled={loading}>{loading ? "Verifying..." : "Sign in securely"}</button>
          <small>Non-admin accounts receive HTTP 403 and cannot enter the portal.</small>
        </form>
      </main>
    </div>
  );
}
