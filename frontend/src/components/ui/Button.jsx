const VARIANTS = {
  primary: "bg-brand-accent text-white hover:brightness-110",
  secondary: "bg-ui-elevated text-ui-text hover:bg-white/[0.08]",
  ghost: "bg-transparent text-ui-muted hover:bg-white/[0.04] hover:text-ui-text",
  danger: "bg-ui-error/12 text-ui-error hover:bg-ui-error/20",
};

const SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  icon: "h-10 w-10 p-0",
};

export default function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-ui disabled:cursor-not-allowed disabled:opacity-40 ${
        VARIANTS[variant] || VARIANTS.secondary
      } ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
