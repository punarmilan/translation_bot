export default function AdminPageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="admin-page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {children && <div className="admin-page-header__actions">{children}</div>}
    </header>
  );
}
