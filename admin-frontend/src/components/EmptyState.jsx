import { Inbox } from "lucide-react";

export default function EmptyState({ title = "Nothing here yet", description = "New records will appear here." }) {
  return <div className="admin-empty"><Inbox size={24} /><strong>{title}</strong><p>{description}</p></div>;
}
