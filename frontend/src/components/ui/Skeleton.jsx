export default function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-brand-bg/10 ${className}`}
      aria-hidden="true"
    />
  );
}
