export default function StatusBadge({ value = "unknown" }) {
  const normalized = String(value).toLowerCase();
  const tone = ["active", "online", "operational", "healthy"].includes(normalized)
    ? "success"
    : ["disabled", "ended", "error", "failed"].includes(normalized)
      ? "danger"
      : "neutral";
  return <span className={`admin-status admin-status--${tone}`}><i />{value}</span>;
}
