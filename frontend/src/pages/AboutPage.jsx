import React, { useState, useMemo } from "react";
import { MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";
import FAQ from "../components/landing/FAQ";
import {
  Shield, Sparkles, Cpu, Lock, Globe, Target, Mail, MapPin, Search,
  BookOpen, Mic, Camera, Captions, Video, Headphones, CircleHelp, Languages, ShieldCheck, LockKeyhole, MessageCircleWarning
} from "lucide-react";
import { Link } from "react-router-dom";

const helpTopics = [
  [BookOpen, "Quick Start Guide", "Create an account, select your preferred spoken language, enter a room name, and share the room link with participants."],
  [Mic, "Microphone Access", "Ensure HTTPS is enabled, grant browser microphone permissions, confirm input device in Diagnostics, and close competing audio apps."],
  [Camera, "Camera & Video Feed", "Grant camera permissions in your browser bar, verify camera selection in Diagnostics, and check that camera-off toggle is unselected."],
  [Captions, "Live Speech Captions", "Confirm live translation is active, speak in natural complete phrases, and select a target language different from your spoken language."],
  [Video, "Room Connection", "Check room code spelling, verify WebSocket indicator is green, and confirm both participants are connected to the same room."],
  [Headphones, "Audio & TTS Playback", "Verify system volume, grant browser audio autoplay permissions, check listener mode settings, and test audio beep in Diagnostics."],
  [CircleHelp, "Browser Compatibility", "Use modern Chromium, Firefox, or Safari browsers supporting WebSockets and WebRTC media standards."],
  [Languages, "Supported Languages", "Supported languages include English, Hindi, German, Spanish, French, Arabic, Dutch, Italian, Portuguese, and Russian."],
  [ShieldCheck, "Security & Hardening", "Rooms require user authentication. Media streams use strict origin checks and encrypted P2P signaling."],
  [LockKeyhole, "Data Privacy", "Microphone and camera permissions remain browser-controlled. 100% self-hosted local audio processing with zero cloud tracking."],
];

export default function AboutPage() {
  const [activeTab, setActiveTab] = useState("about"); // "about" | "help"
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return helpTopics;
    return helpTopics.filter(([, title, text]) => `${title} ${text}`.toLowerCase().includes(q));
  }, [searchQuery]);

  return (
    <MarketingPage>
      <PageHeader
        eyebrow="WorknAI Technologies India Pvt. Ltd."
        title="About VOXO & Help Centre"
        description="Learn about our privacy-first mission, core values, and access setup guides and troubleshooting support."
      >
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setActiveTab("about")}
            className={`px-4 py-2 rounded-control text-xs font-semibold transition ${
              activeTab === "about"
                ? "bg-brand-accent text-white shadow-md"
                : "bg-white/[0.04] text-ui-muted hover:text-brand-bg"
            }`}
          >
            About VOXO
          </button>
          <button
            onClick={() => setActiveTab("help")}
            className={`px-4 py-2 rounded-control text-xs font-semibold transition ${
              activeTab === "help"
                ? "bg-brand-accent text-white shadow-md"
                : "bg-white/[0.04] text-ui-muted hover:text-brand-bg"
            }`}
          >
            Help Centre & FAQ
          </button>
        </div>
      </PageHeader>

      {activeTab === "about" ? (
        <>
          {/* Mission & Vision Section */}
          <section className="marketing-section">
            <div className="landing-shell">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="p-8 rounded-2xl bg-brand-mid border border-white/[0.08] relative overflow-hidden">
                  <span className="p-3 rounded-xl bg-brand-accent/10 text-brand-accent inline-block mb-4">
                    <Target size={24} />
                  </span>
                  <h2 className="text-2xl font-bold text-brand-bg mb-3">Our Mission</h2>
                  <p className="text-sm text-ui-muted leading-relaxed">
                    To eradicate language barriers from global work, education, and collaboration by building high-performance, low-latency, and completely private voice translation infrastructure.
                  </p>
                </div>

                <div className="p-8 rounded-2xl bg-brand-mid border border-white/[0.08] relative overflow-hidden">
                  <span className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 inline-block mb-4">
                    <Globe size={24} />
                  </span>
                  <h2 className="text-2xl font-bold text-brand-bg mb-3">Global Vision</h2>
                  <p className="text-sm text-ui-muted leading-relaxed">
                    A connected world where every individual can speak, write, and express themselves in their native tongue without losing nuance, privacy, or emotional connection.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Engineering Philosophy & Core Values */}
          <section className="marketing-section soft-section soft-section--blue">
            <div className="landing-shell">
              <SectionTitle
                eyebrow="Core Values"
                title="Built on Privacy, Quality, and Open Standards"
                description="Our technological choices are guided by four unyielding engineering principles."
              />

              <div className="grid gap-6 md:grid-cols-4 mt-8">
                <div className="p-6 rounded-panel bg-brand-mid border border-white/[0.06]">
                  <Lock size={22} className="text-brand-accent mb-3" />
                  <h3 className="text-base font-bold text-brand-bg mb-2">Absolute Privacy</h3>
                  <p className="text-xs text-ui-muted leading-relaxed">
                    Complete self-hosted architecture. Voice audio, transcriptions, and meeting documents never leave your private local network.
                  </p>
                </div>

                <div className="p-6 rounded-panel bg-brand-mid border border-white/[0.06]">
                  <Cpu size={22} className="text-emerald-400 mb-3" />
                  <h3 className="text-base font-bold text-brand-bg mb-2">Sub-Second Latency</h3>
                  <p className="text-xs text-ui-muted leading-relaxed">
                    Optimized streaming STT, translation caching, and lightweight speech synthesis pipelines for natural conversational flow.
                  </p>
                </div>

                <div className="p-6 rounded-panel bg-brand-mid border border-white/[0.06]">
                  <Shield size={22} className="text-sky-400 mb-3" />
                  <h3 className="text-base font-bold text-brand-bg mb-2">Enterprise Control</h3>
                  <p className="text-xs text-ui-muted leading-relaxed">
                    Granular administrative controls, feature flag propagation, audit logging, and role-based room moderation.
                  </p>
                </div>

                <div className="p-6 rounded-panel bg-brand-mid border border-white/[0.06]">
                  <Sparkles size={22} className="text-amber-400 mb-3" />
                  <h3 className="text-base font-bold text-brand-bg mb-2">Responsible AI</h3>
                  <p className="text-xs text-ui-muted leading-relaxed">
                    Deterministic, localized translation algorithms free from external API tracking, cloud monetization, or hidden data harvesting.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Help Centre Teaser */}
          <section className="marketing-section text-center">
            <div className="landing-shell max-w-xl mx-auto p-8 rounded-2xl bg-brand-mid border border-white/10">
              <h3 className="text-lg font-bold text-brand-bg mb-2">Need help setting up your call?</h3>
              <p className="text-xs text-ui-muted mb-4">Explore our interactive Help Centre for setup guides, FAQs, and troubleshooting.</p>
              <button
                onClick={() => setActiveTab("help")}
                className="button button--primary text-xs"
              >
                Open Help Centre & FAQ
              </button>
            </div>
          </section>
        </>
      ) : (
        /* Help Centre Tab View */
        <div className="space-y-12 py-8">
          {/* Help Search */}
          <section className="landing-shell max-w-2xl mx-auto">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ui-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search microphone, camera, captions, audio..."
                className="w-full bg-brand-mid border border-white/10 rounded-xl py-3 pl-11 pr-4 text-xs text-brand-bg focus:outline-none focus:border-brand-accent transition"
              />
            </div>
          </section>

          {/* Help Topics Grid */}
          <section className="marketing-section">
            <div className="landing-shell">
              <SectionTitle
                eyebrow="Help Topics"
                title={searchQuery ? `Search Results for "${searchQuery}"` : "Troubleshooting & Setup Guides"}
                description={`${filteredTopics.length} support topics available`}
              />

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6">
                {filteredTopics.map(([Icon, title, text]) => (
                  <div key={title} className="p-5 rounded-xl bg-brand-mid border border-white/[0.06] flex flex-col justify-between hover:border-brand-accent/40 transition">
                    <div>
                      <div className="p-2 bg-brand-accent/10 text-brand-accent rounded-lg w-fit mb-3">
                        <Icon size={18} />
                      </div>
                      <h3 className="text-sm font-bold text-brand-bg mb-1.5">{title}</h3>
                      <p className="text-xs text-ui-muted leading-relaxed">{text}</p>
                    </div>
                    <Link to="/docs" className="text-[11px] font-semibold text-brand-accent hover:underline mt-4 block">
                      Read documentation →
                    </Link>
                  </div>
                ))}
              </div>

              {filteredTopics.length === 0 && (
                <div className="text-center py-12 text-ui-subtle text-xs">
                  <MessageCircleWarning size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No matching help topics found.</p>
                </div>
              )}
            </div>
          </section>

          {/* FAQ Section */}
          <section className="marketing-section soft-section">
            <div className="landing-shell">
              <SectionTitle eyebrow="FAQ" title="Frequently Asked Questions" description="Answers to common questions before and during VOXO meetings." />
              <div className="max-w-3xl mx-auto mt-6">
                <FAQ />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Contact & Company Footer Details */}
      <section className="marketing-section border-t border-white/10 pt-12">
        <div className="landing-shell max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-brand-bg mb-2">WorknAI Technologies India Pvt. Ltd.</h2>
          <p className="text-xs text-ui-muted leading-relaxed mb-6">
            Building next-generation real-time voice translation systems for enterprise teams, public institutions, and international organizations.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-ui-subtle">
            <span className="flex items-center gap-2">
              <MapPin size={15} className="text-brand-accent" /> India
            </span>
            <span className="flex items-center gap-2">
              <Mail size={15} className="text-brand-accent" /> support@worknai.tech
            </span>
            <span className="flex items-center gap-2">
              <Globe size={15} className="text-brand-accent" /> www.worknai.tech
            </span>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
