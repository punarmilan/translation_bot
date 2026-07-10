import { Eye, Search, X, MessageSquare, Star, UserCheck, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { getModule } from "../services/api";
import axios from "axios";

export default function FeedbackPage() {
  const [items, setItems] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getModule("feedback");
      setItems(data.items || []);

      const usersRes = await getModule("users", { role: "admin", page_size: 100 });
      setAdmins(usersRes.items || []);
      setMessage("");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not load feedback records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpdate = async (item_id, body) => {
    try {
      const apiBase = import.meta.env.VITE_ADMIN_API_URL || "";
      const res = await axios.patch(`${apiBase}/api/admin/feedback/${item_id}`, body, { withCredentials: true });
      setMessage("Feedback triaged successfully");
      
      setItems((prev) => prev.map((item) => item._id === item_id ? res.data : item));
      if (selected && selected._id === item_id) {
        setSelected(res.data);
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || "Triage update failed");
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const apiBase = import.meta.env.VITE_ADMIN_API_URL || "";
      const res = await axios.patch(
        `${apiBase}/api/admin/feedback/${selected._id}`,
        { reply: replyText, status: "reviewing" },
        { withCredentials: true }
      );
      setSelected(res.data);
      setReplyText("");
      setItems((prev) => prev.map((item) => item._id === selected._id ? res.data : item));
      setMessage("Reply posted successfully");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Failed to post reply");
    } finally {
      setReplying(false);
    }
  };

  const renderStars = (rating) => {
    return (
      <div style={{ display: "flex", color: "#FFD700", gap: "2px" }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={15} fill={i < rating ? "#FFD700" : "none"} stroke={i < rating ? "none" : "#CCC"} />
        ))}
      </div>
    );
  };

  const filtered = items.filter((item) => {
    const matchesQuery = JSON.stringify(item).toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "" || item.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <>
      <AdminPageHeader eyebrow="Customers" title="Feedback & Triage" description="Review product bug reports, features request tickets, and star ratings left by platform participants." />

      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}

      <section className="admin-toolbar">
        <label>
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search feedback tickets" />
        </label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </section>

      {loading ? (
        <div className="admin-skeleton" />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="admin-table-panel">
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Topic / Summary</th>
                  <th>Category</th>
                  <th>Rating</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <div>
                        <strong>{item.title || "User rating feedback"}</strong>
                        <p style={{ fontSize: "0.85rem", color: "var(--admin-muted)", margin: "3px 0 0 0" }}>{item.description || "N/A"}</p>
                      </div>
                    </td>
                    <td><code>{item.category || "rating"}</code></td>
                    <td>{item.rating != null ? renderStars(item.rating) : "-"}</td>
                    <td>
                      <select 
                        value={item.assigned_to || ""} 
                        onChange={(e) => handleUpdate(item._id, { assigned_to: e.target.value || null })}
                        style={{ padding: "3px 8px", fontSize: "0.85rem" }}
                      >
                        <option value="">-- Unassigned --</option>
                        {admins.map(a => <option key={a.user_id} value={a.name}>{a.name}</option>)}
                      </select>
                    </td>
                    <td><StatusBadge value={item.status || "new"} /></td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "-"}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button title="View Detail and Triage" onClick={() => setSelected(item)}>
                          <Eye size={15} />
                        </button>
                        {item.status !== "resolved" && (
                          <button 
                            className="is-success" 
                            title="Quick Resolve" 
                            onClick={() => handleUpdate(item._id, { status: "resolved" })}
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && (
        <div className="admin-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="admin-modal" style={{ maxWidth: "600px" }} onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span>Triage Ticket: {selected.category || "rating"}</span>
                <h2>{selected.title || "User Feedback"}</h2>
              </div>
              <button onClick={() => setSelected(null)}><X /></button>
            </header>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", margin: "1rem 0" }}>
              <div>
                <strong>Description:</strong>
                <p style={{ margin: "5px 0 0 0", color: "#555" }}>{selected.description || "No description provided."}</p>
              </div>

              {selected.rating != null && (
                <div>
                  <strong>User rating:</strong>
                  <div style={{ marginTop: "5px" }}>{renderStars(selected.rating)}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: "1rem" }}>
                <label style={{ flex: 1 }}>Status
                  <select 
                    value={selected.status || "new"} 
                    onChange={(e) => handleUpdate(selected._id, { status: e.target.value })}
                  >
                    <option value="new">New</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>

                <label style={{ flex: 1 }}>Assignee
                  <select 
                    value={selected.assigned_to || ""} 
                    onChange={(e) => handleUpdate(selected._id, { assigned_to: e.target.value || null })}
                  >
                    <option value="">-- Unassigned --</option>
                    {admins.map(a => <option key={a.user_id} value={a.name}>{a.name}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ borderTop: "1px solid #EEE", paddingTop: "1rem" }}>
                <h4 style={{ fontWeight: "bold", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <MessageSquare size={16} /> Conversation replies
                </h4>
                
                <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", background: "#F9F9F9", padding: "10px", borderRadius: "5px", marginBottom: "10px" }}>
                  {(!selected.replies || selected.replies.length === 0) ? (
                    <p style={{ fontStyle: "italic", color: "#999", margin: 0, fontSize: "0.85rem" }}>No replies yet.</p>
                  ) : (
                    selected.replies.map((reply, i) => (
                      <div key={i} style={{ paddingBottom: "6px", borderBottom: i < selected.replies.length - 1 ? "1px solid #EEE" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#777", marginBottom: "2px" }}>
                          <strong>{reply.actor_id === "user" ? "Reporter" : "Admin support"}</strong>
                          <span>{new Date(reply.created_at).toLocaleString()}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.9rem" }}>{reply.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="text" 
                    value={replyText} 
                    onChange={(e) => setReplyText(e.target.value)} 
                    placeholder="Type support reply..."
                    onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                    style={{ flex: 1, padding: "8px 12px" }}
                  />
                  <button 
                    className="admin-button admin-button--primary" 
                    disabled={replying || !replyText.trim()}
                    onClick={handleSendReply}
                    style={{ padding: "0 16px" }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
