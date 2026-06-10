import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { parseApiError } from "../services/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    if (error) setError("");
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/chat");
    } catch (err) {
      setError(parseApiError(err) || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-bold text-brand-bg tracking-tight">
            Translation_Bot
          </Link>
          <p className="text-brand-bg/50 mt-2 text-sm">Welcome back</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-brand-mid rounded-2xl p-8 shadow-2xl border border-white/10"
        >
          <h1 className="text-xl font-semibold text-brand-bg mb-6">Sign in to your account</h1>

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
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
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
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-accent text-brand-bg py-3 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-6 text-center text-sm text-brand-bg/50">
            No account?{" "}
            <Link to="/signup" className="text-brand-accent hover:underline font-medium">
              Create one free
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
