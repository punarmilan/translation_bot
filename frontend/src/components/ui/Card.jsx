export default function Card({
  children,
  elevation = "surface",
  className = "",
  ...props
}) {
  const elevationClass =
    elevation === "elevated"
      ? "bg-ui-elevated shadow-panel"
      : elevation === "flat"
        ? "bg-transparent"
        : "bg-brand-mid";

  return (
    <div
      className={`rounded-panel border border-white/[0.06] ${elevationClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
