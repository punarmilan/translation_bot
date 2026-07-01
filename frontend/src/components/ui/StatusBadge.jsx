const TONES = {
  green: "bg-ui-success/10 text-ui-success",
  yellow: "bg-ui-warning/10 text-ui-warning",
  red: "bg-ui-error/10 text-ui-error",
  blue: "bg-brand-accent/12 text-brand-accent",
  neutral: "bg-white/[0.04] text-ui-muted",
};

export default function StatusBadge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${TONES[tone] || TONES.neutral} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {children}
    </span>
  );
}
