import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
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

function optionValueForPronouns(pronouns) {
  if (!pronouns) return "prefer not to say";
  return PRONOUN_OPTIONS.some((option) => option.value === pronouns)
    ? pronouns
    : "custom";
}

export default function ProfilePage() {
  const { user, loading, updateProfile } = useAuth();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    preferred_language: user?.preferred_language || "en",
    pronouns: optionValueForPronouns(user?.pronouns),
    custom_pronouns: optionValueForPronouns(user?.pronouns) === "custom" ? user.pronouns : "",
    voice_preference: user?.voice_preference || "auto",
  }));

  useEffect(() => {
    if (!user) return;
    const pronounValue = optionValueForPronouns(user.pronouns);
    setForm({
      preferred_language: user.preferred_language || "en",
      pronouns: pronounValue,
      custom_pronouns: pronounValue === "custom" ? user.pronouns : "",
      voice_preference: user.voice_preference || "auto",
    });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <span className="text-brand-bg/40 text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const handleChange = (event) => {
    setError("");
    setStatus("");
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await updateProfile({
        preferred_language: form.preferred_language,
        pronouns: form.pronouns === "custom" ? form.custom_pronouns : form.pronouns,
        voice_preference: form.voice_preference,
      });
      setStatus("Profile updated.");
    } catch (err) {
      setError(parseApiError(err) || "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-panel border border-white/[0.06] bg-brand-mid p-8 shadow-panel"
      >
        <div className="flex items-start justify-between gap-4 mb-7">
          <div>
            <h1 className="text-xl font-semibold text-brand-bg">Profile</h1>
            <p className="text-brand-bg/50 text-sm mt-1">
              {user.name || user.username} · {user.email}
            </p>
          </div>
          <Link to="/chat" className="text-xs text-brand-accent hover:underline">
            Back to rooms
          </Link>
        </div>

        {error && (
          <div className="mb-5 rounded-lg bg-red-500/15 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {status && (
          <div className="mb-5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300">
            {status}
          </div>
        )}

        <label className="block mb-4">
          <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">
            Preferred language
          </span>
          <select
            name="preferred_language"
            value={form.preferred_language}
            onChange={handleChange}
            className="ui-input text-sm"
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">
              Pronouns
            </span>
            <select
              name="pronouns"
              value={form.pronouns}
              onChange={handleChange}
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
            <span className="text-sm font-medium text-brand-bg/70 block mb-1.5">
              Voice preference
            </span>
            <select
              name="voice_preference"
              value={form.voice_preference}
              onChange={handleChange}
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
              value={form.custom_pronouns}
              onChange={handleChange}
              required
              className="ui-input text-sm"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-control bg-brand-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
