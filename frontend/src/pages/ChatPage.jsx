import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAdminUsers, getAllRoomStats, parseApiError } from "../services/api";

const WS_BASE_URL = "ws://localhost:8000/ws";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Japanese", value: "ja" },
  { label: "Marathi", value: "mr" },
];

const SIGNALING_TYPES = new Set([
  "webrtc_offer",
  "webrtc_answer",
  "webrtc_ice_candidate",
  "call_request",
  "call_accept",
  "call_reject",
  "call_end",
]);

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function avatarInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Join Form ──────────────────────────────────────────────────────────────
function JoinForm({ defaultUsername, defaultLang, defaultRole, onJoin }) {
  const [form, setForm] = useState({
    username: defaultUsername || "",
    roomId: "",
    userLang: defaultLang || "en",
    role: defaultRole || "participant",
  });

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const canJoin = form.username.trim() && form.roomId.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canJoin) return;
    onJoin({
      username: form.username.trim(),
      roomId: form.roomId.trim(),
      userLang: form.userLang,
      role: form.role,
    });
  };

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-brand-mid rounded-2xl p-8 border border-white/10 shadow-2xl"
      >
        <h1 className="text-xl font-semibold text-brand-bg mb-1">Join a Room</h1>
        <p className="text-brand-bg/50 text-sm mb-7">
          Enter a room ID to start chatting in your language.
        </p>

        <label className="block mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-bg/50 block mb-1.5">
            Username
          </span>
          <input
            value={form.username}
            onChange={set("username")}
            className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
            placeholder="Bhumika"
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-bg/50 block mb-1.5">
            Room ID
          </span>
          <input
            value={form.roomId}
            onChange={set("roomId")}
            className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
            placeholder="team-room-1"
          />
        </label>

        <div className="grid grid-cols-2 gap-4 mb-7">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-bg/50 block mb-1.5">
              Language
            </span>
            <select
              value={form.userLang}
              onChange={set("userLang")}
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none focus:border-brand-accent transition"
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-bg/50 block mb-1.5">
              Account role
            </span>
            <select
              value={form.role}
              disabled
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg/70 text-sm outline-none cursor-not-allowed"
            >
              <option value={form.role}>{form.role}</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={!canJoin}
          className="w-full bg-brand-accent text-brand-bg py-3 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Join Room
        </button>
      </form>
    </div>
  );
}

// ─── Member Avatar ───────────────────────────────────────────────────────────
function MemberCard({ member, isSelf, callState, onCall }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition group">
      <div className="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
        {avatarInitials(member.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-bg truncate">
          {member.username}
          {isSelf && <span className="text-brand-bg/40 text-xs ml-1">(you)</span>}
        </p>
        <p className="text-xs text-brand-bg/40 capitalize">
          {member.role} · {member.preferred_language}
        </p>
      </div>
      {!isSelf && (
        <button
          type="button"
          onClick={() => onCall(member)}
          disabled={callState !== "idle"}
          className="opacity-0 group-hover:opacity-100 text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition hover:bg-emerald-500/30"
        >
          Call
        </button>
      )}
    </div>
  );
}

// ─── Call Panel ──────────────────────────────────────────────────────────────
function CallPanel({ callState, incomingCall, activePeer, callError, isMuted, onAccept, onReject, onEnd, onToggleMute, remoteAudioRef }) {
  const stateLabel = {
    idle: "No active call",
    incoming: `${incomingCall?.username || "Someone"} is calling…`,
    calling: `Connecting with ${activePeer?.username || "peer"}…`,
    connected: `Connected · ${activePeer?.username || "peer"}`,
  }[callState];

  const statusColor = {
    idle: "text-brand-bg/40",
    incoming: "text-yellow-300",
    calling: "text-blue-300",
    connected: "text-emerald-300",
  }[callState];

  return (
    <div className="mt-4 rounded-xl bg-brand-dark/60 border border-white/10 p-4">
      <p className="text-xs uppercase tracking-widest font-semibold text-brand-bg/40 mb-2">Voice</p>
      <p className={`text-sm font-medium ${statusColor}`}>{stateLabel}</p>
      {callError && <p className="mt-1.5 text-xs text-red-400">{callError}</p>}

      {callState === "incoming" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 bg-emerald-500/20 text-emerald-300 text-xs font-semibold py-2 rounded-lg hover:bg-emerald-500/30 transition"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex-1 bg-red-500/20 text-red-300 text-xs font-semibold py-2 rounded-lg hover:bg-red-500/30 transition"
          >
            Reject
          </button>
        </div>
      )}

      {(callState === "calling" || callState === "connected") && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            className="flex-1 border border-white/10 text-brand-bg/70 text-xs font-semibold py-2 rounded-lg hover:border-white/20 transition"
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="flex-1 bg-red-500/20 text-red-300 text-xs font-semibold py-2 rounded-lg hover:bg-red-500/30 transition"
          >
            End Call
          </button>
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
    </div>
  );
}

function AdminPanel({ users, stats, loading, error, onRefresh }) {
  return (
    <div className="mt-4 rounded-xl bg-brand-dark/60 border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-bg/40">
          Admin
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-brand-accent hover:opacity-80"
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-brand-bg/40">Loading admin data...</p>
      ) : error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-brand-bg/40 mb-1">Users</p>
            <p className="text-sm text-brand-bg">{users.length} registered</p>
          </div>
          <div>
            <p className="text-xs text-brand-bg/40 mb-1">Active rooms</p>
            <p className="text-sm text-brand-bg">{stats.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message, isMine, showTranslationDebug }) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="bg-brand-mid/40 text-brand-bg/50 text-xs px-3 py-1 rounded-full">
          {message.text} · {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
          isMine
            ? "bg-brand-accent text-brand-bg rounded-br-sm"
            : "bg-brand-mid text-brand-bg rounded-bl-sm"
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-semibold ${isMine ? "text-brand-bg/80" : "text-brand-accent"}`}>
            {message.sender}
          </span>
          {message.delivery_mode === "direct" && (
            <span className="bg-white/10 text-brand-bg/60 text-[10px] px-1.5 py-0.5 rounded-md">
              Private{message.target_name ? ` → ${message.target_name}` : ""}
            </span>
          )}
          <span className="text-[10px] text-brand-bg/40 ml-auto">{formatTime(message.timestamp)}</span>
        </div>
        <p className="text-sm leading-relaxed">{message.translated}</p>
        {message.original !== message.translated && (
          <p className="mt-1.5 pt-1.5 border-t border-white/10 text-[11px] text-brand-bg/40 leading-relaxed">
            {message.original}
          </p>
        )}
        {showTranslationDebug && (
          <div className="mt-2 pt-2 border-t border-white/10 text-[10px] leading-relaxed text-brand-bg/45">
            <p>
              {message.detected_language || "unknown"} to{" "}
              {message.target_language || "unknown"} ·{" "}
              {message.translation_status || "unknown"} ·{" "}
              {message.cache_hit ? "cache hit" : "cache miss"}
            </p>
            <p className="truncate">{message.translated}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ChatPage ───────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user, logout, loading } = useAuth();

  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [userRole, setUserRole] = useState("participant");
  const [selectedRecipient, setSelectedRecipient] = useState("all");
  const [callState, setCallState] = useState("idle");
  const [activePeer, setActivePeer] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callError, setCallError] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminStats, setAdminStats] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [showTranslationDebug, setShowTranslationDebug] = useState(() => {
    return localStorage.getItem("translation_debug") === "true";
  });

  const socketRef = useRef(null);
  const listEndRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const activePeerRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const sessionIdRef = useRef(null);
  const membersRef = useRef([]);
  const isMutedRef = useRef(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <span className="text-brand-bg/40 text-sm">Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ── Helpers ──

  const sendSocketMessage = (payload) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(payload));
    return true;
  };

  const sendSignal = (type, targetSessionId, payload = null) =>
    sendSocketMessage({
      type,
      room_id: session?.roomId,
      target_session_id: targetSessionId,
      payload,
    });

  const stopLocalMedia = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  };

  const cleanupCall = (notifyPeer = false) => {
    const peerSid = activePeerRef.current?.session_id;
    if (notifyPeer && peerSid) sendSignal("call_end", peerSid);
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];
    stopLocalMedia();
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    activePeerRef.current = null;
    isMutedRef.current = false;
    setActivePeer(null);
    setIncomingCall(null);
    setCallState("idle");
    setIsMuted(false);
  };

  const findMember = (sid) =>
    membersRef.current.find((m) => m.session_id === sid) || {
      session_id: sid,
      username: "Peer",
      preferred_language: "",
    };

  const ensureLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    stream.getAudioTracks().forEach((t) => { t.enabled = !isMutedRef.current; });
    return stream;
  };

  const createPeerConnection = (peerSid) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal("webrtc_ice_candidate", peerSid, { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current && e.streams[0]) remoteAudioRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") { setCallState("connected"); setCallError(""); }
      if (s === "failed" || s === "disconnected") {
        setCallError("Peer connection failed.");
        sendSignal("call_end", peerSid, { reason: "peer_connection_failure", state: s });
        cleanupCall(false);
      }
    };
    return pc;
  };

  const addLocalTracks = async (pc) => {
    const stream = await ensureLocalAudio();
    const senders = pc.getSenders();
    stream.getTracks().forEach((t) => {
      if (!senders.some((s) => s.track?.id === t.id)) pc.addTrack(t, stream);
    });
  };

  const flushPendingIce = async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const candidates = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];
    for (const c of candidates) await pc.addIceCandidate(c);
  };

  const startCall = (member) => {
    setCallError("");
    setActivePeer(member);
    activePeerRef.current = member;
    setCallState("calling");
    sendSignal("call_request", member.session_id);
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      setCallError("");
      const peer = incomingCall;
      setActivePeer(peer);
      activePeerRef.current = peer;
      setCallState("calling");
      const pc = createPeerConnection(peer.session_id);
      await addLocalTracks(pc);
      sendSignal("call_accept", peer.session_id);
      setIncomingCall(null);
    } catch {
      setCallError("Microphone permission required.");
      sendSignal("call_reject", incomingCall.session_id, { reason: "microphone_unavailable" });
      cleanupCall(false);
    }
  };

  const rejectCall = () => {
    if (incomingCall) sendSignal("call_reject", incomingCall.session_id);
    setIncomingCall(null);
    setCallState("idle");
  };

  const endCall = () => cleanupCall(true);

  const toggleMute = () => {
    const next = !isMuted;
    isMutedRef.current = next;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsMuted(next);
  };

  const handleCallAccepted = async (payload) => {
    const peer = findMember(payload.sender_session_id);
    try {
      setActivePeer(peer);
      activePeerRef.current = peer;
      const pc = createPeerConnection(peer.session_id);
      await addLocalTracks(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal("webrtc_offer", peer.session_id, { description: pc.localDescription });
    } catch {
      setCallError("Could not start audio call.");
      cleanupCall(true);
    }
  };

  const handleOffer = async (payload) => {
    const peer = findMember(payload.sender_session_id);
    try {
      setActivePeer(peer);
      activePeerRef.current = peer;
      const pc = createPeerConnection(peer.session_id);
      await addLocalTracks(pc);
      await pc.setRemoteDescription(payload.payload.description);
      await flushPendingIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal("webrtc_answer", peer.session_id, { description: pc.localDescription });
      setCallState("connected");
      setCallError("");
    } catch {
      setCallError("Could not answer audio call.");
      cleanupCall(true);
    }
  };

  const handleAnswer = async (payload) => {
    try {
      await peerConnectionRef.current?.setRemoteDescription(payload.payload.description);
      await flushPendingIce();
      setCallState("connected");
      setCallError("");
    } catch {
      setCallError("Could not connect audio call.");
      cleanupCall(true);
    }
  };

  const handleIceCandidate = async (payload) => {
    const candidateData = payload.payload?.candidate;
    if (!candidateData) return;
    const candidate = new RTCIceCandidate(candidateData);
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) {
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      setCallError("Could not add ICE candidate.");
    }
  };

  const handleSignalingMessage = async (payload) => {
    if (payload.target_session_id !== sessionIdRef.current) return;
    if (payload.type === "call_request") {
      setIncomingCall({ session_id: payload.sender_session_id, username: payload.sender_name, preferred_language: "" });
      setCallState("incoming");
      setCallError("");
      return;
    }
    if (payload.type === "call_accept") { await handleCallAccepted(payload); return; }
    if (payload.type === "call_reject") { setCallError(`${payload.sender_name} rejected the call.`); cleanupCall(false); return; }
    if (payload.type === "call_end") { cleanupCall(false); return; }
    if (payload.type === "webrtc_offer") { await handleOffer(payload); return; }
    if (payload.type === "webrtc_answer") { await handleAnswer(payload); return; }
    if (payload.type === "webrtc_ice_candidate") { await handleIceCandidate(payload); }
  };

  const loadAdminData = async () => {
    if (user?.role !== "admin") return;
    setAdminLoading(true);
    setAdminError("");
    try {
      const [users, stats] = await Promise.all([
        getAdminUsers(),
        getAllRoomStats(),
      ]);
      setAdminUsers(users);
      setAdminStats(stats);
    } catch (err) {
      setAdminError(parseApiError(err) || "Could not load admin data.");
    } finally {
      setAdminLoading(false);
    }
  };

  // ── Effects ──

  useEffect(() => {
    if (!session) return;
    const token = localStorage.getItem("access_token");
    const roomId = encodeURIComponent(session.roomId);
    const userLang = encodeURIComponent(session.userLang);
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const socket = new WebSocket(`${WS_BASE_URL}/${roomId}/${userLang}${tokenParam}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(JSON.stringify({ type: "join", username: session.username, room_id: session.roomId, role: session.role }));
    };
    socket.onclose = () => { setIsConnected(false); cleanupCall(false); };
    socket.onmessage = async (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "connection_ack") {
        sessionIdRef.current = payload.session_id;
        membersRef.current = payload.members || [];
        setSessionId(payload.session_id);
        setUserRole(payload.role || "participant");
        setMembers(payload.members || []);
        return;
      }
      if (payload.type === "room_presence") {
        membersRef.current = payload.members || [];
        setMembers(payload.members || []);
        return;
      }
      if (SIGNALING_TYPES.has(payload.type)) { await handleSignalingMessage(payload); return; }
      setMessages((prev) => [...prev, { ...payload, id: crypto.randomUUID() }]);
    };

    return () => { cleanupCall(true); socket.close(); socketRef.current = null; };
  }, [session]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    loadAdminData();
  }, [user?.role]);

  useEffect(() => {
    localStorage.setItem("translation_debug", showTranslationDebug ? "true" : "false");
  }, [showTranslationDebug]);

  const directTargets = members.filter((m) => {
    if (m.session_id === sessionId) return false;
    if (userRole === "admin") return true;
    return userRole === "host" ? m.role === "participant" : m.role === "host";
  });

  useEffect(() => {
    if (selectedRecipient !== "all" && !directTargets.some((m) => m.session_id === selectedRecipient)) {
      setSelectedRecipient("all");
    }
  }, [directTargets, selectedRecipient]);

  const joinRoom = (data) => {
    sessionIdRef.current = null;
    membersRef.current = [];
    setMessages([]);
    setMembers([]);
    setSelectedRecipient("all");
    setSession(data);
  };

  const leaveRoom = () => {
    cleanupCall(true);
    socketRef.current?.close();
    setSession(null);
    sessionIdRef.current = null;
    membersRef.current = [];
    setSessionId(null);
    setUserRole("participant");
    setSelectedRecipient("all");
    setMembers([]);
    setMessages([]);
    setDraft("");
  };

  const sendMessage = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || socketRef.current?.readyState !== WebSocket.OPEN) return;
    sendSocketMessage({
      type: "chat",
      text,
      sender_name: session.username,
      room_id: session.roomId,
      delivery_mode: selectedRecipient === "all" ? "broadcast" : "direct",
      target_session_id: selectedRecipient === "all" ? null : selectedRecipient,
    });
    setDraft("");
  };

  // ── No session → join form ──
  if (!session) {
    return (
      <JoinForm
        defaultUsername={user.username}
        defaultLang={user.preferred_language}
        defaultRole={user.role}
        onJoin={joinRoom}
      />
    );
  }

  // ── In room ──
  return (
    <div className="flex h-screen bg-brand-dark overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-brand-dark border-r border-white/10">
        {/* Logo / brand */}
        <div className="px-5 py-4 border-b border-white/10">
          <span className="text-brand-bg font-bold text-lg tracking-tight">Translation_bot</span>
          <p className="text-brand-bg/40 text-xs mt-0.5 truncate">
            {session.roomId}
          </p>
        </div>

        {/* Members */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-bg/30 px-2 mb-2">
            Participants · {members.length}
          </p>
          <div className="space-y-0.5">
            {members.map((m) => (
              <MemberCard
                key={m.session_id}
                member={m}
                isSelf={m.session_id === sessionId}
                callState={callState}
                onCall={startCall}
              />
            ))}
          </div>

          {/* Call panel */}
          <CallPanel
            callState={callState}
            incomingCall={incomingCall}
            activePeer={activePeer}
            callError={callError}
            isMuted={isMuted}
            onAccept={acceptCall}
            onReject={rejectCall}
            onEnd={endCall}
            onToggleMute={toggleMute}
            remoteAudioRef={remoteAudioRef}
          />

          {userRole === "admin" && (
            <AdminPanel
              users={adminUsers}
              stats={adminStats}
              loading={adminLoading}
              error={adminError}
              onRefresh={loadAdminData}
            />
          )}
        </div>

        {/* User footer */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
            {avatarInitials(user.username)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-brand-bg text-sm font-medium truncate">{user.username}</p>
            <p className="text-brand-bg/40 text-xs capitalize">{userRole}</p>
          </div>
          <button
            type="button"
            onClick={() => { leaveRoom(); logout(); }}
            title="Sign out"
            className="text-brand-bg/30 hover:text-brand-bg/70 transition text-sm"
          >
            ↩
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-brand-mid/40 backdrop-blur-sm flex-shrink-0">
          <div>
            <h1 className="text-brand-bg font-semibold text-base"># {session.roomId}</h1>
            <p className="text-brand-bg/40 text-xs">
              {session.userLang} · {members.length} online
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-brand-bg/50">
              <input
                type="checkbox"
                checked={showTranslationDebug}
                onChange={(e) => setShowTranslationDebug(e.target.checked)}
                className="accent-brand-accent"
              />
              Translation debug
            </label>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
              }`}
            >
              {isConnected ? "Connected" : "Disconnected"}
            </span>
            <button
              type="button"
              onClick={leaveRoom}
              className="text-xs border border-white/10 text-brand-bg/60 px-3 py-1.5 rounded-lg hover:border-white/20 hover:text-brand-bg/80 transition"
            >
              Leave room
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-brand-bg/40 text-sm">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isMine={msg.sender === session.username}
                showTranslationDebug={showTranslationDebug}
              />
            ))
          )}
          <div ref={listEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={sendMessage}
          className="px-6 py-4 border-t border-white/10 bg-brand-mid/20 flex gap-3 flex-shrink-0"
        >
          {directTargets.length > 0 && (
            <select
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              className="bg-brand-dark border border-white/10 text-brand-bg/80 text-sm rounded-xl px-3 py-3 outline-none focus:border-brand-accent transition w-44 flex-shrink-0"
            >
              <option value="all">Everyone</option>
              {directTargets.map((m) => (
                <option key={m.session_id} value={m.session_id}>
                  {m.username}
                </option>
              ))}
            </select>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message #${session.roomId}…`}
            className="flex-1 bg-brand-dark border border-white/10 text-brand-bg text-sm rounded-xl px-4 py-3 outline-none placeholder:text-brand-bg/30 focus:border-brand-accent transition"
          />
          <button
            type="submit"
            disabled={!isConnected || !draft.trim()}
            className="bg-brand-accent text-brand-bg px-5 py-3 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
