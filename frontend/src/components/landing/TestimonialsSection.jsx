import React from "react";
import { Star, Quote, Award } from "lucide-react";
import { resolveImageUrl } from "../../services/api";

const defaultTestimonials = [
  {
    quote: "VOXO eliminated language barriers across our multi-national engineering teams. Spoken translation in our native languages feels like magic.",
    author: "Elena Rostova",
    role: "VP of Engineering",
    company: "Apex Global Cloud Solutions",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
    rating: 5,
  },
  {
    quote: "Hosting international seminars used to require three live translators. With VOXO, our students follow along in 12 languages simultaneously with instant captions.",
    author: "Dr. Marcus Vance",
    role: "Dean of Global Education",
    company: "St. Jude International Academy",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    rating: 5,
  },
  {
    quote: "Self-hosting our voice translation server ensures compliance with international data privacy laws while giving our distributed medical research group seamless calls.",
    author: "Dr. Kenji Takahashi",
    role: "Chief Medical Information Officer",
    company: "BioSyn BioPharma Ltd.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    rating: 5,
  },
  {
    quote: "The interactive diagnostics panel and whiteboard collaboration make sprint planning effortless across our European and Asian product hubs.",
    author: "Sarah Lin",
    role: "Sarah Lin",
    company: "OmniTech Ventures",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200",
    rating: 5,
  },
];

export default function TestimonialsSection({ data }) {
  const eyebrow = data?.eyebrow || "Proven Global Impact";
  const title = data?.title || "Trusted by teams communicating across borders";
  const body = data?.body || "See how international organizations, universities, and distributed enterprises rely on VOXO for privacy-first multilingual calls.";

  const customCards = data?.cards && data.cards.length > 0 ? data.cards : null;

  const items = customCards
    ? customCards.map((c) => ({
        quote: c.description || c.answer || c.quote || "VOXO enables seamless cross-border communication.",
        author: c.author || c.title || c.question || "Verified User",
        role: c.role || c.subtitle || "Leader",
        company: c.company || "Enterprise Partner",
        avatar: resolveImageUrl(c.image_url) || c.avatar || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
        rating: c.rating || 5,
      }))
    : defaultTestimonials;

  return (
    <section className="marketing-section relative py-20 overflow-hidden bg-brand-dark/40">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand-accent/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="landing-shell relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="section-eyebrow inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-semibold uppercase tracking-wider mb-3">
            <Award size={14} /> {eyebrow}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-bg">
            {title}
          </h2>
          <p className="text-ui-muted mt-3 text-sm md:text-base leading-relaxed">
            {body}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col justify-between p-6 bg-brand-mid/60 backdrop-blur-md rounded-2xl border border-white/[0.08] hover:border-brand-accent/40 hover:bg-brand-mid/80 transition-all duration-300 shadow-lg group hover:-translate-y-1"
            >
              <div>
                <div className="flex items-center gap-1 text-amber-400 mb-4">
                  {[...Array(item.rating)].map((_, idx) => (
                    <Star key={idx} size={14} fill="currentColor" />
                  ))}
                </div>
                <Quote size={20} className="text-brand-accent/40 mb-2" />
                <p className="text-xs text-brand-bg/90 leading-relaxed font-normal italic">
                  "{item.quote}"
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-3">
                <img
                  src={item.avatar}
                  alt={item.author}
                  onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200"; }}
                  className="w-9 h-9 rounded-full object-cover border border-white/20"
                />
                <div>
                  <h4 className="text-xs font-semibold text-brand-bg">{item.author}</h4>
                  <p className="text-[10px] text-ui-muted">{item.role} {item.company ? `• ${item.company}` : ""}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
