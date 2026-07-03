export default function FeatureCard({ eyebrow, title, description, benefits, example, visual, icon: Icon, reverse = false }) {
  return (
    <article className={`feature-story ${reverse ? "feature-story--reverse" : ""}`}>
      <div className="feature-story__copy reveal">
        <p className="section-eyebrow feature-eyebrow">
          {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
          {eyebrow}
        </p>
        <h3>{title}</h3>
        <p>{description}</p>
        <ul className="check-list">
          {benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
        </ul>
        <p className="example-note"><strong>In practice:</strong> {example}</p>
      </div>
      <div className="feature-story__visual reveal" aria-hidden="true">{visual}</div>
    </article>
  );
}
