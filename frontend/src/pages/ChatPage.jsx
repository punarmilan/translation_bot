import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAdminUsers, getAllRoomStats, parseApiError } from "../services/api";

const WS_BASE_URL = "ws://192.168.1.53:8000/ws";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Japanese", value: "ja" },
];

const SIGNALING_TYPES = new Set([
  "webrtc_offer",
  "webrtc_answer",
  "webrtc_ice_candidate",
  "call_started",
  "call_ended",
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
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function JoinForm({ user, onJoin }) {
  const [form, setForm] = useState({
    roomId: "",
    userLang: user.preferred_language || "en",
  });

  const canJoin = form.roomId.trim();

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canJoin) return;
          onJoin({
            username: user.username,
            roomId: form.roomId.trim(),
            userLang: form.userLang,
            role: user.role,
          });
        }}
        className="w-full max-w-md bg-brand-mid rounded-2xl p-8 border border-white/10 shadow-2xl"
      >
        <h1 className="text-xl font-semibold text-brand-bg mb-1">Join a Room</h1>
        <p className="text-brand-bg/50 text-sm mb-7">
          You are signed in as {user.username}. Pick a room and language.
        </p>

        <label className="block mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-bg/50 block mb-1.5">
            Room ID
          </span>
          <input
            value={form.roomId}
            onChange={(event) =>
              setForm((current) => ({ ...current, roomId: event.target.value }))
            }
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
              onChange={(event) =>
                setForm((current) => ({ ...current, userLang: event.target.value }))
              }
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg text-sm outline-none focus:border-brand-accent transition"
            >
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-bg/50 block mb-1.5">
              Role
            </span>
            <input
              value={user.role}
              disabled
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-brand-bg/70 text-sm outline-none cursor-not-allowed capitalize"
            />
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

function MemberCard({ member, isSelf, connected }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition">
      <div className="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
        {avatarInitials(member.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-bg truncate">
          {member.username}
          {isSelf && <span className="text-brand-bg/40 text-xs ml-1">(you)</span>}
        </p>
        <p className="text-xs text-brand-bg/40 capitalize">
          {member.role} - {member.preferred_language}
        </p>
      </div>
      {connected && (
        <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-1">
          audio
        </span>
      )}
    </div>
  );
}

function CallPanel({
  userRole,
  callActive,
  inCall,
  isMuted,
  callStatus,
  callError,
  connectedPeers,
  canStartCall,
  onStart,
  onJoin,
  onLeave,
  onToggleMute,
}) {
  return (
    <div className="mt-4 rounded-xl bg-brand-dark/60 border border-white/10 p-4">
      <p className="text-xs uppercase tracking-widest font-semibold text-brand-bg/40 mb-2">
        Audio Room
      </p>
      <p className="text-sm font-medium text-brand-bg">{callStatus}</p>
      <p className="mt-1 text-xs text-brand-bg/40">
        Connected peers: {connectedPeers.length}
      </p>
      {callError && <p className="mt-2 text-xs text-red-300">{callError}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {!callActive && canStartCall && (
          <button
            type="button"
            onClick={onStart}
            className="bg-emerald-500/20 text-emerald-300 text-xs font-semibold py-2 rounded-lg hover:bg-emerald-500/30 transition"
          >
            Start Audio Call
          </button>
        )}

        {callActive && !inCall && userRole !== "host" && (
          <button
            type="button"
            onClick={onJoin}
            className="bg-brand-accent text-brand-bg text-xs font-semibold py-2 rounded-lg hover:opacity-90 transition"
          >
            Join Call
          </button>
        )}

        {callActive && !inCall && userRole === "host" && (
          <button
            type="button"
            onClick={onJoin}
            className="bg-brand-accent text-brand-bg text-xs font-semibold py-2 rounded-lg hover:opacity-90 transition"
          >
            Rejoin Call
          </button>
        )}

        {inCall && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="flex-1 border border-white/10 text-brand-bg/70 text-xs font-semibold py-2 rounded-lg hover:border-white/20 transition"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="flex-1 bg-red-500/20 text-red-300 text-xs font-semibold py-2 rounded-lg hover:bg-red-500/30 transition"
            >
              Leave Call
            </button>
          </div>
        )}
      </div>
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
        <button type="button" onClick={onRefresh} className="text-xs text-brand-accent">
          Refresh
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-brand-bg/40">Loading admin data...</p>
      ) : error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-brand-bg">{users.length} registered users</p>
          <p className="text-sm text-brand-bg">{stats.length} active rooms</p>
        </div>
      )}
    </div>
  );
}

function TranscriptPanel({
  transcripts,
  enabled,
  error,
  onStart,
  onStop,
}) {
  return (
    <div className="mt-4 rounded-xl bg-brand-dark/60 border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-bg/40">
          Live Translation
        </p>
        <button
          type="button"
          onClick={enabled ? onStop : onStart}
          className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
            enabled
              ? "bg-red-500/20 text-red-300"
              : "bg-brand-accent text-brand-bg"
          }`}
        >
          {enabled ? "Stop" : "Start"}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {transcripts.length === 0 ? (
          <p className="text-xs text-brand-bg/40">
            Start live translation and speak into your microphone.
          </p>
        ) : (
          transcripts.map((item) => (
            <div key={item.id} className="rounded-lg bg-brand-mid/50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-brand-accent">
                  {item.sender}
                </p>
                <p className="text-[10px] text-brand-bg/40">
                  {item.total_latency_ms}ms
                </p>
              </div>
              <p className="text-[11px] uppercase tracking-wide text-brand-bg/40">
                Original ({item.detected_language})
              </p>
              <p className="text-sm text-brand-bg">{item.original}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-brand-bg/40">
                Translated ({item.target_language})
              </p>
              <p className="text-sm text-brand-bg">{item.translated}</p>
              <p className="mt-2 text-[10px] text-brand-bg/40">
                STT {item.stt_latency_ms}ms - Translation {item.translation_latency_ms}ms
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, isMine, showTranslationDebug }) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="bg-brand-mid/40 text-brand-bg/50 text-xs px-3 py-1 rounded-full">
          {message.text} - {formatTime(message.timestamp)}
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
              Private{message.target_name ? ` to ${message.target_name}` : ""}
            </span>
          )}
          <span className="text-[10px] text-brand-bg/40 ml-auto">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{message.translated}</p>
        {message.original !== message.translated && (
          <p className="mt-1.5 pt-1.5 border-t border-white/10 text-[11px] text-brand-bg/40 leading-relaxed">
            {message.original}
          </p>
        )}
        {showTranslationDebug && (
          <div className="mt-2 pt-2 border-t border-white/10 text-[10px] leading-relaxed text-brand-bg/45">
            {message.detected_language || "unknown"} to {message.target_language || "unknown"} -{" "}
            {message.translation_status || "unknown"} - {message.cache_hit ? "cache hit" : "cache miss"}
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [callActive, setCallActive] = useState(false);
  const [callHostId, setCallHostId] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callError, setCallError] = useState("");
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [transcripts, setTranscripts] = useState([]);
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState({});
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
  const peerConnectionsRef = useRef(new Map());
  const remoteAudioRefs = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const mediaRecorderRef = useRef(null);
  const voiceSequenceRef = useRef(0);
  const sessionIdRef = useRef(null);
  const membersRef = useRef([]);
  const callHostIdRef = useRef(null);
  const inCallRef = useRef(false);
  const isMutedRef = useRef(false);

  const directTargets = useMemo(() => {
    return members.filter((member) => {
      if (member.session_id === sessionId) return false;
      if (userRole === "admin") return true;
      return userRole === "host" ? member.role === "participant" : member.role === "host";
    });
  }, [members, sessionId, userRole]);

  const connectedPeers = useMemo(() => {
    return connectedPeerIds
      .map((peerId) => members.find((member) => member.session_id === peerId))
      .filter(Boolean);
  }, [connectedPeerIds, members]);

  const callStatus = useMemo(() => {
    if (!callActive) return "No active audio call";
    if (!inCall) return "Room call is active";
    if (connectedPeers.length === 0) return "In call - waiting for peers";
    return `In call with ${connectedPeers.map((peer) => peer.username).join(", ")}`;
  }, [callActive, inCall, connectedPeers]);

  const sendSocketMessage = (payload) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(payload));
    return true;
  };

  const sendSignal = (type, targetSessionId = null, payload = null) => {
    return sendSocketMessage({
      type,
      room_id: session?.roomId,
      target_session_id: targetSessionId,
      payload,
    });
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const memberFor = (sessionIdValue) => {
    return (
      membersRef.current.find((member) => member.session_id === sessionIdValue) || {
        session_id: sessionIdValue,
        username: "Peer",
        preferred_language: "",
        role: "participant",
      }
    );
  };

  const updateConnectedPeer = (peerId, connected) => {
    setConnectedPeerIds((current) => {
      const existing = new Set(current);
      if (connected) existing.add(peerId);
      else existing.delete(peerId);
      return [...existing];
    });
  };

  const ensureLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMutedRef.current;
    });
    return stream;
  };

  const stopVoiceTranscription = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setTranscriptionEnabled(false);
  };

  const startVoiceTranscription = async () => {
    try {
      setTranscriptionError("");
      const stream = await ensureLocalAudio();
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      voiceSequenceRef.current = 0;

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return;
        if (socketRef.current?.readyState !== WebSocket.OPEN) return;
        const audioBase64 = await blobToBase64(event.data);
        sendSocketMessage({
          type: "voice_chunk",
          room_id: session?.roomId,
          audio_base64: audioBase64,
          mime_type: event.data.type || mimeType,
          sequence: voiceSequenceRef.current,
          captured_at: new Date().toISOString(),
        });
        voiceSequenceRef.current += 1;
      };

      recorder.onerror = () => {
        setTranscriptionError("Could not record microphone audio.");
        stopVoiceTranscription();
      };

      recorder.start(3000);
      setTranscriptionEnabled(true);
    } catch (error) {
      console.error("Could not start voice transcription", error);
      setTranscriptionError("Microphone permission is required for live transcripts.");
    }
  };

  const removePeerConnection = (peerId) => {
    const connection = peerConnectionsRef.current.get(peerId);
    connection?.close();
    peerConnectionsRef.current.delete(peerId);
    pendingIceCandidatesRef.current.delete(peerId);
    updateConnectedPeer(peerId, false);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  };

  const cleanupCall = (notify = false) => {
    if (notify && inCallRef.current) {
      sendSignal("call_ended", null, {
        reason: userRole === "host" || userRole === "admin" ? "room_call_ended" : "peer_left",
      });
    }
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    stopVoiceTranscription();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    inCallRef.current = false;
    isMutedRef.current = false;
    setInCall(false);
    setIsMuted(false);
    setConnectedPeerIds([]);
    setRemoteStreams({});
  };

  const createPeerConnection = async (peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const localStream = await ensureLocalAudio();
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(peerId, connection);

    localStream.getTracks().forEach((track) => {
      connection.addTrack(track, localStream);
    });

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      console.info("ICE candidate exchange", { target: peerId });
      sendSignal("webrtc_ice_candidate", peerId, {
        candidate: event.candidate.toJSON(),
      });
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
      updateConnectedPeer(peerId, true);
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "connected") {
        console.info("Peer connected", { peerId });
        updateConnectedPeer(peerId, true);
      }
      if (state === "failed" || state === "disconnected" || state === "closed") {
        console.info("Peer disconnected", { peerId, state });
        removePeerConnection(peerId);
      }
    };

    return connection;
  };

  const flushPendingIce = async (peerId) => {
    const connection = peerConnectionsRef.current.get(peerId);
    if (!connection?.remoteDescription) return;
    const candidates = pendingIceCandidatesRef.current.get(peerId) || [];
    pendingIceCandidatesRef.current.delete(peerId);
    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate);
    }
  };

  const createOfferForPeer = async (peerId) => {
    const connection = await createPeerConnection(peerId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    console.info("Offer created", { target: peerId });
    sendSignal("webrtc_offer", peerId, {
      description: connection.localDescription,
    });
  };

  const startAudioCall = async () => {
    try {
      setCallError("");
      await ensureLocalAudio();
      inCallRef.current = true;
      setInCall(true);
      setCallActive(true);
      setCallHostId(sessionIdRef.current);
      callHostIdRef.current = sessionIdRef.current;
      sendSignal("call_started", null, {
        host_session_id: sessionIdRef.current,
      });
    } catch (error) {
      console.error("Could not start audio call", error);
      setCallError("Microphone permission is required to start a call.");
    }
  };

  const joinAudioCall = async () => {
    try {
      setCallError("");
      await ensureLocalAudio();
      inCallRef.current = true;
      setInCall(true);
      const hostId = callHostIdRef.current;
      if (hostId && hostId !== sessionIdRef.current) {
        await createOfferForPeer(hostId);
      }
    } catch (error) {
      console.error("Could not join audio call", error);
      setCallError("Microphone permission is required to join the call.");
    }
  };

  const leaveAudioCall = () => {
    cleanupCall(true);
    if (userRole === "host" || userRole === "admin") {
      setCallActive(false);
      setCallHostId(null);
      callHostIdRef.current = null;
    }
  };

  const toggleMute = () => {
    const muted = !isMutedRef.current;
    isMutedRef.current = muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setIsMuted(muted);
  };

  const handleOffer = async (payload) => {
    if (!inCallRef.current && !localStreamRef.current) {
      await ensureLocalAudio();
      inCallRef.current = true;
      setInCall(true);
    }
    const peerId = payload.sender_session_id;
    const connection = await createPeerConnection(peerId);
    await connection.setRemoteDescription(payload.payload.description);
    await flushPendingIce(peerId);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    sendSignal("webrtc_answer", peerId, {
      description: connection.localDescription,
    });
  };

  const handleAnswer = async (payload) => {
    const peerId = payload.sender_session_id;
    const connection = peerConnectionsRef.current.get(peerId);
    if (!connection) return;
    await connection.setRemoteDescription(payload.payload.description);
    await flushPendingIce(peerId);
    console.info("Answer received", { peerId });
  };

  const handleIceCandidate = async (payload) => {
    const peerId = payload.sender_session_id;
    const candidatePayload = payload.payload?.candidate;
    if (!candidatePayload) return;
    const candidate = new RTCIceCandidate(candidatePayload);
    const connection = peerConnectionsRef.current.get(peerId);
    if (!connection?.remoteDescription) {
      const pending = pendingIceCandidatesRef.current.get(peerId) || [];
      pending.push(candidate);
      pendingIceCandidatesRef.current.set(peerId, pending);
      return;
    }
    await connection.addIceCandidate(candidate);
  };

  const handleSignalingMessage = async (payload) => {
    if (payload.room_id !== session?.roomId) return;
    if (payload.target_session_id && payload.target_session_id !== sessionIdRef.current) {
      return;
    }

    try {
      if (payload.type === "call_started") {
        const hostId = payload.payload?.host_session_id || payload.sender_session_id;
        setCallActive(true);
        setCallHostId(hostId);
        callHostIdRef.current = hostId;
        if (payload.sender_session_id === sessionIdRef.current) {
          return;
        }
        return;
      }

      if (payload.type === "call_ended") {
        if (payload.payload?.reason === "peer_left") {
          removePeerConnection(payload.sender_session_id);
          return;
        }
        setCallActive(false);
        setCallHostId(null);
        callHostIdRef.current = null;
        cleanupCall(false);
        return;
      }

      if (payload.type === "webrtc_offer") {
        await handleOffer(payload);
        return;
      }

      if (payload.type === "webrtc_answer") {
        await handleAnswer(payload);
        return;
      }

      if (payload.type === "webrtc_ice_candidate") {
        await handleIceCandidate(payload);
      }
    } catch (error) {
      console.error("WebRTC signaling failure", error);
      setCallError("Audio call signaling failed.");
    }
  };

  const loadAdminData = async () => {
    if (user?.role !== "admin") return;
    setAdminLoading(true);
    setAdminError("");
    try {
      const [users, stats] = await Promise.all([getAdminUsers(), getAllRoomStats()]);
      setAdminUsers(users);
      setAdminStats(stats);
    } catch (error) {
      setAdminError(parseApiError(error) || "Could not load admin data.");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return undefined;
    const token = localStorage.getItem("access_token");
    const roomId = encodeURIComponent(session.roomId);
    const userLang = encodeURIComponent(session.userLang);
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const socket = new WebSocket(`${WS_BASE_URL}/${roomId}/${userLang}${tokenParam}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(
        JSON.stringify({
          type: "join",
          username: session.username,
          room_id: session.roomId,
          role: session.role,
        })
      );
    };

    socket.onclose = () => {
      setIsConnected(false);
      cleanupCall(false);
    };

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
      if (SIGNALING_TYPES.has(payload.type)) {
        await handleSignalingMessage(payload);
        return;
      }
      if (payload.type === "voice_transcript") {
        setTranscripts((current) => [{ ...payload, id: crypto.randomUUID() }, ...current].slice(0, 50));
        return;
      }
      setMessages((current) => [...current, { ...payload, id: crypto.randomUUID() }]);
    };

    return () => {
      cleanupCall(true);
      socket.close();
      socketRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("translation_debug", showTranslationDebug ? "true" : "false");
  }, [showTranslationDebug]);

  useEffect(() => {
    loadAdminData();
  }, [user?.role]);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      const audio = remoteAudioRefs.current.get(peerId);
      if (audio && audio.srcObject !== stream) {
        audio.srcObject = stream;
      }
    });
  }, [remoteStreams]);

  useEffect(() => {
    if (
      selectedRecipient !== "all" &&
      !directTargets.some((member) => member.session_id === selectedRecipient)
    ) {
      setSelectedRecipient("all");
    }
  }, [directTargets, selectedRecipient]);

  const joinRoom = (data) => {
    sessionIdRef.current = null;
    membersRef.current = [];
    callHostIdRef.current = null;
    setMessages([]);
    setMembers([]);
    setSelectedRecipient("all");
    setCallActive(false);
    setCallHostId(null);
    cleanupCall(false);
    setSession(data);
  };

  const leaveRoom = () => {
    cleanupCall(true);
    socketRef.current?.close();
    setSession(null);
    sessionIdRef.current = null;
    membersRef.current = [];
    callHostIdRef.current = null;
    setSessionId(null);
    setUserRole("participant");
    setSelectedRecipient("all");
    setMembers([]);
    setMessages([]);
    setDraft("");
    setCallActive(false);
    setCallHostId(null);
    setTranscripts([]);
    setTranscriptionError("");
  };

  const sendMessage = (event) => {
    event.preventDefault();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <span className="text-brand-bg/40 text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!session) {
    return <JoinForm user={user} onJoin={joinRoom} />;
  }

  return (
    <div className="flex h-screen bg-brand-dark overflow-hidden">
      <aside className="w-72 flex-shrink-0 flex flex-col bg-brand-dark border-r border-white/10">
        <div className="px-5 py-4 border-b border-white/10">
          <span className="text-brand-bg font-bold text-lg tracking-tight">Translation_bot</span>
          <p className="text-brand-bg/40 text-xs mt-0.5 truncate">{session.roomId}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-bg/30 px-2 mb-2">
            Participants - {members.length}
          </p>
          <div className="space-y-0.5">
            {members.map((member) => (
              <MemberCard
                key={member.session_id}
                member={member}
                isSelf={member.session_id === sessionId}
                connected={connectedPeerIds.includes(member.session_id)}
              />
            ))}
          </div>

          <CallPanel
            userRole={userRole}
            callActive={callActive}
            inCall={inCall}
            isMuted={isMuted}
            callStatus={callStatus}
            callError={callError}
            connectedPeers={connectedPeers}
            canStartCall={userRole === "host" || userRole === "admin"}
            onStart={startAudioCall}
            onJoin={joinAudioCall}
            onLeave={leaveAudioCall}
            onToggleMute={toggleMute}
          />

          <TranscriptPanel
            transcripts={transcripts}
            enabled={transcriptionEnabled}
            error={transcriptionError}
            onStart={startVoiceTranscription}
            onStop={stopVoiceTranscription}
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

          <div className="hidden">
            {Object.entries(remoteStreams).map(([peerId]) => (
              <audio
                key={peerId}
                autoPlay
                ref={(element) => {
                  if (element) remoteAudioRefs.current.set(peerId, element);
                  else remoteAudioRefs.current.delete(peerId);
                }}
              />
            ))}
          </div>
        </div>

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
            onClick={() => {
              leaveRoom();
              logout();
            }}
            className="text-brand-bg/40 hover:text-brand-bg/80 transition text-xs"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-brand-mid/40 backdrop-blur-sm flex-shrink-0">
          <div>
            <h1 className="text-brand-bg font-semibold text-base"># {session.roomId}</h1>
            <p className="text-brand-bg/40 text-xs">
              {session.userLang} - {members.length} online
              {callHostId ? ` - call host ${memberFor(callHostId).username}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-brand-bg/50">
              <input
                type="checkbox"
                checked={showTranslationDebug}
                onChange={(event) => setShowTranslationDebug(event.target.checked)}
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="text-brand-bg/40 text-sm">No messages yet. Say hello.</p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isMine={message.sender === session.username}
                showTranslationDebug={showTranslationDebug}
              />
            ))
          )}
          <div ref={listEndRef} />
        </div>

        <form
          onSubmit={sendMessage}
          className="px-6 py-4 border-t border-white/10 bg-brand-mid/20 flex gap-3 flex-shrink-0"
        >
          {directTargets.length > 0 && (
            <select
              value={selectedRecipient}
              onChange={(event) => setSelectedRecipient(event.target.value)}
              className="bg-brand-dark border border-white/10 text-brand-bg/80 text-sm rounded-xl px-3 py-3 outline-none focus:border-brand-accent transition w-44 flex-shrink-0"
            >
              <option value="all">Everyone</option>
              {directTargets.map((member) => (
                <option key={member.session_id} value={member.session_id}>
                  {member.username}
                </option>
              ))}
            </select>
          )}
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message #${session.roomId}...`}
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
