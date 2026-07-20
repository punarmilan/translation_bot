import React from "react";

export default function HeroIllustration() {
  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-[16/10] rounded-2xl border border-white/10 bg-gradient-to-b from-brand-mid/90 to-brand-dark/95 p-6 shadow-2xl backdrop-blur-xl overflow-hidden group select-none">
      {/* Background Radial Glow */}
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-brand-accent/20 rounded-full blur-3xl group-hover:bg-brand-accent/30 transition-all duration-500" />
      <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl group-hover:bg-emerald-500/30 transition-all duration-500" />

      {/* SVG Canvas Mesh & Nodes */}
      <svg className="w-full h-full relative z-10" viewBox="0 0 800 500" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grid-grad" x1="0" y1="0" x2="800" y2="500" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3B82F6" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#10B981" stopOpacity="0.2" />
            <stop offset="1" stopColor="#6366F1" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#3B82F6" />
            <stop offset="1" stopColor="#10B981" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Animated Grid lines */}
        <path d="M0 100 H800 M0 200 H800 M0 300 H800 M0 400 H800" stroke="url(#grid-grad)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M160 0 V500 M320 0 V500 M480 0 V500 M640 0 V500" stroke="url(#grid-grad)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Connecting Beams */}
        <path d="M180 250 Q 320 120 460 220" stroke="url(#beam)" strokeWidth="3" fill="none" filter="url(#glow)" className="animate-pulse" />
        <path d="M460 220 Q 580 340 650 210" stroke="url(#beam)" strokeWidth="3" fill="none" filter="url(#glow)" />
        <path d="M180 250 Q 400 380 650 210" stroke="#10B981" strokeWidth="2" strokeDasharray="6 6" fill="none" opacity="0.6" />

        {/* Global Node 1 - English (New York) */}
        <g transform="translate(180, 250)">
          <circle r="36" fill="#1E293B" stroke="#3B82F6" strokeWidth="2" />
          <circle r="44" fill="none" stroke="#3B82F6" strokeWidth="1" opacity="0.4" className="animate-ping" />
          <text x="0" y="-8" textAnchor="middle" fill="#94A3B8" fontSize="11" fontWeight="bold">NEW YORK</text>
          <text x="0" y="12" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="bold">"Good morning!"</text>
          <rect x="-24" y="24" width="48" height="16" rx="4" fill="#3B82F6" opacity="0.2" />
          <text x="0" y="35" textAnchor="middle" fill="#60A5FA" fontSize="9" fontWeight="bold">EN 🇺🇸</text>
        </g>

        {/* Central Translation Engine Node - VOXO AI Core */}
        <g transform="translate(420, 150)" filter="url(#glow)">
          <polygon points="0,-40 35,20 -35,20" fill="#0F172A" stroke="#10B981" strokeWidth="2" />
          <circle r="18" fill="#10B981" opacity="0.2" />
          <text x="0" y="5" textAnchor="middle" fill="#10B981" fontSize="11" fontWeight="bold">VOXO AI</text>
          <text x="0" y="45" textAnchor="middle" fill="#A7F3D0" fontSize="10" fontWeight="medium">Real-Time Neural Pipeline</text>
        </g>

        {/* Global Node 2 - Spanish (Madrid) */}
        <g transform="translate(460, 320)">
          <circle r="36" fill="#1E293B" stroke="#10B981" strokeWidth="2" />
          <text x="0" y="-8" textAnchor="middle" fill="#94A3B8" fontSize="11" fontWeight="bold">MADRID</text>
          <text x="0" y="12" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="bold">"¡Buenos días!"</text>
          <rect x="-24" y="24" width="48" height="16" rx="4" fill="#10B981" opacity="0.2" />
          <text x="0" y="35" textAnchor="middle" fill="#34D399" fontSize="9" fontWeight="bold">ES 🇪🇸</text>
        </g>

        {/* Global Node 3 - Japanese (Tokyo) */}
        <g transform="translate(650, 210)">
          <circle r="36" fill="#1E293B" stroke="#818CF8" strokeWidth="2" />
          <text x="0" y="-8" textAnchor="middle" fill="#94A3B8" fontSize="11" fontWeight="bold">TOKYO</text>
          <text x="0" y="12" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="bold">"おはようございます"</text>
          <rect x="-24" y="24" width="48" height="16" rx="4" fill="#6366F1" opacity="0.2" />
          <text x="0" y="35" textAnchor="middle" fill="#A5B4FC" fontSize="9" fontWeight="bold">JA 🇯🇵</text>
        </g>

        {/* Live Speech Waveform Pill */}
        <g transform="translate(260, 420)">
          <rect x="0" y="0" width="280" height="42" rx="21" fill="#0F172A" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <circle cx="24" cy="21" r="10" fill="#10B981" />
          <path d="M50 21 Q 60 10 70 21 T 90 21 T 110 21 T 130 21" stroke="#3B82F6" strokeWidth="2.5" fill="none" />
          <text x="145" y="25" fill="#E2E8F0" fontSize="11" fontWeight="600">Audio Synth • 42ms Latency</text>
        </g>
      </svg>
    </div>
  );
}
