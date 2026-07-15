import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicContent } from "../services/api";
import { MarketingPage, PageHeader } from "../components/marketing/MarketingPage";

export default function PricingPage() {
  const [content, setContent] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");

  useEffect(() => {
    getPublicContent()
      .then((res) => {
        const item = res.items.find((x) => x.key === "pricing.page");
        if (item) setContent(item.content);
      })
      .catch((err) => console.warn("Failed to load pricing page content", err));
  }, []);

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
            {/* Plan 1: Starter */}
            <div className="pricing-card">
              <h3 className="pricing-card__title">Starter</h3>
              <div className="pricing-card__price">
                <span className="price-symbol">$</span>
                <span className="price-amount">0</span>
                <span className="price-period">/mo</span>
              </div>
              <p className="pricing-card__desc">Perfect for individuals, students, and small team chats.</p>
              <ul className="pricing-card__features">
                <li>✓ English & Hindi support</li>
                <li>✓ Live Text Translation</li>
                <li>✓ Live Chat Translation</li>
                <li>✓ Basic Captions</li>
                <li>✓ Limited participants (up to 4)</li>
                <li>✓ 40-minute meeting duration limit</li>
                <li>✓ 24-hour meeting history</li>
              </ul>
              <div className="pricing-card__action">
                <Link to="/signup" className="button button--secondary w-full text-center">
                  Choose Starter
                </Link>
              </div>
            </div>

            {/* Plan 2: Professional */}
            <div className="pricing-card pricing-card--featured">
              <div className="pricing-card__badge">Most Popular</div>
              <h3 className="pricing-card__title">Professional</h3>
              <div className="pricing-card__price">
                <span className="price-symbol">$</span>
                <span className="price-amount">{billingCycle === "monthly" ? "19" : "15"}</span>
                <span className="price-period">/mo</span>
              </div>
              <p className="pricing-card__desc">Optimized for remote professionals, remote teams, and teachers.</p>
              <ul className="pricing-card__features">
                <li>✓ All dynamic languages (10+)</li>
                <li>✓ Voice Translation playback</li>
                <li>✓ Screen Sharing</li>
                <li>✓ Collaborative Whiteboard</li>
                <li>✓ Shared Meeting Notes</li>
                <li>✓ Local Meeting Recording</li>
                <li>✓ AI Meeting Summaries</li>
                <li>✓ Host Moderation Controls</li>
                <li>✓ Up to 50 participants limit</li>
                <li>✓ 30-day meeting history</li>
              </ul>
              <div className="pricing-card__action">
                <button className="button button--primary w-full">
                  Upgrade with Razorpay
                </button>
              </div>
            </div>

            {/* Plan 3: Enterprise */}
            <div className="pricing-card">
              <h3 className="pricing-card__title">Enterprise</h3>
              <div className="pricing-card__price">
                <span className="price-amount">Custom</span>
              </div>
              <p className="pricing-card__desc">Dedicated infrastructure and custom workflows for NGOs and corporate teams.</p>
              <ul className="pricing-card__features">
                <li>✓ Unlimited languages</li>
                <li>✓ Unlimited participants & meetings</li>
                <li>✓ Organizations, users & roles</li>
                <li>✓ Multi-tenant Admin Dashboard</li>
                <li>✓ Secure Webhooks and API access</li>
                <li>✓ Dedicated Support and SLAs</li>
                <li>✓ On-Premise / Self-Hosting Options</li>
                <li>✓ Custom Branding settings</li>
              </ul>
              <div className="pricing-card__action">
                <a href="mailto:sales@giftme.watch" className="button button--secondary w-full text-center">
                  Contact Sales
                </a>
              </div>
            </div>
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
