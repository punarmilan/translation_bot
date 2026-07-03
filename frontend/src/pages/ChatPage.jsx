import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import DiagnosticsPanel from "../components/DiagnosticsPanel";
import TranslationPanel from "../components/TranslationPanel";
import VideoCall from "../components/VideoCall";
import { useAuth } from "../contexts/AuthContext";
import {
  getAdminUsers,
  getAllRoomStats,
  parseApiError,
  synthesizeTts,
  warmupStt,
} from "../services/api";

const API_HOST = window.location.hostname || "localhost";
const WS_PROTOCOL = window.location.protocol === "https:" ? "wss" : "ws";
const WS_BASE_URL = `${WS_PROTOCOL}://${API_HOST}:8000/ws`;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const VOICE_ACTIVITY_SAMPLE_MS = 100;
const VOICE_SILENCE_MS = 1100;
const VOICE_MIN_UTTERANCE_MS = 500;
const VOICE_MAX_UTTERANCE_MS = 15000;
const VOICE_IDLE_RESET_MS = 5000;
const VOICE_RMS_THRESHOLD = 0.018;

const LANGUAGE_OPTIONS = [
  { label: "Arabic", value: "ar" },
  { label: "Dutch", value: "nl" },
  { label: "English", value: "en" },
  { label: "German", value: "de" },
  { label: "Hindi", value: "hi" },
  { label: "Italian", value: "it" },
  { label: "Portuguese", value: "pt" },
  { label: "Russian", value: "ru" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
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

function createClientId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createMeetingCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = (length) =>
    Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${group(3)}-${group(4)}-${group(3)}`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function JoinForm({ user, onJoin, initialRoomId = "" }) {
  const [form, setForm] = useState({
    roomId: initialRoomId,
    userLang: user.preferred_language || "en",
  });
  const [shareStatus, setShareStatus] = useState("");

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
        className="w-full max-w-md rounded-panel border border-white/[0.06] bg-brand-mid p-8 shadow-panel"
      >
        <h1 className="mb-1 text-[28px] font-semibold text-brand-bg">Join a room</h1>
        <p className="mb-7 text-sm text-ui-muted">
          You are signed in as {user.name || user.username}. Pick a room and language.
        </p>

        <label className="block mb-4">
          <span className="mb-1.5 block text-xs font-medium text-ui-muted">
            Room ID
          </span>
          <input
            value={form.roomId}
            onChange={(event) =>
              setForm((current) => ({ ...current, roomId: event.target.value }))
            }
            className="ui-input text-sm"
            placeholder="team-room-1"
          />
        </label>

        {(user.role === "host" || user.role === "admin") && (
          <button
            type="button"
            onClick={async () => {
              const roomId = createMeetingCode();
              const publicOrigin =
                import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
              const meetingUrl = `${publicOrigin.replace(
                /\/$/,
                ""
              )}/chat?room=${encodeURIComponent(roomId)}`;
              setForm((current) => ({ ...current, roomId }));
              try {
                await copyText(meetingUrl);
                setShareStatus("Meeting link copied. Join when ready.");
              } catch {
                setShareStatus("Meeting code generated.");
              }
            }}
            className="mb-4 w-full rounded-control bg-ui-elevated px-4 py-2.5 text-sm font-semibold text-brand-accent hover:bg-white/[0.08]"
          >
            Generate meeting link
          </button>
        )}
        {shareStatus && (
          <p className="mb-4 text-xs text-ui-success" role="status">
            {shareStatus}
          </p>
        )}

        <div className="mb-7 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ui-muted">
              Language
            </span>
            <select
              value={form.userLang}
              onChange={(event) =>
                setForm((current) => ({ ...current, userLang: event.target.value }))
              }
              className="ui-input text-sm"
            >
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ui-muted">
              Role
            </span>
            <input
              value={user.role}
              disabled
              className="ui-input cursor-not-allowed text-sm capitalize opacity-60"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!canJoin}
          className="w-full rounded-control bg-brand-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Join Room
        </button>
      </form>
    </div>
  );
}

function MemberCard({ member, isSelf, connected, translationStatus }) {
  return (
    <div className="flex items-center gap-3 rounded-control px-2.5 py-2.5 hover:bg-white/[0.04]">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ui-elevated text-xs font-semibold text-ui-muted">
        {avatarInitials(member.username)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-bg truncate">
          {member.name || member.username}
          {isSelf && <span className="text-brand-bg/40 text-xs ml-1">(you)</span>}
        </p>
        <p className="text-xs capitalize text-ui-subtle">
          {member.role} - {member.preferred_language}
        </p>
        {translationStatus && (
          <p className="mt-1 text-[11px] font-medium text-brand-accent" aria-live="polite">
            {translationStatus}
          </p>
        )}
      </div>
      {connected && (
        <span className="rounded-full bg-ui-success/10 px-2 py-1 text-[10px] text-ui-success">
          Live
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
    <div className="mt-4 rounded-panel bg-brand-mid p-4">
      <p className="mb-2 text-xs font-medium text-ui-muted">
        Meeting details
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
            className="rounded-control bg-brand-accent py-2 text-xs font-semibold text-white hover:brightness-110"
          >
            Start Audio Call
          </button>
        )}

        {callActive && !inCall && userRole !== "host" && (
          <button
            type="button"
            onClick={onJoin}
            className="rounded-control bg-brand-accent py-2 text-xs font-semibold text-white hover:brightness-110"
          >
            Join Call
          </button>
        )}

        {callActive && !inCall && userRole === "host" && (
          <button
            type="button"
            onClick={onJoin}
            className="rounded-control bg-brand-accent py-2 text-xs font-semibold text-white hover:brightness-110"
          >
            Rejoin Call
          </button>
        )}

        {inCall && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="flex-1 rounded-control bg-ui-elevated py-2 text-xs font-semibold text-ui-muted hover:text-brand-bg"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="flex-1 rounded-control bg-ui-error/10 py-2 text-xs font-semibold text-ui-error hover:bg-ui-error/20"
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
    <div className="rounded-panel bg-brand-mid p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-brand-bg">
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
          <p className="text-sm text-brand-bg">
            {(users.users || users).length || users.user_count || 0} registered users
          </p>
          {users.language_distribution && (
            <p className="text-xs text-brand-bg/40">
              Languages: {Object.entries(users.language_distribution).map(([key, value]) => `${key} ${value}`).join(", ")}
            </p>
          )}
          {users.voice_preference_distribution && (
            <p className="text-xs text-brand-bg/40">
              Voices: {Object.entries(users.voice_preference_distribution).map(([key, value]) => `${key} ${value}`).join(", ")}
            </p>
          )}
          <p className="text-sm text-brand-bg">{stats.length} active rooms</p>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, isMine, showTranslationDebug }) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-ui-subtle">
          {message.text} - {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-panel px-4 py-3 ${
          isMine
            ? "bg-brand-accent text-white"
            : "bg-brand-mid text-brand-bg"
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-semibold ${isMine ? "text-white/80" : "text-ui-muted"}`}>
            {message.sender}
          </span>
          {message.delivery_mode === "direct" && (
            <span className="bg-white/10 text-brand-bg/60 text-[10px] px-1.5 py-0.5 rounded-md">
              Private{message.target_name ? ` to ${message.target_name}` : ""}
            </span>
          )}
          <span className={`ml-auto text-[10px] ${isMine ? "text-white/55" : "text-ui-subtle"}`}>
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{message.translated}</p>
        {message.original !== message.translated && (
          <p className={`mt-2 border-t pt-2 text-xs leading-relaxed ${
            isMine ? "border-white/15 text-white/60" : "border-white/[0.06] text-ui-muted"
          }`}>
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
  const [searchParams] = useSearchParams();

  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [activeLanguage, setActiveLanguage] = useState(user?.preferred_language || "en");
  const [userRole, setUserRole] = useState("participant");
  const [selectedRecipient, setSelectedRecipient] = useState("all");
  const [meetingPanel, setMeetingPanel] = useState("chat");
  const [callActive, setCallActive] = useState(false);
  const [callHostId, setCallHostId] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callError, setCallError] = useState("");
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [transcriptionStatus, setTranscriptionStatus] = useState("");
  const [ttsStatus, setTtsStatus] = useState("");
  const [playingTranscriptId, setPlayingTranscriptId] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  const [translatedAudioItems, setTranslatedAudioItems] = useState([]);
  const [participantTranslationStatus, setParticipantTranslationStatus] = useState({});
  const [listenerMode, setListenerMode] = useState("original_translated_audio");
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [localMediaStream, setLocalMediaStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [diagnostics, setDiagnostics] = useState({
    websocketStatus: "idle",
    reconnectAttempts: 0,
    lastEvent: "",
  });
  const [peerDiagnostics, setPeerDiagnostics] = useState({});
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminStats, setAdminStats] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [showTranslationDebug, setShowTranslationDebug] = useState(() => {
    return localStorage.getItem("translation_debug") === "true";
  });
  const [shareStatus, setShareStatus] = useState("");

  const socketRef = useRef(null);
  const listEndRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteAudioRefs = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const mediaRecorderRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const transcriptionActiveRef = useRef(false);
  const transcriptionAudioContextRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const pendingCallRecoveryRef = useRef(null);
  const voiceSequenceRef = useRef(0);
  const sessionIdRef = useRef(null);
  const membersRef = useRef([]);
  const activeLanguageRef = useRef(user?.preferred_language || "en");
  const listenerModeRef = useRef("original_translated_audio");
  const callHostIdRef = useRef(null);
  const inCallRef = useRef(false);
  const isMutedRef = useRef(false);
  const isCameraOffRef = useRef(false);
  const isVideoCallRef = useRef(false);

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
  const originalAudioMuted = listenerMode === "translated_audio_only";

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

  const noteDiagnostic = (lastEvent, fields = {}) => {
    setDiagnostics((current) => ({ ...current, ...fields, lastEvent }));
  };

  const updatePeerDiagnostic = (peerId, patch) => {
    const member = memberFor(peerId);
    setPeerDiagnostics((current) => ({
      ...current,
      [peerId]: {
        name: member.name || member.username,
        ...(current[peerId] || {}),
        ...patch,
      },
    }));
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

  const ensureLocalMedia = async ({ video = false } = {}) => {
    const current = localStreamRef.current;
    const hasVideo = current?.getVideoTracks().some((track) => track.readyState === "live");
    if (current && (!video || hasVideo)) return current;
    current?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video,
    });
    localStreamRef.current = stream;
    setLocalMediaStream(stream);
    noteDiagnostic(video ? "local video stream ready" : "local audio stream ready");
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMutedRef.current;
      track.onended = () => noteDiagnostic("local audio track ended");
      track.onmute = () => noteDiagnostic("local audio track muted");
      track.onunmute = () => noteDiagnostic("local audio track unmuted");
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOffRef.current;
      track.onended = () => noteDiagnostic("local video track ended");
      track.onmute = () => noteDiagnostic("local video track muted");
      track.onunmute = () => noteDiagnostic("local video track unmuted");
    });
    return stream;
  };

  const ensureLocalAudio = () => ensureLocalMedia({ video: false });
  const ensureLocalVideo = () => ensureLocalMedia({ video: true });

  const stopVoiceTranscription = () => {
    transcriptionActiveRef.current = false;
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }
    if (transcriptionAudioContextRef.current) {
      transcriptionAudioContextRef.current.close().catch(() => {});
      transcriptionAudioContextRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (recorder.__activitySent) {
        sendSocketMessage({
          type: "voice_activity",
          room_id: session?.roomId,
          active: false,
          sequence: voiceSequenceRef.current,
        });
      }
      recorder.__sendSegment = Boolean(recorder.__speechDetected);
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setTranscriptionEnabled(false);
    setTranscriptionStatus("");
  };

  const startVoiceTranscription = async (existingStream = null) => {
    if (transcriptionActiveRef.current) return;
    try {
      transcriptionActiveRef.current = true;
      setTranscriptionError("");
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setTranscriptionError(
          "Microphone access needs HTTPS on another device. Use localhost, HTTPS, or allow this LAN origin in your browser."
        );
        transcriptionActiveRef.current = false;
        return;
      }

      setTranscriptionStatus("Preparing Whisper speech-to-text...");
      await warmupStt();
      setTranscriptionStatus("Listening... speak in full sentences.");
      const stream = existingStream || (await ensureLocalAudio());
      const audioTracks = stream.getAudioTracks().filter(
        (track) => track.readyState === "live"
      );
      if (audioTracks.length === 0) {
        throw new Error("No active microphone track is available for live translation.");
      }
      const transcriptionStream = new MediaStream(audioTracks);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      voiceSequenceRef.current = 0;

      const sendAudioBlob = async (blob) => {
        if (!blob || blob.size === 0) return;
        if (socketRef.current?.readyState !== WebSocket.OPEN) return;
        const audioBase64 = await blobToBase64(blob);
        sendSocketMessage({
          type: "voice_chunk",
          room_id: session?.roomId,
          audio_base64: audioBase64,
          mime_type: blob.type || mimeType,
          sequence: voiceSequenceRef.current,
          captured_at: new Date().toISOString(),
        });
        voiceSequenceRef.current += 1;
        setTranscriptionStatus("Transcribing...");
      };

      const startSegmentRecorder = () => {
        if (!transcriptionActiveRef.current) return;
        const chunks = [];
        const recorder = new MediaRecorder(transcriptionStream, { mimeType });
        recorder.__startedAt = performance.now();
        recorder.__lastSpeechAt = 0;
        recorder.__speechDetected = false;
        recorder.__sendSegment = false;
        recorder.__activitySent = false;
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data?.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          if (recorder.__sendSegment && chunks.length > 0) {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
            void sendAudioBlob(blob);
          }
          if (transcriptionActiveRef.current) {
            startSegmentRecorder();
            setTranscriptionStatus("Listening...");
          }
        };
        recorder.onerror = () => {
          setTranscriptionError("Could not record microphone audio.");
          stopVoiceTranscription();
        };
        recorder.start();
      };

      startSegmentRecorder();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      transcriptionAudioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      audioContext.createMediaStreamSource(transcriptionStream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);

      transcriptionIntervalRef.current = window.setInterval(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
        );
        const now = performance.now();
        const elapsed = now - recorder.__startedAt;

        if (rms >= VOICE_RMS_THRESHOLD) {
          recorder.__speechDetected = true;
          recorder.__lastSpeechAt = now;
          if (!recorder.__activitySent) {
            recorder.__activitySent = true;
            sendSocketMessage({
              type: "voice_activity",
              room_id: session?.roomId,
              active: true,
              sequence: voiceSequenceRef.current,
            });
          }
          setTranscriptionStatus("Listening...");
          return;
        }

        const silenceDuration = recorder.__lastSpeechAt
          ? now - recorder.__lastSpeechAt
          : 0;
        const utteranceComplete =
          recorder.__speechDetected &&
          elapsed >= VOICE_MIN_UTTERANCE_MS &&
          silenceDuration >= VOICE_SILENCE_MS;
        const maximumReached =
          recorder.__speechDetected && elapsed >= VOICE_MAX_UTTERANCE_MS;
        const idleReset =
          !recorder.__speechDetected && elapsed >= VOICE_IDLE_RESET_MS;

        if (utteranceComplete || maximumReached || idleReset) {
          if (recorder.__activitySent) {
            sendSocketMessage({
              type: "voice_activity",
              room_id: session?.roomId,
              active: false,
              sequence: voiceSequenceRef.current,
            });
          }
          recorder.__sendSegment = utteranceComplete || maximumReached;
          recorder.stop();
        }
      }, VOICE_ACTIVITY_SAMPLE_MS);
      setTranscriptionEnabled(true);
    } catch (error) {
      transcriptionActiveRef.current = false;
      setTranscriptionEnabled(false);
      setTranscriptionStatus("");
      console.error("Could not start voice transcription", error);
      setTranscriptionError(
        parseApiError(error) || "Microphone permission and a ready STT model are required for live transcripts."
      );
    }
  };

  const removePeerConnection = (peerId) => {
    const connection = peerConnectionsRef.current.get(peerId);
    connection?.close();
    peerConnectionsRef.current.delete(peerId);
    pendingIceCandidatesRef.current.delete(peerId);
    updateConnectedPeer(peerId, false);
    updatePeerDiagnostic(peerId, {
      connectionState: "closed",
      iceConnectionState: "closed",
    });
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
    setLocalMediaStream(null);
    inCallRef.current = false;
    isMutedRef.current = false;
    isCameraOffRef.current = false;
    isVideoCallRef.current = false;
    setInCall(false);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsVideoCall(false);
    setConnectedPeerIds([]);
    setRemoteStreams({});
    setPeerDiagnostics({});
    noteDiagnostic("call cleaned up");
  };

  const createPeerConnection = async (peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const localStream = await ensureLocalMedia({ video: isVideoCallRef.current });
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(peerId, connection);
    updatePeerDiagnostic(peerId, {
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
    });
    noteDiagnostic("peer connection created");

    localStream.getTracks().forEach((track) => {
      connection.addTrack(track, localStream);
    });

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      console.info("ICE candidate exchange", { target: peerId });
      setPeerDiagnostics((current) => ({
        ...current,
        [peerId]: {
          ...(current[peerId] || {}),
          name: current[peerId]?.name || memberFor(peerId).username,
          iceCandidatesSent: (current[peerId]?.iceCandidatesSent || 0) + 1,
        },
      }));
      noteDiagnostic("ICE candidate sent");
      sendSignal("webrtc_ice_candidate", peerId, {
        candidate: event.candidate.toJSON(),
      });
    };

    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState;
      console.info("ICE connection state", { peerId, state });
      updatePeerDiagnostic(peerId, { iceConnectionState: state });
      noteDiagnostic(`ICE ${state}`);
    };

    connection.onicegatheringstatechange = () => {
      console.info("ICE gathering state", {
        peerId,
        state: connection.iceGatheringState,
      });
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      stream.getTracks().forEach((track) => {
        track.onended = () => noteDiagnostic(`remote ${track.kind} ended`);
        track.onmute = () => noteDiagnostic(`remote ${track.kind} muted`);
        track.onunmute = () => noteDiagnostic(`remote ${track.kind} unmuted`);
      });
      setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
      updatePeerDiagnostic(peerId, {
        remoteAudioTracks: stream.getAudioTracks().length,
        remoteVideoTracks: stream.getVideoTracks().length,
      });
      noteDiagnostic("remote media stream received");
      updateConnectedPeer(peerId, true);
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "connected") {
        console.info("Peer connected", { peerId });
        updatePeerDiagnostic(peerId, { connectionState: state });
        noteDiagnostic("peer connected");
        updateConnectedPeer(peerId, true);
      }
      if (state === "failed" || state === "disconnected" || state === "closed") {
        console.info("Peer disconnected", { peerId, state });
        updatePeerDiagnostic(peerId, { connectionState: state });
        noteDiagnostic(`peer ${state}`);
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
    updatePeerDiagnostic(peerId, { localDescription: "offer" });
    noteDiagnostic("offer created");
    sendSignal("webrtc_offer", peerId, {
      description: connection.localDescription,
      media_type: isVideoCallRef.current ? "video" : "audio",
    });
  };

  const startAudioCall = async () => {
    try {
      setCallError("");
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setCallError("Microphone access needs HTTPS on another device. Use HTTPS or allow this LAN origin in the browser.");
        return;
      }
      isVideoCallRef.current = false;
      setIsVideoCall(false);
      await ensureLocalAudio();
      inCallRef.current = true;
      setInCall(true);
      setCallActive(true);
      setCallHostId(sessionIdRef.current);
      callHostIdRef.current = sessionIdRef.current;
      sendSignal("call_started", null, {
        host_session_id: sessionIdRef.current,
        media_type: "audio",
      });
      void startVoiceTranscription(localStreamRef.current);
    } catch (error) {
      console.error("Could not start audio call", error);
      setCallError("Microphone permission is required to start a call.");
    }
  };

  const joinAudioCall = async () => {
    try {
      setCallError("");
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setCallError("Microphone access needs HTTPS on another device. Use HTTPS or allow this LAN origin in the browser.");
        return;
      }
      isVideoCallRef.current = false;
      setIsVideoCall(false);
      await ensureLocalAudio();
      inCallRef.current = true;
      setInCall(true);
      const hostId = callHostIdRef.current;
      if (hostId && hostId !== sessionIdRef.current) {
        await createOfferForPeer(hostId);
      }
      void startVoiceTranscription(localStreamRef.current);
    } catch (error) {
      console.error("Could not join audio call", error);
      setCallError("Microphone permission is required to join the call.");
    }
  };

  const startVideoCall = async () => {
    try {
      setCallError("");
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setCallError("Camera and microphone need HTTPS on another device. Use HTTPS or allow this LAN origin in the browser.");
        return;
      }
      isVideoCallRef.current = true;
      setIsVideoCall(true);
      await ensureLocalVideo();
      inCallRef.current = true;
      setInCall(true);
      setCallActive(true);
      setCallHostId(sessionIdRef.current);
      callHostIdRef.current = sessionIdRef.current;
      sendSignal("call_started", null, {
        host_session_id: sessionIdRef.current,
        media_type: "video",
      });
      void startVoiceTranscription(localStreamRef.current);
    } catch (error) {
      console.error("Could not start video call", error);
      setCallError("Camera and microphone permission are required to start video.");
    }
  };

  const joinVideoCall = async () => {
    try {
      setCallError("");
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setCallError("Camera and microphone need HTTPS on another device. Use HTTPS or allow this LAN origin in the browser.");
        return;
      }
      isVideoCallRef.current = true;
      setIsVideoCall(true);
      await ensureLocalVideo();
      inCallRef.current = true;
      setInCall(true);
      const hostId = callHostIdRef.current;
      if (hostId && hostId !== sessionIdRef.current) {
        await createOfferForPeer(hostId);
      }
      void startVoiceTranscription(localStreamRef.current);
    } catch (error) {
      console.error("Could not join video call", error);
      setCallError("Camera and microphone permission are required to join video.");
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

  const toggleCamera = () => {
    const cameraOff = !isCameraOffRef.current;
    isCameraOffRef.current = cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
    setIsCameraOff(cameraOff);
  };

  const playTranslatedAudio = async (transcript) => {
    try {
      setPlayingTranscriptId(transcript.id);
      setTtsStatus("Generating translated audio...");
      const result = await synthesizeTts(
        transcript.translated,
        transcript.target_language,
        user?.voice_preference || "auto"
      );
      const audio = new Audio(`data:${result.mime_type};base64,${result.audio_base64}`);
      audio.onended = () => {
        setPlayingTranscriptId(null);
        setTtsStatus("");
      };
      audio.onerror = () => {
        setPlayingTranscriptId(null);
        setTtsStatus("Could not play generated audio.");
      };
      await audio.play();
      setTtsStatus(`Playing ${result.provider} audio (${result.latency_ms}ms).`);
    } catch (error) {
      setPlayingTranscriptId(null);
      setTtsStatus(parseApiError(error) || "TTS is unavailable. Configure Piper first.");
    }
  };

  const handleOffer = async (payload) => {
    if (payload.payload?.media_type === "video") {
      isVideoCallRef.current = true;
      setIsVideoCall(true);
    }
    if (!inCallRef.current && !localStreamRef.current) {
      await ensureLocalMedia({ video: isVideoCallRef.current });
      inCallRef.current = true;
      setInCall(true);
    }
    const peerId = payload.sender_session_id;
    const connection = await createPeerConnection(peerId);
    await connection.setRemoteDescription(payload.payload.description);
    await flushPendingIce(peerId);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    console.info("Answer created", { target: peerId });
    updatePeerDiagnostic(peerId, { localDescription: "answer" });
    noteDiagnostic("answer created");
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
    updatePeerDiagnostic(peerId, { remoteDescription: "answer" });
    noteDiagnostic("answer received");
  };

  const handleIceCandidate = async (payload) => {
    const peerId = payload.sender_session_id;
    const candidatePayload = payload.payload?.candidate;
    if (!candidatePayload) return;
    const candidate = new RTCIceCandidate(candidatePayload);
    setPeerDiagnostics((current) => ({
      ...current,
      [peerId]: {
        ...(current[peerId] || {}),
        name: current[peerId]?.name || memberFor(peerId).username,
        iceCandidatesReceived: (current[peerId]?.iceCandidatesReceived || 0) + 1,
      },
    }));
    noteDiagnostic("ICE candidate received");
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
        const mediaType = payload.payload?.media_type || "audio";
        isVideoCallRef.current = mediaType === "video";
        setIsVideoCall(mediaType === "video");
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
    let active = true;
    intentionalCloseRef.current = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connectSocket = () => {
      if (!active) return;
      const token = localStorage.getItem("access_token");
      const roomId = encodeURIComponent(session.roomId);
      const userLang = encodeURIComponent(activeLanguageRef.current || session.userLang);
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
      const socket = new WebSocket(`${WS_BASE_URL}/${roomId}/${userLang}${tokenParam}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        noteDiagnostic("websocket connected", {
          websocketStatus: "connected",
          reconnectAttempts: reconnectAttemptsRef.current,
        });
        setConnectionError("");
        socket.send(
          JSON.stringify({
            type: "join",
            username: session.username,
            room_id: session.roomId,
            role: session.role,
          })
        );
        socket.send(
          JSON.stringify({
            type: "listener_preferences",
            room_id: session.roomId,
            listener_mode: listenerModeRef.current,
          })
        );
      };

      socket.onerror = () => {
        noteDiagnostic("websocket error", { websocketStatus: "error" });
        setConnectionError("WebSocket error. Reconnecting...");
      };

      socket.onclose = (event) => {
        if (!active) return;
        setIsConnected(false);
        noteDiagnostic("websocket closed", { websocketStatus: "closed" });
        if (!intentionalCloseRef.current && inCallRef.current) {
          pendingCallRecoveryRef.current = {
            hostId: callHostIdRef.current,
            isVideo: isVideoCallRef.current,
          };
        }
        cleanupCall(false);
        const message = `WebSocket closed: ${event.code}${event.reason ? ` - ${event.reason}` : ""}`;
        setConnectionError(
          intentionalCloseRef.current ? message : `${message}. Reconnecting...`
        );
        if (!intentionalCloseRef.current) {
          clearReconnectTimer();
          reconnectAttemptsRef.current += 1;
          setDiagnostics((current) => ({
            ...current,
            reconnectAttempts: reconnectAttemptsRef.current,
          }));
          reconnectTimerRef.current = window.setTimeout(connectSocket, 1200);
        }
      };

      socket.onmessage = async (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "connection_ack") {
          sessionIdRef.current = payload.session_id;
          activeLanguageRef.current = payload.preferred_language || activeLanguageRef.current;
          membersRef.current = payload.members || [];
          setSessionId(payload.session_id);
          setActiveLanguage(payload.preferred_language || activeLanguageRef.current);
          setUserRole(payload.role || "participant");
          setMembers(payload.members || []);
          if (pendingCallRecoveryRef.current) {
            const recovery = pendingCallRecoveryRef.current;
            pendingCallRecoveryRef.current = null;
            if (recovery.hostId && recovery.hostId !== payload.session_id) {
              window.setTimeout(async () => {
                try {
                  isVideoCallRef.current = recovery.isVideo;
                  setIsVideoCall(recovery.isVideo);
                  await ensureLocalMedia({ video: recovery.isVideo });
                  inCallRef.current = true;
                  setInCall(true);
                  await createOfferForPeer(recovery.hostId);
                  noteDiagnostic("call recovery offer sent");
                } catch (error) {
                  console.error("Call recovery failed", error);
                  setCallError("Call recovery failed. Rejoin the call.");
                }
              }, 500);
            }
          }
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
          setTranscriptionError("");
          setTranscriptionStatus(`Latest transcript received in ${payload.total_latency_ms}ms.`);
          setTranscripts((current) => [{ ...payload, id: createClientId() }, ...current].slice(0, 50));
          return;
        }
        if (payload.type === "translation_audio") {
          setTranscriptionStatus(`Translated audio received in ${payload.total_latency_ms}ms.`);
          setTranslatedAudioItems((current) =>
            [{ ...payload, id: createClientId() }, ...current].slice(0, 30)
          );
          setTranscripts((current) =>
            current.map((item) =>
              item.sender_session_id === payload.sender_session_id &&
              item.sequence === payload.sequence &&
              item.target_language === payload.target_language
                ? {
                    ...item,
                    tts_latency_ms: payload.tts_latency_ms,
                    total_latency_ms: payload.total_latency_ms,
                  }
                : item
            )
          );
          return;
        }
        if (payload.type === "translation_status") {
          const message = payload.message
            ? `${payload.stage}: ${payload.message}`
            : `${payload.stage} ${payload.status}`;
          setTranscriptionStatus(message);
          const stageLabel = {
            listening: payload.status === "started" ? "Listening..." : "Transcribing...",
            stt: payload.status === "started" ? "Transcribing..." : "Transcript ready",
            translation: payload.status === "started" ? "Translating..." : "Translation ready",
            tts: payload.status === "started" ? "Generating speech..." : "Speaking...",
            delivery: payload.status === "failed" ? "Delivery failed" : "",
          }[payload.stage];
          setParticipantTranslationStatus((current) => ({
            ...current,
            [payload.sender_session_id]:
              payload.status === "failed" ? `${payload.stage} failed` : stageLabel,
          }));
          if (payload.status === "failed") {
            setTranscriptionError(message);
          }
          return;
        }
        if (payload.type === "voice_status") {
          setTranscriptionStatus(payload.message || "Live translation status updated.");
          if (payload.level === "error") {
            setTranscriptionError(payload.message || "Live translation failed.");
          }
          return;
        }
        setMessages((current) => [...current, { ...payload, id: createClientId() }]);
      };
    };

    connectSocket();

    return () => {
      active = false;
      clearReconnectTimer();
      cleanupCall(true);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close(1000, "chat_unmounted");
      }
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
      if (audio) {
        audio.muted = originalAudioMuted;
      }
    });
  }, [remoteStreams, originalAudioMuted]);

  useEffect(() => {
    if (
      selectedRecipient !== "all" &&
      !directTargets.some((member) => member.session_id === selectedRecipient)
    ) {
      setSelectedRecipient("all");
    }
  }, [directTargets, selectedRecipient]);

  const joinRoom = (data) => {
    intentionalCloseRef.current = false;
    sessionIdRef.current = null;
    membersRef.current = [];
    activeLanguageRef.current = data.userLang;
    listenerModeRef.current = "original_translated_audio";
    callHostIdRef.current = null;
    setMessages([]);
    setMembers([]);
    setConnectionError("");
    setSelectedRecipient("all");
    setActiveLanguage(data.userLang);
    setListenerMode("original_translated_audio");
    setTranslatedAudioItems([]);
    setCallActive(false);
    setCallHostId(null);
    cleanupCall(false);
    setSession(data);
  };

  const leaveRoom = () => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    cleanupCall(true);
    socketRef.current?.close(1000, "leave_room");
    setSession(null);
    sessionIdRef.current = null;
    membersRef.current = [];
    activeLanguageRef.current = user?.preferred_language || "en";
    listenerModeRef.current = "original_translated_audio";
    callHostIdRef.current = null;
    setSessionId(null);
    setActiveLanguage(user?.preferred_language || "en");
    setUserRole("participant");
    setSelectedRecipient("all");
    setMembers([]);
    setMessages([]);
    setDraft("");
    setConnectionError("");
    setCallActive(false);
    setCallHostId(null);
    setTranscripts([]);
    setTranslatedAudioItems([]);
    setListenerMode("original_translated_audio");
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

  const openMeetingPanel = (panel) => {
    setMeetingPanel(panel);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("meeting-side-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  const changeLanguage = (nextLanguage) => {
    activeLanguageRef.current = nextLanguage;
    setActiveLanguage(nextLanguage);
    setMembers((current) =>
      current.map((member) =>
        member.session_id === sessionId
          ? { ...member, preferred_language: nextLanguage }
          : member
      )
    );
    sendSocketMessage({
      type: "language_update",
      room_id: session.roomId,
      preferred_language: nextLanguage,
    });
  };

  const changeListenerMode = (nextMode) => {
    listenerModeRef.current = nextMode;
    setListenerMode(nextMode);
    sendSocketMessage({
      type: "listener_preferences",
      room_id: session.roomId,
      listener_mode: nextMode,
    });
  };

  const copyMeetingLink = async () => {
    const publicOrigin = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
    const meetingUrl = `${publicOrigin.replace(/\/$/, "")}/chat?room=${encodeURIComponent(
      session.roomId
    )}`;
    try {
      await copyText(meetingUrl);
      setShareStatus("Meeting link copied");
      window.setTimeout(() => setShareStatus(""), 2500);
    } catch {
      setShareStatus(meetingUrl);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <span className="text-brand-bg/40 text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login${window.location.search}`} replace />;
  }

  if (!session) {
    return (
      <JoinForm
        user={user}
        onJoin={joinRoom}
        initialRoomId={searchParams.get("room") || ""}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark xl:h-screen xl:flex-row xl:overflow-hidden">
      <aside className="flex max-h-[42vh] w-full flex-shrink-0 flex-col border-b border-white/[0.06] bg-ui-secondary xl:max-h-none xl:w-64 xl:border-b-0 xl:border-r">
        <div className="px-5 py-5">
          <span className="text-base font-semibold text-brand-bg">Translation Bot</span>
          <p className="mt-1 truncate text-xs text-ui-subtle">Workspace / {session.roomId}</p>
        </div>

        <div className="meeting-scroll flex-1 overflow-y-auto px-3 pb-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-medium text-ui-muted">Participants</p>
            <span className="text-xs tabular-nums text-ui-subtle">{members.length}</span>
          </div>
          <div className="space-y-0.5">
            {members.map((member) => (
              <MemberCard
                key={member.session_id}
                member={member}
                isSelf={member.session_id === sessionId}
                connected={connectedPeerIds.includes(member.session_id)}
                translationStatus={participantTranslationStatus[member.session_id]}
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

          {!isVideoCall && (
            <div className="hidden">
              {Object.entries(remoteStreams).map(([peerId]) => (
                <audio
                  key={peerId}
                  autoPlay
                  muted={originalAudioMuted}
                  ref={(element) => {
                    if (element) remoteAudioRefs.current.set(peerId, element);
                    else remoteAudioRefs.current.delete(peerId);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ui-elevated text-xs font-semibold text-ui-muted">
            {avatarInitials(user.username)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-brand-bg text-sm font-medium truncate">
              {user.name || user.username}
            </p>
            <p className="text-brand-bg/40 text-xs capitalize">
              {userRole} / {user.voice_preference || "auto"}
            </p>
          </div>
          <Link
            to="/profile"
            onClick={leaveRoom}
            className="text-brand-bg/40 hover:text-brand-bg/80 transition text-xs"
          >
            Profile
          </Link>
          <Link
            to="/voice-test"
            onClick={leaveRoom}
            className="text-brand-bg/40 hover:text-brand-bg/80 transition text-xs"
          >
            Voice
          </Link>
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

      <main className="flex min-h-[70vh] min-w-0 flex-1 flex-col bg-brand-dark xl:min-h-0">
        <header className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight text-brand-bg">{session.roomId}</h1>
            <p className="mt-1 text-xs text-ui-subtle">
              {activeLanguage} - {members.length} online
              {callHostId ? ` - call host ${memberFor(callHostId).username}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openMeetingPanel("chat")}
              className="meeting-chat-trigger"
              aria-label="Open translated meeting chat"
            >
              <span className="meeting-chat-trigger__icon" aria-hidden="true" />
              Chat
              {messages.length > 0 && <span className="meeting-chat-trigger__count">{messages.length}</span>}
            </button>
            <button
              type="button"
              onClick={copyMeetingLink}
              className="rounded-control bg-brand-accent px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
              aria-label="Copy meeting link"
            >
              {shareStatus || "Share meeting"}
            </button>
            <label className="flex items-center gap-2 text-xs text-ui-muted">
              Language
              <select
                value={activeLanguage}
                onChange={(event) => changeLanguage(event.target.value)}
                disabled={!isConnected}
                className="rounded-control border border-white/[0.06] bg-ui-secondary px-2.5 py-2 text-xs text-brand-bg outline-none focus:border-brand-accent disabled:opacity-50"
              >
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-ui-muted">
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
              className="rounded-control px-3 py-2 text-xs font-medium text-ui-muted hover:bg-white/[0.04] hover:text-brand-bg"
            >
              Leave room
            </button>
          </div>
        </header>

        <VideoCall
          callActive={callActive}
          inCall={inCall}
          isVideoCall={isVideoCall}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          callError={callError}
          connectedPeers={connectedPeers}
          localStream={localMediaStream}
          remoteStreams={remoteStreams}
          members={members}
          localLabel={user.name || user.username}
          canStartCall={userRole === "host" || userRole === "admin"}
          onStartVideo={startVideoCall}
          onJoinVideo={joinVideoCall}
          onLeave={leaveAudioCall}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          muteRemoteAudio={originalAudioMuted}
          translationStatuses={participantTranslationStatus}
        />

        <div className="meeting-scroll flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
          {connectionError && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {connectionError}
            </div>
          )}
          {!connectionError && !isVideoCall && (
            <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-ui-muted">Ready for your meeting</p>
              <p className="mt-1 text-xs text-ui-subtle">Start video or open Chat to message participants.</p>
            </div>
          )}
        </div>
      </main>

      <aside
        id="meeting-side-panel"
        className="meeting-side-panel w-full flex-shrink-0 border-t border-white/[0.06] bg-ui-secondary xl:w-[380px] xl:border-l xl:border-t-0"
      >
        <div className="meeting-panel-tabs" role="tablist" aria-label="Meeting tools">
          {[
            ["chat", "Chat"],
            ["translation", "Translation"],
            ["diagnostics", "Diagnostics"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={meetingPanel === value}
              className={meetingPanel === value ? "is-active" : ""}
              onClick={() => setMeetingPanel(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {meetingPanel === "chat" && (
          <div className="meeting-chat-panel" role="tabpanel">
            <div className="meeting-chat-panel__heading">
              <div>
                <h2>Meeting chat</h2>
                <p>Messages are translated for each recipient.</p>
              </div>
              <span>{messages.length}</span>
            </div>
            <div className="meeting-scroll meeting-chat-panel__messages">
              {messages.length === 0 ? (
                <div className="meeting-chat-empty">
                  <span className="meeting-chat-empty__icon" aria-hidden="true" />
                  <h3>Start the conversation</h3>
                  <p>Send to everyone or choose a participant for a private translated message.</p>
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
            <form onSubmit={sendMessage} className="meeting-chat-composer">
              {directTargets.length > 0 && (
                <label>
                  <span>Send to</span>
                  <select
                    value={selectedRecipient}
                    onChange={(event) => setSelectedRecipient(event.target.value)}
                    className="ui-input"
                  >
                    <option value="all">Everyone</option>
                    {directTargets.map((member) => (
                      <option key={member.session_id} value={member.session_id}>
                        {member.username}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="meeting-chat-composer__row">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message..."
                  className="ui-input"
                  aria-label="Chat message"
                />
                <button type="submit" disabled={!isConnected || !draft.trim()} aria-label="Send message">
                  Send
                </button>
              </div>
            </form>
          </div>
        )}

        {meetingPanel === "translation" && (
          <div className="meeting-scroll meeting-tool-panel" role="tabpanel">
            <TranslationPanel
              transcripts={transcripts}
              audioItems={translatedAudioItems}
              listenerMode={listenerMode}
              enabled={transcriptionEnabled}
              error={transcriptionError}
              status={transcriptionStatus}
              ttsStatus={ttsStatus}
              onChangeListenerMode={changeListenerMode}
              onPlaybackStateChange={(item, playing) => {
                setParticipantTranslationStatus((current) => ({
                  ...current,
                  [item.sender_session_id]: playing ? "Speaking..." : "",
                }));
              }}
            />
          </div>
        )}

        {meetingPanel === "diagnostics" && (
          <div className="meeting-scroll meeting-tool-panel" role="tabpanel">
            <DiagnosticsPanel
              diagnostics={diagnostics}
              localStream={localMediaStream}
              remoteStreams={remoteStreams}
              peerDiagnostics={peerDiagnostics}
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
        )}
      </aside>
    </div>
  );
}
