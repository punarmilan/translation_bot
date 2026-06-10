import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const FEATURES = [
  {
    icon: "🌐",
    title: "Instant Translation",
    desc: "Messages auto-translate to each member's preferred language in real time.",
  },
  {
    icon: "🔊",
    title: "Voice Calling",
    desc: "Crystal-clear peer-to-peer audio calls powered by WebRTC — no servers in the middle.",
  },
  {
    icon: "🛡️",
    title: "Secure Rooms",
    desc: "JWT-authenticated sessions keep conversations isolated and private.",
  },
  {
    icon: "⚡",
    title: "Zero Latency",
    desc: "Queue-based WebSocket delivery ensures no single user slows down the room.",
  },
];

const LANGUAGES = [
  { flag: "🇺🇸", name: "English" },
  { flag: "🇮🇳", name: "Hindi" },
  { flag: "🇮🇳", name: "Marathi" },
  { flag: "🇪🇸", name: "Spanish" },
  { flag: "🇫🇷", name: "French" },
  { flag: "🇩🇪", name: "German" },
  { flag: "🇯🇵", name: "Japanese" },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-brand-bg font-sans">
      {/* Nav */}
      <nav className="bg-brand-dark px-6 py-4 flex items-center justify-between">
        <span className="text-brand-bg font-bold text-xl tracking-tight">Translation_bot</span>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              to="/chat"
              className="bg-brand-accent text-brand-bg px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition"
            >
              Open Chat
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="text-brand-bg/80 px-4 py-2 rounded-lg text-sm font-medium hover:text-brand-bg transition"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="bg-brand-accent text-brand-bg px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-brand-dark px-6 py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-brand-accent/20 text-brand-accent text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-6">
            Real-Time · Multilingual · Open Source
          </span>
          <h1 className="text-5xl font-bold text-brand-bg leading-tight">
            Speak your language.<br />
            <span className="text-brand-accent">Connect with anyone.</span>
          </h1>
          <p className="mt-6 text-brand-bg/70 text-lg max-w-xl mx-auto">
            Translation_bot translates every message on the fly. Your team speaks English,
            Hindi, Spanish — everyone reads in their own language, instantly.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <Link
              to={user ? "/chat" : "/signup"}
              className="bg-brand-accent text-brand-bg px-8 py-3 rounded-xl text-base font-semibold hover:opacity-90 transition shadow-lg"
            >
              {user ? "Open Chat →" : "Start for free →"}
            </Link>
            <Link
              to="/login"
              className="border border-brand-bg/30 text-brand-bg/80 px-8 py-3 rounded-xl text-base font-medium hover:border-brand-bg/60 transition"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Language badges */}
      <section className="bg-brand-mid py-6 overflow-hidden">
        <div className="flex gap-3 justify-center flex-wrap px-6">
          {LANGUAGES.map((lang) => (
            <span
              key={lang.name}
              className="bg-brand-dark text-brand-bg/80 text-sm px-3 py-1.5 rounded-full"
            >
              {lang.flag} {lang.name}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-brand-dark text-center mb-4">
            Everything you need to communicate
          </h2>
          <p className="text-brand-mid text-center mb-14 max-w-xl mx-auto">
            Built on FastAPI, React, and LibreTranslate — fully open source, no vendor lock-in.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-brand-bg hover:shadow-md transition"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-brand-dark mb-2">{f.title}</h3>
                <p className="text-sm text-brand-mid leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example conversation */}
      <section className="py-16 px-6 bg-brand-mid/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-brand-dark mb-10">
            One message, every language
          </h2>
          <div className="space-y-4 text-left">
            {[
              { user: "User A (English)", msg: "Hello, how are you?", lang: "en", bg: "bg-brand-dark text-brand-bg" },
              { user: "User B sees (Hindi)", msg: "नमस्ते, आप कैसे हैं?", lang: "hi", bg: "bg-brand-accent text-brand-bg" },
              { user: "User C sees (Marathi)", msg: "नमस्कार, तुम्ही कसे आहात?", lang: "mr", bg: "bg-brand-mid text-brand-bg" },
            ].map((item) => (
              <div key={item.user} className={`rounded-xl px-5 py-4 ${item.bg}`}>
                <p className="text-xs opacity-70 mb-1">{item.user}</p>
                <p className="font-medium text-lg">{item.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-dark py-20 px-6 text-center">
        <h2 className="text-3xl font-bold text-brand-bg mb-4">Ready to break language barriers?</h2>
        <p className="text-brand-bg/60 mb-8">Create an account and join your first room in under a minute.</p>
        <Link
          to={user ? "/chat" : "/signup"}
          className="bg-brand-accent text-brand-bg px-8 py-3 rounded-xl text-base font-semibold hover:opacity-90 transition shadow-lg"
        >
          {user ? "Go to Chat →" : "Create free account →"}
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-brand-dark border-t border-white/10 py-6 px-6 text-center">
        <p className="text-brand-bg/40 text-sm">
          Translation_bot · Built with FastAPI + React + LibreTranslate
        </p>
      </footer>
    </div>
  );
}
