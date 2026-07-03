import {
  AudioLines, Captions, Languages, LogIn, RadioTower, ScanSearch, Volume2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CTASection, MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";

const stages = [
  [LogIn, "Join meeting", "Authenticated users open the room link, choose a language, and establish a websocket session.", "Identity, role, room, and preferred language become part of the live session."],
  [AudioLines, "Speech captured", "The browser captures microphone audio continuously and groups it into useful speech segments.", "Buffering and silence-aware boundaries reduce clipped words and incomplete sentences."],
  [Captions, "Speech recognition", "Faster-Whisper converts each segment into text and identifies the spoken language.", "The STT interface remains modular so recognition models can evolve independently."],
  [ScanSearch, "Language detection", "Recognition output is checked against the speaker language and confidence signals.", "Detected language travels with the transcript rather than relying on a hard-coded assumption."],
  [Languages, "Translation", "Text is translated once for every distinct listener language in the room.", "Matching-language listeners skip translation and repeated text can reuse cached results."],
  [Volume2, "Natural voice generation", "Translated text is routed to an available language and voice preference.", "Audio is generated per target language and placed into recipient playback queues."],
  [RadioTower, "Everyone hears their language", "Captions, translated chat, and generated speech arrive through the existing room transport.", "Independent outbound queues keep one slow participant from delaying everyone else."],
];

function ArchitectureFlow() {
  return (
    <div className="architecture-flow" aria-label="Real-time translation architecture">
      <div className="architecture-flow__lane">
        <span>Browser</span><b>Microphone · Video · Captions · Playback</b>
      </div>
      <div className="architecture-flow__connector" />
      <div className="architecture-flow__lane">
        <span>Live room</span><b>Authentication · Sessions · Websocket · Signaling</b>
      </div>
      <div className="architecture-flow__connector" />
      <div className="architecture-flow__services">
        {["Speech recognition", "Language detection", "Translation", "Voice generation"].map((item) => <span key={item}>{item}</span>)}
      </div>
      <div className="architecture-flow__pulse"><i /><i /><i /><i /><i /></div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <MarketingPage>
      <PageHeader eyebrow="How it works" title="From natural speech to shared understanding" description="A seven-stage real-time pipeline keeps media, language intelligence, and recipient delivery connected to one meeting.">
        <Link className="button button--primary button--large" to="/signup">Try the experience</Link>
        <Link className="button button--secondary button--large" to="/docs">Read documentation</Link>
      </PageHeader>

      <section className="marketing-section">
        <div className="landing-shell">
          <SectionTitle centered eyebrow="Architecture overview" title="One room, two real-time paths" description="Peer media keeps the conversation immediate while language services produce personalized captions and audio." />
          <ArchitectureFlow />
        </div>
      </section>

      <section className="marketing-section soft-section soft-section--blue">
        <div className="landing-shell">
          <SectionTitle eyebrow="Seven connected stages" title="What happens after someone starts speaking" />
          <ol className="stage-list">
            {stages.map(([Icon, title, description, implementation], index) => (
              <li key={title}>
                <span className="stage-list__number">{String(index + 1).padStart(2, "0")}</span>
                <div className="stage-list__icon"><Icon size={25} strokeWidth={1.6} /></div>
                <div><h2>{title}</h2><p>{description}</p><small>{implementation}</small></div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <CTASection title="See the pipeline working in a real room" text="Create a meeting, choose different participant languages, and follow the live status from speech to playback." />
    </MarketingPage>
  );
}
