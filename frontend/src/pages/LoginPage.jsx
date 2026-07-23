import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { forgotPassword, parseApiError } from "../services/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleChange = (e) => {
    if (error) setError("");
    if (resetMessage) setResetMessage("");
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(`/chat${location.search}`);
    } catch (err) {
      setError(parseApiError(err) || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!form.email) {
      setError("Enter your email first, then click forgot password.");
      return;
    }
    setError("");
    try {
      const data = await forgotPassword(form.email);
      setResetMessage(data.message || "Reset request recorded.");
    } catch (err) {
      setError(parseApiError(err) || "Could not request password reset.");
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="text-lg font-semibold text-brand-bg">
            VOXO
          </Link>
          <p className="text-brand-bg/50 mt-2 text-sm">Welcome back</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-panel border border-white/[0.06] bg-brand-mid p-8 shadow-panel"
        >
          <h1 className="text-xl font-semibold text-brand-bg mb-6">Sign in to your account</h1>

          {resetMessage && (
            <div role="status" className="mb-5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-200">
              {resetMessage}
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 rounded-lg bg-red-500/15 border border-red-500/30 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <label className="block mb-4">
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              disabled={loading}
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className="ui-input text-sm"
            />
          </label>

          <label className="block mb-6">
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={loading}
              value={form.password}
              onChange={handleChange}
              placeholder="********"
              className="ui-input text-sm"
            />
          </label>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="mb-4 text-xs font-medium text-brand-accent hover:underline"
          >
            Forgot password?
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-control bg-brand-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-6 text-center text-sm text-brand-bg/50">
            No account?{" "}
            <Link
              to={`/signup${location.search}`}
              className="text-brand-accent hover:underline font-medium"
            >
              Create one free
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

