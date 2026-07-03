export default function MetricCard({ value, label, detail, icon: Icon }) {
  return (
    <article className="metric-card">
      {Icon && <span className="metric-card__icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>}
      <strong>{value}</strong>
      <h3>{label}</h3>
      <p>{detail}</p>
    </article>
  );
}
