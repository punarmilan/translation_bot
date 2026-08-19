import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useConfig } from "../contexts/ConfigContext";
import { parseApiError, resetPassword } from "../services/api";

export default function ResetPasswordPage() {
  const { branding } = useConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleChange = (e) => {
    if (error) setError("");
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!token) {
      setError("This reset link is missing its token. Request a new one from the sign-in page.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await resetPassword(token, form.password);
      setDone(true);
    } catch (err) {
      setError(parseApiError(err) || "Could not reset your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-lg font-semibold text-brand-bg">
            {branding.logo_url && <img src={branding.logo_url} alt={branding.product_name || "VOXO"} className="h-7 w-auto" />}
            {branding.product_name || "VOXO"}
          </Link>
          <p className="text-brand-bg/50 mt-2 text-sm">Reset your password</p>
        </div>

        <div className="rounded-panel border border-white/[0.06] bg-brand-mid p-8 shadow-panel">
          {done ? (
            <div className="space-y-5 text-center">
              <div role="status" className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-200">
                Your password has been reset. You can now sign in with your new password.
              </div>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="w-full rounded-control bg-brand-accent py-3 text-sm font-semibold text-white hover:brightness-110"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1 className="text-xl font-semibold text-brand-bg mb-6">Choose a new password</h1>

              {!token && (
                <div role="alert" className="mb-5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-4 py-3 text-sm text-amber-200">
                  No reset token was found in this link. Request a new one from the sign-in page.
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
                <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">New password</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  disabled={loading}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="********"
                  className="ui-input text-sm"
                />
              </label>

              <label className="block mb-6">
                <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">Confirm new password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  disabled={loading}
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="********"
                  className="ui-input text-sm"
                />
              </label>

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full rounded-control bg-brand-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>

              <p className="mt-6 text-center text-sm text-brand-bg/50">
                Remembered it?{" "}
                <Link to="/login" className="text-brand-accent hover:underline font-medium">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
