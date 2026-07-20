import { Bell, Download, FileClock, Lock, LogOut, MessageSquareOff, MicOff, RefreshCw, Search, Unlock, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { exportMeeting as requestMeetingExport, getMeetingLogs, getMeetings, issueMeetingCommand, meetingAction, getMeetingParticipants } from "../services/api";

function formatDuration(seconds) {
  if (seconds == null) return "-";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function MeetingsPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [filters, setFilters] = useState({ search: "", status: "", page: 1, page_size: 20 });
  const [message, setMessage] = useState("");
  const [manageRoom, setManageRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [broadcastRoom, setBroadcastRoom] = useState(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getMeetings(filters)
      .then((payload) => {
        setData(payload);
        setMessage("");
      })
      .catch((error) => {
        setMessage(error.response?.data?.detail || "Could not load meetings");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [filters.page, filters.status]);

  const endMeeting = async (meeting) => {
    if (!window.confirm(`End ${meeting.meeting_name}?`)) return;
    try {
      const result = await meetingAction(meeting.room_id, "end");
      setMessage(result.note || "End meeting command queued");
      load();
    } catch (err) {
      setMessage("Failed to end meeting: " + (err.response?.data?.detail || err.message));
    }
  };

  const loadParticipants = (roomId) => {
    getMeetingParticipants(roomId)
      .then((data) => setParticipants(data.items || []))
      .catch((err) => setMessage("Could not load participants: " + (err.response?.data?.detail || err.message)));
  };

  const openManageParticipants = (room) => {
    setManageRoom(room);
    setParticipants([]);
    loadParticipants(room.room_id);
  };

  const handleParticipantAction = async (user, actionType) => {
    let command_type = "";
    let payload = {};
    if (actionType === "kick") {
      command_type = "KICK_PARTICIPANT";
    } else if (actionType === "mute") {
      command_type = "MUTE_PARTICIPANT";
    } else if (actionType === "unmute") {
      command_type = "UNMUTE_PARTICIPANT";
    } else if (actionType === "promote") {
      command_type = "PROMOTE_USER";
      payload = { role: "host" };
    } else if (actionType === "transfer") {
      command_type = "TRANSFER_HOST";
    } else if (actionType === "suspend") {
      command_type = "SUSPEND_USER";
    } else if (actionType === "remove") {
      command_type = "REMOVE_USER";
    }
    
    try {
      const result = await issueMeetingCommand(manageRoom.room_id, {
        command_type,
        target_user_id: user.user_id,
        payload
      });
      setMessage(result.note || `${command_type} command queued successfully.`);
      if (actionType !== "suspend" && actionType !== "kick" && actionType !== "remove") {
        setTimeout(() => loadParticipants(manageRoom.room_id), 1000);
      } else {
        setParticipants((current) => current.filter((p) => p.user_id !== user.user_id));
      }
    } catch (err) {
      setMessage("Action failed: " + (err.response?.data?.detail || err.message));
    }
  };

  const exportMeeting = async (meeting) => {
    try {
      const payload = await requestMeetingExport(meeting.room_id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${meeting.room_id}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Meeting export failed");
    }
  };

  const command = async (meeting, commandType, extra = {}) => {
    try {
      const result = await issueMeetingCommand(meeting.room_id, { command_type: commandType, ...extra });
      setMessage(`${commandType}: ${result.status} - ${result.note || result.acknowledgement?.message || ""}`);
      load();
    } catch (err) {
      setMessage(`Command ${commandType} failed: ` + (err.response?.data?.detail || err.message));
    }
  };

  const broadcast = async () => {
    if (!broadcastMessage.trim()) return;
    await command(broadcastRoom, "SEND_SYSTEM_NOTIFICATION", { message: broadcastMessage.trim() });
    setBroadcastRoom(null);
    setBroadcastMessage("");
  };

  const showLogs = async (meeting) => {
    try {
      const payload = await getMeetingLogs(meeting.room_id);
      setLogs(payload);
    } catch (err) {
      setMessage("Failed to load logs: " + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <>
      <AdminPageHeader eyebrow="Operations" title="Meetings" description="Inspect persisted room records and queue audited moderation commands." />
      
      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={14} /></button></div>}
      
      <section className="admin-toolbar">
        <label><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Search meeting name or room ID" /></label>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <button className="admin-button admin-button--primary" onClick={load}>Search</button>
      </section>

      {loading ? (
        <div className="admin-skeleton" style={{ height: "180px" }} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No meetings found" description="Adjust your filters or wait for meetings to start." />
      ) : (
        <section className="admin-table-panel">
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Host</th>
                  <th>Participants</th>
                  <th>Duration</th>
                  <th>Languages</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((meeting) => (
                  <tr key={meeting.meeting_id || meeting.room_id}>
                    <td><strong>{meeting.meeting_name}</strong><small className="admin-table-subtitle">{meeting.room_id}</small></td>
                    <td>{meeting.host}</td>
                    <td>{meeting.participants}</td>
                    <td>{formatDuration(meeting.duration_seconds)}</td>
                    <td>{meeting.languages?.length ? meeting.languages.join(", ") : "-"}</td>
                    <td><StatusBadge value={meeting.status} /></td>
                    <td><StatusBadge value={meeting.connection_quality} /></td>
                    <td>
                      <div className="admin-row-actions">
                        <button title="End meeting" className="is-danger" disabled={meeting.status !== "active"} onClick={() => endMeeting(meeting)}><LogOut size={15} /></button>
                        <button title="Manage participants" onClick={() => openManageParticipants(meeting)}><Users size={15} /></button>
                        <button title="Lock meeting" onClick={() => command(meeting, "LOCK_MEETING")}><Lock size={15} /></button>
                        <button title="Unlock meeting" onClick={() => command(meeting, "UNLOCK_MEETING")}><Unlock size={15} /></button>
                        <button title="Mute all" onClick={() => command(meeting, "MUTE_ALL")}><MicOff size={15} /></button>
                        <button title="Disable chat" onClick={() => command(meeting, "DISABLE_CHAT")}><MessageSquareOff size={15} /></button>
                        <button title="Enable chat" onClick={() => command(meeting, "ENABLE_CHAT")}><MessageSquareOff size={15} /></button>
                        <button title="Disable translation" onClick={() => command(meeting, "DISABLE_TRANSLATION")}><X size={15} /></button>
                        <button title="Enable translation" onClick={() => command(meeting, "ENABLE_TRANSLATION")}><RefreshCw size={15} /></button>
                        <button title="Force reconnect" onClick={() => command(meeting, "FORCE_RECONNECT")}><RefreshCw size={15} /></button>
                        <button title="Broadcast message" onClick={() => setBroadcastRoom(meeting)}><Bell size={15} /></button>
                        <button title="Export meeting" onClick={() => exportMeeting(meeting)}><Download size={15} /></button>
                        <button title="View logs" onClick={() => showLogs(meeting)}><FileClock size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            <span>{data.total} meetings</span>
            <div>
              <button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button>
              <b>Page {filters.page}</b>
              <button disabled={filters.page * filters.page_size >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button>
            </div>
          </footer>
        </section>
      )}

      {manageRoom && (
        <div className="admin-modal-backdrop" onMouseDown={() => setManageRoom(null)}>
          <section className="admin-modal admin-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Meeting moderation</span>
                <h2>Manage participants for {manageRoom.meeting_name}</h2>
              </div>
              <button onClick={() => setManageRoom(null)} aria-label="Close"><X /></button>
            </header>
            <div style={{ maxHeight: "350px", overflowY: "auto" }} className="admin-table-scroll">
              {participants.length === 0 ? (
                <p style={{ padding: "20px", textAlign: "center" }}>No active participants in this meeting.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Email</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.user_id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              backgroundColor: "#3b82f6",
                              color: "#ffffff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "bold",
                              fontSize: "12px"
                            }}>
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <strong>{p.name}</strong>
                              <div style={{ fontSize: "11px", color: "#6b7280" }}>@{p.username}</div>
                            </div>
                          </div>
                        </td>
                        <td>{p.email}</td>
                        <td>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            <button title="Mute" className="admin-button admin-button--secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleParticipantAction(p, "mute")}>Mute</button>
                            <button title="Unmute" className="admin-button admin-button--secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleParticipantAction(p, "unmute")}>Unmute</button>
                            <button title="Promote to Host" className="admin-button admin-button--secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleParticipantAction(p, "promote")}>Promote</button>
                            <button title="Transfer Host" className="admin-button admin-button--secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleParticipantAction(p, "transfer")}>Transfer Host</button>
                            <button title="Kick" className="admin-button admin-button--danger" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleParticipantAction(p, "kick")}>Kick</button>
                            <button title="Suspend" className="admin-button admin-button--danger" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => handleParticipantAction(p, "suspend")}>Suspend</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}

      {broadcastRoom && (
        <div className="admin-modal-backdrop" onMouseDown={() => setBroadcastRoom(null)}>
          <section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Live notification</span>
                <h2>Broadcast to {broadcastRoom.meeting_name}</h2>
              </div>
              <button onClick={() => setBroadcastRoom(null)} aria-label="Close"><X /></button>
            </header>
            <label>Message<textarea value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)} placeholder="Write a system notification for everyone in the room." /></label>
            <button className="admin-button admin-button--primary" onClick={broadcast}>Send live notification</button>
          </section>
        </div>
      )}

      {logs && (
        <div className="admin-modal-backdrop" onMouseDown={() => setLogs(null)}>
          <section className="admin-modal admin-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Meeting logs</span>
                <h2>{logs.room_id}</h2>
              </div>
              <button onClick={() => setLogs(null)} aria-label="Close"><X /></button>
            </header>
            <div className="admin-log-list">
              {(logs.items || []).map((item, index) => (
                <article key={index}>
                  <strong>{item.source_language || item.detected_language || "unknown"} → {item.target_language || "unknown"}</strong>
                  <small>{item.timestamp || item.created_at || ""}</small>
                  <p>{item.original_text || item.text || item.error || JSON.stringify(item)}</p>
                </article>
              ))}
              {logs.items?.length === 0 && <p>No logs found for this meeting.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
