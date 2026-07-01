import { Link } from "react-router-dom";
import StatusBadge from "../components/ui/StatusBadge";
import { useAuth } from "../contexts/AuthContext";

const CAPABILITIES = [
  ["Live meetings", "Peer-to-peer audio and video with room controls."],
  ["Speech translation", "Continuous transcription, translation, and voice playback."],
  ["Multilingual chat", "Messages adapt to every participant's preferred language."],
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-brand-dark text-brand-bg">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="text-base font-semibold">
          Translation Bot
        </Link>
        <div className="flex items-center gap-2">
          {!user && (
            <Link
              to="/login"
              className="rounded-control px-4 py-2 text-sm font-medium text-ui-muted hover:bg-white/[0.04] hover:text-brand-bg"
            >
              Sign in
            </Link>
          )}
          <Link
            to={user ? "/chat" : "/signup"}
            className="rounded-control bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            {user ? "Open workspace" : "Create account"}
          </Link>
        </div>
      </nav>

      <main className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <section>
          <StatusBadge tone="blue">Multilingual meeting workspace</StatusBadge>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
            Meet naturally across languages.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-ui-muted">
            One focused workspace for video meetings, translated speech, live captions,
            and multilingual team chat.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={user ? "/chat" : "/signup"}
              className="rounded-control bg-brand-accent px-5 py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              {user ? "Enter a meeting" : "Get started"}
            </Link>
            {!user && (
              <Link
                to="/login"
                className="rounded-control bg-ui-elevated px-5 py-3 text-sm font-semibold text-brand-bg hover:bg-white/[0.08]"
              >
                I have an account
              </Link>
            )}
          </div>

          <div className="mt-12 space-y-5">
            {CAPABILITIES.map(([title, description]) => (
              <div key={title} className="grid grid-cols-[9rem_1fr] gap-4">
                <p className="text-sm font-medium text-brand-bg">{title}</p>
                <p className="text-sm leading-6 text-ui-subtle">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-ui-secondary shadow-soft"
          aria-label="Meeting workspace preview"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <p className="text-sm font-semibold">Weekly sync</p>
              <p className="mt-1 text-xs text-ui-subtle">3 participants / Translation active</p>
            </div>
            <StatusBadge tone="green">Connected</StatusBadge>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {["Host", "Participant"].map((name, index) => (
              <div
                key={name}
                className="relative aspect-video rounded-panel bg-brand-mid"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ui-elevated text-lg font-semibold text-ui-muted">
                    {name[0]}
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/35 px-3 py-2">
                  <span className="text-xs font-medium">{name}</span>
                  <span className="text-[11px] text-ui-muted">{index ? "EN" : "HI"}</span>
                </div>
              </div>
            ))}
            <div className="rounded-panel bg-brand-mid p-4 sm:col-span-2">
              <p className="text-xs font-medium text-brand-accent">Live translation</p>
              <p className="mt-2 text-sm">Welcome to the meeting.</p>
              <p className="mt-1 text-sm text-ui-muted">बैठक में आपका स्वागत है।</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
