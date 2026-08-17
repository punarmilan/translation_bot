import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCmsPage, getPublicContent } from "../services/api";
import { MarketingPage, PageHeader } from "../components/marketing/MarketingPage";

// Maps CMS plan cards (see admin-backend's migrate_pricing.py seed data) onto
// the shape this page renders -- same pattern as FeaturesPage.jsx/SolutionsPage.jsx.
function splitLines(value) {
  return (value || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function cardToPlan(card) {
  return {
    title: card.title || "",
    description: card.description || "",
    currencySymbol: card.currency_symbol || "",
    priceAmount: card.price_amount || "",
    yearlyPriceAmount: card.yearly_price_amount || card.price_amount || "",
    pricePeriod: card.price_period || "",
    features: splitLines(card.features),
    badgeText: card.badge_text || "",
    highlighted: !!card.highlighted,
    ctaText: card.cta_text || "",
    ctaLink: card.cta_link || "",
  };
}

const plans = [
  {
    title: "Starter",
    description: "Perfect for individuals, students, and small team chats.",
    currencySymbol: "$", priceAmount: "0", yearlyPriceAmount: "0", pricePeriod: "/mo",
    features: [
      "English & Hindi support",
      "Live Text Translation",
      "Live Chat Translation",
      "Basic Captions",
      "Limited participants (up to 4)",
      "40-minute meeting duration limit",
      "24-hour meeting history",
    ],
    badgeText: "", highlighted: false, ctaText: "Choose Starter", ctaLink: "/signup",
  },
  {
    title: "Professional",
    description: "Optimized for remote professionals, remote teams, and teachers.",
    currencySymbol: "$", priceAmount: "19", yearlyPriceAmount: "15", pricePeriod: "/mo",
    features: [
      "All dynamic languages (10+)",
      "Voice Translation playback",
      "Screen Sharing",
      "Collaborative Whiteboard",
      "Shared Meeting Notes",
      "Local Meeting Recording",
      "AI Meeting Summaries",
      "Host Moderation Controls",
      "Up to 50 participants limit",
      "30-day meeting history",
    ],
    badgeText: "Most Popular", highlighted: true, ctaText: "Upgrade with Razorpay", ctaLink: "",
  },
  {
    title: "Enterprise",
    description: "Dedicated infrastructure and custom workflows for NGOs and corporate teams.",
    currencySymbol: "", priceAmount: "Custom", yearlyPriceAmount: "Custom", pricePeriod: "",
    features: [
      "Unlimited languages",
      "Unlimited participants & meetings",
      "Organizations, users & roles",
      "Multi-tenant Admin Dashboard",
      "Secure Webhooks and API access",
      "Dedicated Support and SLAs",
      "On-Premise / Self-Hosting Options",
      "Custom Branding settings",
    ],
    badgeText: "", highlighted: false, ctaText: "Contact Sales", ctaLink: "mailto:sales@giftme.watch",
  },
];

function PlanCTA({ text, link, primary }) {
  if (!text) return null;
  const cls = `button ${primary ? "button--primary" : "button--secondary"} w-full text-center`;
  if (!link) {
    return <button className={`button ${primary ? "button--primary" : "button--secondary"} w-full`}>{text}</button>;
  }
  if (link.startsWith("mailto:") || link.startsWith("http")) {
    return <a href={link} className={cls}>{text}</a>;
  }
  return <Link to={link} className={cls}>{text}</Link>;
}

function PlanCard({ plan, billingCycle }) {
  const amount = billingCycle === "yearly" && plan.yearlyPriceAmount ? plan.yearlyPriceAmount : plan.priceAmount;
  return (
    <div className={`pricing-card ${plan.highlighted ? "pricing-card--featured" : ""}`}>
      {plan.highlighted && plan.badgeText && <div className="pricing-card__badge">{plan.badgeText}</div>}
      <h3 className="pricing-card__title">{plan.title}</h3>
      <div className="pricing-card__price">
        {plan.currencySymbol && <span className="price-symbol">{plan.currencySymbol}</span>}
        <span className="price-amount">{amount}</span>
        {plan.pricePeriod && <span className="price-period">{plan.pricePeriod}</span>}
      </div>
      <p className="pricing-card__desc">{plan.description}</p>
      <ul className="pricing-card__features">
        {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
      </ul>
      <div className="pricing-card__action">
        <PlanCTA text={plan.ctaText} link={plan.ctaLink} primary={plan.highlighted} />
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [content, setContent] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [cmsSections, setCmsSections] = useState(null);

  useEffect(() => {
    getPublicContent()
      .then((res) => {
        const item = res.items.find((x) => x.key === "pricing.page");
        if (item) setContent(item.content);
      })
      .catch((err) => console.warn("Failed to load pricing page content", err));
  }, []);

  useEffect(() => {
    getCmsPage("pricing")
      .then((res) => setCmsSections(res.sections || []))
      .catch((err) => console.warn("Failed to load pricing CMS content, using built-in defaults", err));
  }, []);

  const plansSection = cmsSections?.find((s) => s.key === "sec_plans");
  const planItems = plansSection?.cards?.length ? plansSection.cards.map(cardToPlan) : plans;

  return (
    <MarketingPage>
      <PageHeader eyebrow="Pricing plans" title="Choose the plan that fits you best" description="Explore Starter, Professional, and Enterprise plans with transparent price points.">
        <Link className="button button--primary button--large" to="/signup">Get started now</Link>
      </PageHeader>

      <section className="marketing-section pricing-page-section">
        <div className="landing-shell">

          {/* Billing Cycle Selector Toggle */}
          <div className="billing-toggle-container">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`billing-toggle-btn ${billingCycle === "monthly" ? "is-active" : ""}`}
            >
              Billed Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={`billing-toggle-btn ${billingCycle === "yearly" ? "is-active" : ""}`}
            >
              Billed Annually
            </button>
            <span className="discount-badge">Save 20%</span>
          </div>

          <div className="pricing-grid">
            {planItems.map((plan) => <PlanCard key={plan.title} plan={plan} billingCycle={billingCycle} />)}
          </div>

          {/* Plan Comparison Matrix Table */}
          <div className="comparison-matrix mt-16 border-t border-white/[0.06] pt-16">
            <h3 className="text-xl font-bold text-center text-brand-bg mb-10">Compare plan features</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="pb-4 text-sm font-semibold text-brand-bg/50">Feature</th>
                    <th className="pb-4 text-sm font-semibold text-brand-bg">Starter</th>
                    <th className="pb-4 text-sm font-semibold text-brand-bg">Professional</th>
                    <th className="pb-4 text-sm font-semibold text-brand-bg">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-sm text-brand-bg/70">
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Included Languages</td>
                    <td className="py-4">English & Hindi</td>
                    <td className="py-4">All dynamic languages (10+)</td>
                    <td className="py-4">Unlimited dynamic & custom</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Translation Mode</td>
                    <td className="py-4">Live text only</td>
                    <td className="py-4">Live text + Voice Playback</td>
                    <td className="py-4">Live text + Voice Playback + Glossary Customization</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Collaborative Whiteboard</td>
                    <td className="py-4">View-only</td>
                    <td className="py-4">Fully editable</td>
                    <td className="py-4">Fully editable + custom templates</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Shared Meeting Notes</td>
                    <td className="py-4">No</td>
                    <td className="py-4">Yes</td>
                    <td className="py-4">Yes</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Meeting Recording</td>
                    <td className="py-4">No</td>
                    <td className="py-4">Yes (Local browser storage)</td>
                    <td className="py-4">Yes (Local & Server-side options)</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">AI Summary & Timeline</td>
                    <td className="py-4">No</td>
                    <td className="py-4">Basic summary</td>
                    <td className="py-4">Advanced insights, tasks, decisions & timelines</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Max Participants</td>
                    <td className="py-4">Up to 4</td>
                    <td className="py-4">Up to 50</td>
                    <td className="py-4">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Organization Admin Console</td>
                    <td className="py-4">No</td>
                    <td className="py-4">No</td>
                    <td className="py-4">Yes (Organizations &rarr; Users &rarr; Roles)</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-brand-bg">Secure Webhooks</td>
                    <td className="py-4">No</td>
                    <td className="py-4">No</td>
                    <td className="py-4">Yes (HMAC signed callback posts)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>
    </MarketingPage>
  );
}
