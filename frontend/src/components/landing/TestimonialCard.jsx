export default function TestimonialCard({ initials, name, role, quote }) {
  return (
    <article className="testimonial-card">
      <span className="demo-label">Demo content</span>
      <blockquote>“{quote}”</blockquote>
      <footer>
        <span className="testimonial-avatar" aria-hidden="true">{initials}</span>
        <span><strong>{name}</strong><small>{role}</small></span>
      </footer>
    </article>
  );
}
