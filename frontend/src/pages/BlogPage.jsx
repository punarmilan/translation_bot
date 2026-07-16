import { Link, useParams } from "react-router-dom";
import { MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";
import { Calendar, User, Clock, ArrowLeft, ArrowRight } from "lucide-react";

const articles = {
  "why-we-built": {
    title: "Why We Built Translation Bot",
    description: "Removing language barriers in remote collaboration while preserving privacy and security.",
    date: "July 16, 2026",
    author: "Translation Bot Team",
    readTime: "4 min read",
    category: "Philosophy",
    tagline: "Speak naturally, keep your data secure.",
    content: (
      <>
        <p>Communication is the foundation of human connection, yet language differences often create walls in learning, work, and community. We built Translation Bot to break down these barriers, creating a unified space where everyone can speak, listen, and collaborate naturally in their preferred language.</p>
        
        <h2>The Core Problem</h2>
        <p>Conventional video calling tools require everyone to speak the same language, or rely on slow text transcripts. Translation Bot integrates speech translation, captions, and voice-to-speech directly into the meeting stream. This allows team members, classrooms, and families to communicate naturally without a dedicated translator.</p>

        <h2>Privacy First</h2>
        <p>Unlike cloud translation services that send your private conversations to external networks, Translation Bot is designed to run completely self-hosted and offline. Your voice records, document uploads, and notes remain inside your private local network, ensuring absolute data security.</p>

        <h2>Designed for Everyone</h2>
        <p>Whether you are a teacher hosting an international class, a business coordinating distributed teams, or family members speaking across borders, Translation Bot enables you to share a space without losing the warmth and meaning of your natural voice.</p>
      </>
    )
  },
  "how-to-use": {
    title: "How to Use Translation Bot",
    description: "A complete step-by-step guide to starting meetings, choosing languages, and using collaboration tools.",
    date: "July 15, 2026",
    author: "Support Team",
    readTime: "5 min read",
    category: "Guides",
    tagline: "Your first multilingual call in under five minutes.",
    content: (
      <>
        <p>Translation Bot is designed to be simple and approachable. Here is a step-by-step guide to get started with your first multilingual meeting.</p>
        
        <h2>Step 1: Create or Join a Meeting Room</h2>
        <p>Log into your account, enter a meeting room name, and click "Create Room". Copy the shareable room link and send it to your participants.</p>

        <h2>Step 2: Choose Your Language</h2>
        <p>Select the language you want to speak and write. When you join, captions and incoming speech translations will adapt automatically to your selection.</p>

        <h2>Step 3: Collaborate in Real-Time</h2>
        <p>Use the shared whiteboard to sketch ideas, take notes together using the collaborative editor, or upload files directly in the call interface.</p>

        <h2>Step 4: Check Your Connection</h2>
        <p>If you experience delay, check the diagnostics panel on the side to verify microphone authorization and audio playback tests instantly.</p>
      </>
    )
  },
  "whats-new": {
    title: "What's New in Translation Bot",
    description: "Review our latest improvements in whiteboard sync, file uploads, and diagnostic tools.",
    date: "July 14, 2026",
    author: "Product Team",
    readTime: "3 min read",
    category: "Updates",
    tagline: "Collaboration is now faster, simpler, and more reliable.",
    content: (
      <>
        <p>We are constantly improving the meeting experience. Here is a summary of the latest features and performance optimizations in this update.</p>
        
        <h2>Collaborative Whiteboard Sync</h2>
        <p>We have optimized the whiteboard canvas. Drawings synchronize instantly across all participants, and reconnecting users receive the current board state automatically.</p>

        <h2>Reliable File Sharing</h2>
        <p>Our updated file sharing manager shows upload progress, file type indicators, and validates PDF, DOCX, PPTX, images, and audio/video files safely.</p>

        <h2>Interactive Diagnostics Dashboard</h2>
        <p>The new diagnostics panel shows microphone status, speaker playback tests, camera feeds, and connection health markers to keep you in control of your meeting setup.</p>
      </>
    )
  }
};

export default function BlogPage() {
  const { slug } = useParams();
  const article = slug ? articles[slug] : null;

  if (article) {
    return (
      <MarketingPage>
        <header className="page-header page-header--blue">
          <div className="landing-shell page-header__inner" style={{ display: "block" }}>
            <Link to="/blog" className="inline-flex items-center gap-2 text-xs font-semibold text-brand-accent hover:brightness-110 mb-4">
              <ArrowLeft size={14} /> Back to Blog
            </Link>
            <p className="section-eyebrow">{article.category} • {article.readTime}</p>
            <h1 className="text-3xl font-bold mt-2 leading-tight">{article.title}</h1>
            <p className="text-ui-muted mt-3 text-sm">{article.description}</p>
            <div className="flex items-center gap-4 mt-6 text-xs text-ui-subtle border-t border-white/5 pt-4">
              <span className="flex items-center gap-1.5"><User size={13} /> {article.author}</span>
              <span className="flex items-center gap-1.5"><Calendar size={13} /> {article.date}</span>
            </div>
          </div>
        </header>

        <section className="marketing-section">
          <div className="landing-shell" style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem 1rem" }}>
            <article className="prose prose-invert" style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.7" }}>
              <p className="text-lg font-medium text-brand-bg mb-6 italic" style={{ fontSize: "16px" }}>{article.tagline}</p>
              {article.content}
            </article>
            <div className="border-t border-white/10 mt-12 pt-6">
              <Link to="/blog" className="button button--secondary inline-flex items-center gap-2">
                <ArrowLeft size={14} /> Back to all articles
              </Link>
            </div>
          </div>
        </section>
      </MarketingPage>
    );
  }

  return (
    <MarketingPage>
      <PageHeader 
        eyebrow="Blog & updates" 
        title="Stories and guides behind Translation Bot" 
        description="Learn how to speak across barriers, explore our features, and follow our mission to make communication truly accessible."
      />

      <section className="marketing-section">
        <div className="landing-shell">
          <SectionTitle eyebrow="Featured articles" title="From the team" description="Guides, product deep-dives, and updates." />
          
          <div className="grid gap-6 md:grid-cols-3" style={{ display: "grid", gap: "24px", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: "24px" }}>
            {Object.entries(articles).map(([key, item]) => (
              <article 
                key={key} 
                className="flex flex-col justify-between p-6 bg-brand-mid rounded-panel border border-white/[0.06] hover:border-brand-accent/50 hover:bg-brand-mid/80 transition-all duration-200"
              >
                <div>
                  <span className="text-[10px] uppercase font-bold text-brand-accent tracking-wider">{item.category}</span>
                  <h3 className="text-lg font-bold text-brand-bg mt-2 mb-3 leading-snug">{item.title}</h3>
                  <p className="text-xs text-ui-muted line-clamp-3 leading-relaxed">{item.description}</p>
                </div>
                
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-ui-subtle">
                  <span>{item.date}</span>
                  <Link to={`/blog/${key}`} className="inline-flex items-center gap-1 text-brand-accent font-semibold hover:brightness-110">
                    Read article <ArrowRight size={12} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
