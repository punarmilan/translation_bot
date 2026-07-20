import React from "react";
import { Star, Quote, Shield, Award, Building2 } from "lucide-react";

const testimonials = [
  {
    quote: "VOXO eliminated language barriers across our multi-national engineering teams. Spoken translation in our native languages feels like magic.",
    author: "Elena Rostova",
    role: "VP of Engineering",
    company: "Apex Global Cloud Solutions",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    tag: "Enterprise Customer",
  },
  {
    quote: "Hosting international seminars used to require three live translators. With VOXO, our students follow along in 12 languages simultaneously with instant captions.",
    author: "Dr. Marcus Vance",
    role: "Dean of Global Education",
    company: "St. Jude International Academy",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    tag: "Education",
  },
  {
    quote: "Self-hosting our voice translation server ensures compliance with international data privacy laws while giving our distributed medical research group seamless calls.",
    author: "Dr. Kenji Takahashi",
    role: "Chief Medical Information Officer",
    company: "BioSyn BioPharma Ltd.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    tag: "Healthcare",
  },
  {
    quote: "The interactive diagnostics panel and whiteboard collaboration make sprint planning effortless across our European and Asian product hubs.",
    author: "Sarah Lin",
    role: "Head of Product Operations",
    company: "OmniTech Ventures",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200",
    rating: 5,
    tag: "Product Team",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="marketing-section relative py-20 overflow-hidden bg-brand-dark/40">
      {/* Mesh Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand-accent/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="landing-shell relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="section-eyebrow inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-semibold uppercase tracking-wider mb-3">
            <Award size={14} /> Proven Global Impact
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-bg">
            Trusted by teams communicating across borders
          </h2>
          <p className="text-ui-muted mt-3 text-sm md:text-base leading-relaxed">
            See how international organizations, universities, and distributed enterprises rely on VOXO for privacy-first multilingual calls.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((item, i) => (
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
                  className="w-10 h-10 rounded-full object-cover border border-brand-accent/30"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold text-brand-bg truncate">{item.author}</h3>
                  <p className="text-[10px] text-ui-muted truncate">{item.role}</p>
                  <p className="text-[9px] text-brand-accent font-semibold truncate flex items-center gap-1 mt-0.5">
                    <Building2 size={10} /> {item.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
