import {
  BriefcaseBusiness, Building2, GraduationCap, HandHeart, Headset, HeartPulse,
  Landmark, Microscope, Plane, Presentation, Scale, Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CTASection, MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";

const solutions = [
  [GraduationCap, "Education", "Students struggle when lectures use an unfamiliar language.", ["Lower participation", "Missed context", "Limited international access"], "Deliver translated lectures, captions, and classroom chat in each student's language.", "More inclusive classes and stronger participation.", "/images/online-classroom.png"],
  [HeartPulse, "Healthcare", "Doctors and patients may not share enough language for a clear consultation.", ["Misunderstood symptoms", "Repeated explanations", "Patient anxiety"], "Support multilingual consultations with visible original and translated transcripts.", "Clearer conversations and fewer avoidable misunderstandings.", null],
  [BriefcaseBusiness, "International business", "Global teams lose time translating decisions after meetings.", ["Slow decisions", "Interpreter scheduling", "Unequal participation"], "Let team members speak, read, and reply in their preferred language during the same call.", "Faster collaboration across markets.", "/images/hybrid-team.png"],
  [Headset, "Customer support", "Agents cannot personally speak every customer language.", ["Long transfers", "Inconsistent service", "Limited coverage"], "Translate live conversations and direct chat while retaining speaker context.", "Broader support coverage and more natural service.", null],
  [Landmark, "Government services", "Citizens can struggle to access services delivered in one official language.", ["Low accessibility", "Administrative delays", "Repeated visits"], "Provide translated consultations, instructions, and follow-up messages.", "More accessible public communication.", null],
  [Plane, "Travel and tourism", "Visitors and local teams need quick communication without shared vocabulary.", ["Lost details", "Slow assistance", "Dependence on phrase apps"], "Enable live multilingual conversations from a mobile browser.", "More confident travel and faster help.", null],
  [HandHeart, "NGOs and humanitarian work", "Field teams and communities often work across urgent language barriers.", ["Time pressure", "Limited interpreters", "High-stakes context"], "Combine spoken translation, captions, and lightweight meeting links.", "Faster coordination while preserving original statements.", null],
  [Microscope, "Research collaboration", "International experts may understand the science but not every spoken nuance.", ["Missed questions", "Uneven discussion", "Manual transcript work"], "Translate seminars, working sessions, and written meeting chat.", "More equitable global research participation.", null],
  [Users, "Remote teams", "Distributed teams communicate across languages, locations, and devices.", ["Meeting fatigue", "Language switching", "Disconnected tools"], "Keep video, translated voice, captions, and chat in one workspace.", "Fewer handoffs and more inclusive daily collaboration.", "/images/global-meeting.png"],
  [Presentation, "Conferences", "A single stage language limits who can follow a session live.", ["Audience exclusion", "Separate caption tools", "Limited questions"], "Offer participant-language captions and translated meeting audio.", "A wider audience without duplicating sessions.", null],
  [Scale, "Legal meetings", "Legal conversations require accurate attribution and preserved original meaning.", ["Terminology risk", "Speaker ambiguity", "Documentation pressure"], "Display original and translated transcripts with clear speaker identity.", "Better communication support while retaining source context.", null],
];

function SolutionVisual({ Icon, image, title }) {
  return (
    <div className="solution-visual">
      {image ? <img src={image} alt={`${title} multilingual meeting`} loading="lazy" /> : (
        <div className="solution-visual__icon"><Icon size={72} strokeWidth={1.2} /></div>
      )}
      <div className="solution-visual__overlay"><span><Icon size={18} />Live translation</span><b>3 languages active</b></div>
    </div>
  );
}

export default function SolutionsPage() {
  return (
    <MarketingPage>
      <PageHeader eyebrow="Solutions" title="Language access for the conversations that matter" description="Translation Bot adapts one meeting experience to classrooms, consultations, global teams, public services, and live events.">
        <Link className="button button--primary button--large" to="/signup">Start a meeting</Link>
        <Link className="button button--secondary button--large" to="/features">Explore features</Link>
      </PageHeader>
      <section className="marketing-section">
        <div className="landing-shell">
          <SectionTitle eyebrow="Real-world impact" title="Start with the communication problem, not the technology" description="Each solution keeps the original speaker present while making the conversation accessible to more people." />
          <div className="solution-list">
            {solutions.map(([Icon, title, problem, pains, solution, impact, image], index) => (
              <article className={`solution-section ${index % 2 ? "is-reverse" : ""}`} key={title}>
                <div className="solution-section__copy">
                  <p className="section-eyebrow"><Icon size={16} />{title}</p>
                  <h2>{problem}</h2>
                  <div className="solution-section__columns">
                    <div><h3>Pain points</h3><ul>{pains.map((pain) => <li key={pain}>{pain}</li>)}</ul></div>
                    <div><h3>How we help</h3><p>{solution}</p></div>
                  </div>
                  <div className="solution-impact"><Building2 size={18} /><span><strong>Expected impact</strong>{impact}</span></div>
                  <Link className="button button--primary" to="/signup">Use Translation Bot</Link>
                </div>
                <SolutionVisual Icon={Icon} image={image} title={title} />
              </article>
            ))}
          </div>
        </div>
      </section>
      <CTASection title="Bring language access into your next meeting" text="Choose a room, invite participants, and let everyone communicate more naturally." />
    </MarketingPage>
  );
}
