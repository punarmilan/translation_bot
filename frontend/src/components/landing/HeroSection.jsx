import { Link } from "react-router-dom";
import HeroIllustration from "./HeroIllustration";
import { Sparkles, ArrowRight, ShieldCheck, Zap, Globe2 } from "lucide-react";

export default function HeroSection({ cms, user }) {
  const eyebrow = cms?.eyebrow || "Real-Time Multilingual Communication Platform";
  const title = cms?.title || "Meet, speak, and collaborate in any language instantly";
  const body = cms?.body || "VOXO translates live voice, captions, and chat naturally into each listener's preferred language without cloud tracking or external API keys.";

  return (
    <section className="hero-section relative pt-28 pb-20 overflow-hidden">
      {/* Background Mesh Lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-brand-accent/15 via-emerald-500/10 to-transparent blur-[120px] pointer-events-none" />

      <div className="landing-shell relative z-10">
        <div className="hero-layout grid lg:grid-cols-12 gap-12 items-center">
          
          {/* Copy Column */}
          <div className="lg:col-span-6 flex flex-col items-start">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-semibold text-brand-accent mb-6 shadow-inner">
              <Sparkles size={14} className="text-brand-accent animate-pulse" />
              <span>{eyebrow}</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-brand-bg leading-[1.15] mb-6">
              {title}
            </h1>

            <p className="text-base md:text-lg text-ui-muted leading-relaxed mb-8 max-w-xl">
              {body}
            </p>

            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <Link
                to={user ? "/chat" : "/signup"}
                className="button button--primary button--large inline-flex items-center gap-2 shadow-lg shadow-brand-accent/25 hover:brightness-110"
              >
                {user ? "Open Workspace" : "Get Started Free"}
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/features"
                className="button button--secondary button--large inline-flex items-center gap-2"
              >
                Explore Features
              </Link>
            </div>

            {/* Micro Indicators */}
            <div className="grid grid-cols-3 gap-6 pt-10 mt-10 border-t border-white/10 w-full text-xs text-ui-subtle">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span>100% Self-Hosted</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-amber-400" />
                <span>Sub-Second Speech</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 size={16} className="text-brand-accent" />
                <span>Multi-Language</span>
              </div>
            </div>
          </div>

          {/* SVG Illustration Column */}
          <div className="lg:col-span-6 w-full flex justify-center">
            <HeroIllustration />
          </div>

        </div>
      </div>
    </section>
  );
}
