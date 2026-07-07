import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getAdminRegistrationStatus, registerAdmin } from "../services/api";
import { useAdminAuth } from "../state/AdminAuthContext";

export default function SignupPage() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("checking");
  const [enabled, setEnabled] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "", registration_code: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAdminRegistrationStatus()
      .then((result) => { setMode(result.mode); setEnabled(result.registration_enabled); })
      .catch(() => setMode("unknown"));
  }, []);
  if (admin) return <Navigate to="/admin/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      await registerAdmin(form);
      navigate("/admin/login?registered=1", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Administrator registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="admin-login-page">
    <section className="admin-login-copy">
      <div className="admin-login-brand"><span>TB</span><strong>Translation Bot</strong></div>
      <div><p>Controlled access</p><h1>Create an administrator account.</h1><span>The first administrator uses the private bootstrap code configured on the server. Later administrators need a one-time invitation from Roles & Permissions.</span></div>
      <ul><li><ShieldCheck size={17} />No public admin signup</li><li><KeyRound size={17} />One-time authorization code</li></ul>
    </section>
    <main className="admin-login-form-wrap">
      <form className="admin-login-form admin-signup-form" onSubmit={submit}>
        <div className="admin-login-icon"><UserPlus size={23} /></div>
        <h2>Register administrator</h2>
        <p>{mode === "bootstrap" ? "Enter the bootstrap code from the admin backend environment." : mode === "invite_only" ? "Enter the invitation code provided by an existing administrator." : "Enter the authorized registration code provided for this admin environment."}</p>
        {!enabled && <div className="admin-alert admin-alert--error">Initial registration is disabled. Configure ADMIN_BOOTSTRAP_CODE on the admin backend.</div>}
        {error && <div className="admin-alert admin-alert--error">{error}</div>}
        <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoComplete="name" /></label>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></label>
        <label>Password<input type="password" minLength="10" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required autoComplete="new-password" /></label>
        <label>{mode === "bootstrap" ? "Bootstrap code" : mode === "invite_only" ? "Invitation code" : "Registration code"}<input type="password" value={form.registration_code} onChange={(event) => setForm({ ...form, registration_code: event.target.value })} required autoComplete="off" /></label>
        <button type="submit" disabled={loading || !enabled}>{loading ? "Creating account..." : "Create admin account"}</button>
        <small>Already registered? <Link to="/admin/login">Return to admin sign in</Link></small>
      </form>
    </main>
  </div>;
}
