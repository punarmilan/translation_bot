export default function Panel({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <section className={`rounded-panel border border-white/[0.06] bg-brand-mid shadow-panel ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-brand-bg">{title}</h2>}
            {description && (
              <p className="mt-1 text-xs leading-5 text-ui-subtle">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={`p-4 ${title || action ? "pt-2" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
