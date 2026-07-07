import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAdminAuth } from "../state/AdminAuthContext";

export default function LoginPage() {
  const { admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
        <ul><li><ShieldCheck size={17} />Admin-role verification</li><li><LockKeyhole size={17} />Isolated admin sessions</li></ul>
      </section>
      <main className="admin-login-form-wrap">
        <form className="admin-login-form" onSubmit={submit}>
          <div className="admin-login-icon"><LockKeyhole size={23} /></div>
          <h2>Admin sign in</h2><p>Use an existing account with the admin role.</p>
          {searchParams.get("registered") === "1" && <div className="admin-alert">Administrator registered. You can now sign in.</div>}
          {error && <div className="admin-alert admin-alert--error">{error}</div>}
          <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></label>
          <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required autoComplete="current-password" /></label>
          <button type="submit" disabled={loading}>{loading ? "Verifying..." : "Sign in securely"}</button>
          <small>Need an administrator account? <Link to="/admin/signup">Register with an authorized code</Link></small>
          <small>Admin tokens are stored in protected cookies and cannot authorize the user application.</small>
        </form>
      </main>
    </div>
  );
}
