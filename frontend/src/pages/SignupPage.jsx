import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { parseApiError } from "../services/api";

const LANGUAGE_OPTIONS = [
  { label: "Arabic", value: "ar" },
  { label: "Dutch", value: "nl" },
  { label: "English", value: "en" },
  { label: "German", value: "de" },
  { label: "Hindi", value: "hi" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Russian", value: "ru" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
];

const PRONOUN_OPTIONS = [
  { label: "Prefer not to say", value: "prefer not to say" },
  { label: "She/her", value: "she/her" },
  { label: "He/him", value: "he/him" },
  { label: "They/them", value: "they/them" },
  { label: "Custom", value: "custom" },
];

const VOICE_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "Feminine", value: "feminine" },
  { label: "Masculine", value: "masculine" },
  { label: "Neutral", value: "neutral" },
];

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "participant",
    preferred_language: "en",
    pronouns: "prefer not to say",
    custom_pronouns: "",
    voice_preference: "auto",
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
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        preferred_language: form.preferred_language,
        pronouns:
          form.pronouns === "custom" ? form.custom_pronouns : form.pronouns,
        voice_preference: form.voice_preference,
      });
      navigate(`/login${location.search}`, { replace: true });
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
          <Link to="/" className="text-lg font-semibold text-brand-bg">
            Translation Bot
          </Link>
          <p className="text-brand-bg/50 mt-2 text-sm">Create your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-panel border border-white/[0.06] bg-brand-mid p-8 shadow-panel"
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
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Name</span>
            <input
              name="name"
              type="text"
              required
              autoComplete="name"
              disabled={loading}
              value={form.name}
              onChange={handleChange}
              placeholder="Bhumika"
              className="ui-input text-sm"
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
              className="ui-input text-sm"
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
              className="ui-input text-sm"
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
                className="ui-input text-sm"
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
                className="ui-input text-sm"
              >
                <option value="participant">Participant</option>
                <option value="host">Host</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <label className="block">
              <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Pronouns</span>
              <select
                name="pronouns"
                value={form.pronouns}
                onChange={handleChange}
                disabled={loading}
                className="ui-input text-sm"
              >
                {PRONOUN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Voice</span>
              <select
                name="voice_preference"
                value={form.voice_preference}
                onChange={handleChange}
                disabled={loading}
                className="ui-input text-sm"
              >
                {VOICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {form.pronouns === "custom" && (
            <label className="block mb-6">
              <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">
                Custom pronouns
              </span>
              <input
                name="custom_pronouns"
                type="text"
                required
                disabled={loading}
                value={form.custom_pronouns}
                onChange={handleChange}
                placeholder="Your pronouns"
                className="ui-input text-sm"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-control bg-brand-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
