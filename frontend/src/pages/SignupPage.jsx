import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { parseApiError } from "../services/api";

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Japanese", value: "ja" },
];

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "participant",
    preferred_language: "en",
  });
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
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signup(
        form.username,
        form.email,
        form.password,
        form.role,
        form.preferred_language
      );
      navigate("/chat");
    } catch (err) {
      setError(parseApiError(err) || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-bold text-brand-bg tracking-tight">
            LinguaLink
          </Link>
          <p className="text-brand-bg/50 mt-2 text-sm">Create your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-brand-mid rounded-2xl p-8 shadow-2xl border border-white/10"
        >
          <h1 className="text-xl font-semibold text-brand-bg mb-6">Get started for free</h1>

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
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Username</span>
            <input
              name="username"
              type="text"
              required
              autoComplete="username"
              disabled={loading}
              value={form.username}
              onChange={handleChange}
              placeholder="Bhumika"
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
            />
          </label>

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

          <label className="block mb-4">
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              disabled={loading}
              value={form.password}
              onChange={handleChange}
              placeholder="Min. 6 characters"
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
            />
          </label>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <label className="block">
              <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Language</span>
              <select
                name="preferred_language"
                value={form.preferred_language}
                onChange={handleChange}
                disabled={loading}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none focus:border-brand-accent transition"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Role</span>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                disabled={loading}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none focus:border-brand-accent transition"
              >
                <option value="participant">Participant</option>
                <option value="host">Host</option>
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-accent text-brand-bg py-3 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="mt-6 text-center text-sm text-brand-bg/50">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-accent hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
