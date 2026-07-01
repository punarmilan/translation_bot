import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Panel from "../components/ui/Panel";
import Skeleton from "../components/ui/Skeleton";
import StatusBadge from "../components/ui/StatusBadge";
import { useAuth } from "../contexts/AuthContext";
import { parseApiError, synthesizeTts } from "../services/api";

const VOICES = [
  { id: "feminine", title: "Feminine", description: "Routes to a softer voice when available." },
  { id: "masculine", title: "Masculine", description: "Routes to a deeper voice when available." },
  { id: "neutral", title: "Neutral", description: "Uses the default balanced voice." },
  { id: "auto", title: "Auto", description: "Lets the backend choose the safest match." },
];
const PROFILES = ["standard", "natural", "expressive"];
const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Arabic", value: "ar" },
  { label: "Dutch", value: "nl" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Russian", value: "ru" },
];

export default function VoiceTestPage() {
  const { user, loading } = useAuth();
  const [text, setText] = useState("Hello, welcome to our multilingual meeting.");
  const [language, setLanguage] = useState("en");
  const [speechProfile, setSpeechProfile] = useState("natural");
  const [results, setResults] = useState({});
  const [busyVoice, setBusyVoice] = useState("");
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-52 w-full" />
          <div className="grid gap-4 md:grid-cols-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const testVoice = async (voice) => {
    setBusyVoice(voice);
    setError("");
    try {
      const result = await synthesizeTts(text, language, voice, speechProfile);
      const audioUrl = `data:${result.mime_type};base64,${result.audio_base64}`;
      setResults((current) => ({
        ...current,
        [voice]: {
          ...result,
          audioUrl,
          sampleText: text,
          language,
        },
      }));
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch (err) {
      setError(parseApiError(err) || `Could not synthesize ${voice} voice.`);
    } finally {
      setBusyVoice("");
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark text-brand-bg">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <StatusBadge tone="blue">Piper verification</StatusBadge>
            <h1 className="mt-3 text-[28px] font-semibold">Voice test</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-bg/55">
              Compare voice preference routing, actual Piper model selection, fallback behavior,
              and synthesis latency before using translated audio in meetings.
            </p>
          </div>
          <Link
            to="/chat"
            className="inline-flex rounded-control bg-ui-elevated px-4 py-2 text-sm font-semibold text-ui-muted hover:bg-white/[0.08] hover:text-brand-bg"
          >
            Back to chat
          </Link>
        </header>

        {error && (
          <div className="mb-5 rounded-panel bg-ui-error/10 px-4 py-3 text-sm text-ui-error">
            {error}
          </div>
        )}

        <Panel title="Test input" className="mb-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-bg/50">
              Text to synthesize
            </span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              className="ui-input resize-none text-sm"
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-bg/50">
                Language
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="ui-input text-sm"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-bg/50">
                Speech profile
              </span>
              <select
                value={speechProfile}
                onChange={(event) => setSpeechProfile(event.target.value)}
                className="ui-input text-sm"
              >
                {PROFILES.map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {VOICES.map((voice) => {
            const result = results[voice.id];
            const loadingVoice = busyVoice === voice.id;
            return (
              <article
                key={voice.id}
                className="flex min-h-72 flex-col rounded-panel border border-white/[0.06] bg-brand-mid p-4 shadow-panel"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-brand-bg">{voice.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-brand-bg/45">
                      {voice.description}
                    </p>
                  </div>
                  {result && (
                    <StatusBadge tone={result.fallback_used ? "yellow" : "green"}>
                      {result.fallback_used ? "Fallback" : "Matched"}
                    </StatusBadge>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => testVoice(voice.id)}
                  disabled={loadingVoice || Boolean(busyVoice) || !text.trim()}
                  className="mt-4 rounded-control bg-brand-accent px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {loadingVoice ? "Generating..." : "Generate and play"}
                </button>

                <div className="mt-4 flex-1">
                  {loadingVoice ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : result ? (
                    <div className="space-y-3 text-xs text-brand-bg/55">
                      <InfoRow label="Selected voice" value={result.selected_voice} />
                      <InfoRow label="Language" value={result.language} />
                      <InfoRow label="Profile" value={result.speech_profile} />
                      <InfoRow label="Latency" value={`${result.latency_ms}ms`} />
                      <div>
                        <p className="mb-1 text-brand-bg/35">Actual Piper model</p>
                        <p className="break-words rounded-lg bg-brand-dark/60 p-2 font-mono text-[11px] text-brand-bg/60">
                          {result.selected_model || "not reported"}
                        </p>
                      </div>
                      <audio controls src={result.audioUrl} className="w-full" />
                    </div>
                  ) : (
                    <div className="rounded-control bg-ui-secondary p-4 text-center text-xs text-ui-subtle">
                      No sample generated yet.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
      <span className="text-brand-bg/35">{label}</span>
      <span className="font-semibold text-brand-bg/70">{value || "unknown"}</span>
    </div>
  );
}
