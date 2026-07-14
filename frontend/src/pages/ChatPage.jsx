import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Presentation,
  Hand,
  Users,
  MessageSquare,
  Languages,
  Captions,
  Activity,
  LogOut,
  Settings,
  FileText,
  FolderOpen,
  StickyNote
} from "lucide-react";
import DiagnosticsPanel from "../components/DiagnosticsPanel";
import TranslationPanel from "../components/TranslationPanel";
import VideoCall from "../components/VideoCall";
import WhiteboardPanel from "../components/WhiteboardPanel";
import NotesPanel from "../components/NotesPanel";
import FilesPanel from "../components/FilesPanel";
import { useAuth } from "../contexts/AuthContext";
import {
  getIceServers,
  parseApiError,
  synthesizeTts,
  warmupStt,
  getFeatureFlags,
  getPublicLanguages,
} from "../services/api";

const API_HOST = window.location.hostname || "localhost";
const WS_PROTOCOL = window.location.protocol === "https:" ? "wss" : "ws";
const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL || `${WS_PROTOCOL}://${API_HOST}:8000/ws`;
const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const VOICE_ACTIVITY_SAMPLE_MS = 100;
const VOICE_SILENCE_MS = 600;
const VOICE_MIN_UTTERANCE_MS = 500;
const VOICE_MAX_UTTERANCE_MS = 8000;
const VOICE_IDLE_RESET_MS = 5000;
const VOICE_RMS_THRESHOLD = 0.012;

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

const ADMIN_CONTROL_TYPES = new Set([
  "meeting_ended",
  "participant_kicked",
  "room_locked",
  "room_unlocked",
  "chat_disabled",
  "chat_enabled",
  "translation_disabled",
  "translation_enabled",
  "mute_all",
  "participant_muted",
  "participant_unmuted",
  "force_reconnect",
  "system_notification",
  "force_logout",
  "room_policy",
  "feature_flag_update",
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

function JoinForm({ user, onJoin, initialRoomId = "", languages = LANGUAGE_OPTIONS }) {
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
              {languages.map((language) => (
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

function MemberCard({ member, isSelf, connected, translationStatus, connectionState, currentUserRole, onModerate }) {
  const showControls = !isSelf && (currentUserRole === "host" || currentUserRole === "admin");
  const isSpeaking = translationStatus === "Listening..." || member.is_speaking;
  const isMuted = member.is_muted;
  const isCameraOff = member.is_camera_off;
  const handRaised = member.hand_raised;
  
  const isReconnecting = connectionState === "connecting";
  const isDisconnected = !connected && !isSelf;

  return (
    <div className={`flex flex-col gap-1.5 rounded-control px-2.5 py-2.5 transition-all duration-200 hover:bg-white/[0.04] border ${
      isSpeaking ? "border-brand-accent shadow-[0_0_10px_rgba(91,141,239,0.3)] bg-brand-accent/5" : "border-transparent"
    }`}>
      <div className="flex items-center gap-3 w-full">
        <div className="relative flex-shrink-0">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-ui-elevated text-xs font-semibold transition ${
            isSpeaking ? "bg-brand-accent text-white" : "text-ui-muted"
          }`}>
            {avatarInitials(member.username)}
          </div>
          {isSpeaking && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-accent"></span>
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-brand-bg truncate">
              {member.name || member.username}
              {isSelf && <span className="text-brand-bg/40 text-xs ml-1">(you)</span>}
            </p>
            <div className="flex gap-1 items-center">
              {member.role === "host" && (
                <span className="bg-brand-accent/25 text-brand-accent text-[9px] font-bold px-1.5 py-0.5 rounded">HOST</span>
              )}
              {member.role === "co-host" && (
                <span className="bg-brand-accent/15 text-brand-accent/80 text-[9px] font-bold px-1.5 py-0.5 rounded">CO-HOST</span>
              )}
              {handRaised && (
                <span className="text-amber-400 text-xs animate-bounce" title="Hand Raised">✋</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-ui-subtle mt-0.5">
            <span className="capitalize">{member.role}</span>
            <span>•</span>
            <span className="uppercase">{member.preferred_language}</span>
            {isReconnecting && <span className="text-amber-300 text-[10px] animate-pulse">Reconnecting...</span>}
            {isDisconnected && <span className="text-red-300 text-[10px]">Disconnected</span>}
          </div>

          {translationStatus && (
            <p className="mt-1 text-[11px] font-medium text-brand-accent flex items-center gap-1" aria-live="polite">
              {translationStatus.includes("Listening") && (
                <span className="flex items-end gap-0.5 h-2.5 w-3 mb-0.5">
                  <span className="bg-brand-accent w-[2.5px] h-1.5 rounded animate-eq1" />
                  <span className="bg-brand-accent w-[2.5px] h-3 rounded animate-eq2" />
                  <span className="bg-brand-accent w-[2.5px] h-2 rounded animate-eq3" />
                </span>
              )}
              {translationStatus}
            </p>
          )}
        </div>

        <div className="flex gap-1.5 text-xs">
          {isMuted ? (
            <span className="text-ui-danger bg-ui-danger/10 p-1 rounded" title="Microphone muted">
              <MicOff size={13} />
            </span>
          ) : (
            <span className="text-ui-success bg-ui-success/10 p-1 rounded" title="Microphone unmuted">
              <Mic size={13} />
            </span>
          )}
          {isCameraOff ? (
            <span className="text-ui-subtle bg-white/[0.04] p-1 rounded" title="Camera off">
              <VideoOff size={13} />
            </span>
          ) : (
            <span className="text-ui-success bg-ui-success/10 p-1 rounded" title="Camera on">
              <Video size={13} />
            </span>
          )}
        </div>
      </div>
      {showControls && (
        <div className="flex flex-wrap gap-1 mt-1 pl-12">
          <button
            type="button"
            onClick={() => onModerate(member, "MUTE_PARTICIPANT")}
            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-brand-bg/80 hover:bg-white/[0.12]"
          >
            Mute
          </button>
          <button
            type="button"
            onClick={() => onModerate(member, "UNMUTE_PARTICIPANT")}
            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-brand-bg/80 hover:bg-white/[0.12]"
          >
            Unmute
          </button>
          <button
            type="button"
            onClick={() => onModerate(member, "PROMOTE_USER")}
            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-brand-bg/80 hover:bg-white/[0.12]"
          >
            Promote
          </button>
          <button
            type="button"
            onClick={() => onModerate(member, "TRANSFER_HOST")}
            className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-brand-bg/80 hover:bg-white/[0.12]"
          >
            Transfer Host
          </button>
          <button
            type="button"
            onClick={() => onModerate(member, "KICK_PARTICIPANT")}
            className="rounded bg-ui-danger/10 px-1.5 py-0.5 text-[10px] text-ui-danger hover:bg-ui-danger/20"
          >
            Kick
          </button>
        </div>
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

function MessageBubble({ message, isMine, showTranslationDebug, isConsecutive }) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-ui-subtle">
          {message.text} - {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  const isTranslated = message.original !== message.translated;

  return (
    <div className={`flex items-start gap-2 ${isConsecutive ? "mt-0.5" : "mt-3"} ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      {!isConsecutive ? (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ui-elevated text-[10px] font-bold text-ui-muted shadow-sm select-none">
          {avatarInitials(message.sender)}
        </div>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}

      <div className={`max-w-[75%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
        {!isConsecutive && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-xs font-semibold text-brand-bg/85">
              {message.sender}
            </span>
            {message.detected_language && (
              <span className="text-[9px] font-mono bg-white/[0.06] text-ui-muted px-1.5 py-0.2 rounded font-bold uppercase">
                {message.detected_language}
              </span>
            )}
            {isTranslated && (
              <span className="text-[9px] bg-brand-accent/20 text-brand-accent px-1.5 py-0.2 rounded flex items-center gap-0.5" title="Translated message">
                🌐 Translated
              </span>
            )}
            {message.delivery_mode === "direct" && (
              <span className="bg-amber-500/20 text-amber-300 text-[9px] px-1.5 py-0.2 rounded font-semibold">
                Private{message.target_name ? ` to ${message.target_name}` : ""}
              </span>
            )}
            <span className="text-[9.5px] text-ui-subtle">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}

        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isMine
              ? "bg-brand-accent text-white rounded-tr-none"
              : "bg-brand-mid text-brand-bg rounded-tl-none"
          } ${isConsecutive ? (isMine ? "rounded-tr-2xl" : "rounded-tl-2xl") : ""}`}
        >
          <p>{message.translated}</p>
          {isTranslated && (
            <p className={`mt-1.5 border-t pt-1.5 text-xs leading-relaxed ${
              isMine ? "border-white/15 text-white/55" : "border-white/[0.06] text-ui-muted"
            }`}>
              <span className="text-[10px] opacity-40 uppercase block mb-0.5">Original</span>
              {message.original}
            </p>
          )}
          {showTranslationDebug && (
            <div className="mt-2 pt-2 border-t border-white/10 text-[9px] leading-relaxed text-brand-bg/40 font-mono">
              STT: {message.detected_language || "unknown"} to {message.target_language || "unknown"} | {message.translation_status || "unknown"} | {message.cache_hit ? "hit" : "miss"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user, logout, loading } = useAuth();
  const [searchParams] = useSearchParams();

  const [languages, setLanguages] = useState(LANGUAGE_OPTIONS);
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
  const [whiteboardShapes, setWhiteboardShapes] = useState([]);
  const [notesContent, setNotesContent] = useState("");
  const [hostPermissions, setHostPermissions] = useState({
    allow_share: true,
    allow_whiteboard: true,
    allow_files: true,
    allow_notes: true,
    allow_annotations: true,
  });
  const [activeScreenSharer, setActiveScreenSharer] = useState(null);
  const [recordingStatus, setRecordingStatus] = useState({ status: "stopped", timestamp: null });
  const [meetingLayout, setMeetingLayout] = useState("gallery");
  const [isPinned, setIsPinned] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [vadPreset, setVadPreset] = useState("Office");
  const [customVadThreshold, setCustomVadThreshold] = useState(0.012);
  const [customSilenceMs, setCustomSilenceMs] = useState(600);
  const [adaptiveSilence, setAdaptiveSilence] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
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
  const [activeCaption, setActiveCaption] = useState(null);
  const [captionSettings, setCaptionSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("captionSettings");
      return saved ? JSON.parse(saved) : {
        position: "bottom",
        fontSize: "16px",
        bgOpacity: 0.7,
        maxWidth: "600px",
        delay: 0,
        theme: "dark",
        showCaptions: true,
        captionMode: "translated",
      };
    } catch {
      return {
        position: "bottom",
        fontSize: "16px",
        bgOpacity: 0.7,
        maxWidth: "600px",
        delay: 0,
        theme: "dark",
        showCaptions: true,
        captionMode: "translated",
      };
    }
  });

  useEffect(() => {
    localStorage.setItem("captionSettings", JSON.stringify(captionSettings));
  }, [captionSettings]);

  const [showCaptionSettings, setShowCaptionSettings] = useState(false);

  useEffect(() => {
    if (transcripts.length === 0) {
      setActiveCaption(null);
      return;
    }
    const latest = transcripts[0];
    if (captionSettings.delay > 0) {
      const t = setTimeout(() => {
        setActiveCaption(latest);
      }, captionSettings.delay);
      return () => clearTimeout(t);
    } else {
      setActiveCaption(latest);
    }
  }, [transcripts, captionSettings.delay]);

  const [translatedAudioItems, setTranslatedAudioItems] = useState([]);
  const [participantTranslationStatus, setParticipantTranslationStatus] = useState({});
  const [listenerMode, setListenerMode] = useState("original_translated_audio");
  const [connectedPeerIds, setConnectedPeerIds] = useState([]);
  const [localMediaStream, setLocalMediaStream] = useState(null);

  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const val = localStorage.getItem("meeting_left_panel_width");
    return val ? parseInt(val, 10) : 256;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const val = localStorage.getItem("meeting_right_panel_width");
    return val ? parseInt(val, 10) : 380;
  });
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [diagnostics, setDiagnostics] = useState({
    websocketStatus: "idle",
    reconnectAttempts: 0,
    lastEvent: "",
  });

  useEffect(() => {
    getPublicLanguages()
      .then((data) => {
        if (data?.items) {
          setLanguages(data.items.map((item) => ({ label: item.name, value: item.code })));
        }
      })
      .catch((err) => console.warn("Failed to fetch dynamic languages", err));
  }, []);

  const [peerDiagnostics, setPeerDiagnostics] = useState({});
  const [showTranslationDebug, setShowTranslationDebug] = useState(() => {
    return localStorage.getItem("translation_debug") === "true";
  });
  const [shareStatus, setShareStatus] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [translationEnabledByAdmin, setTranslationEnabledByAdmin] = useState(true);
  const [roomLocked, setRoomLocked] = useState(false);
  const [featureFlags, setFeatureFlags] = useState({
    video_calling: true,
    voice_translation: true,
    live_captions: true,
    recording: true,
    screen_sharing: true,
  });

  const socketRef = useRef(null);
  const listEndRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const iceServersRef = useRef({
    servers: DEFAULT_ICE_SERVERS,
    expiresAt: 0,
  });
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
  const isHandRaisedRef = useRef(false);
  const noiseFloorRef = useRef(0.005);


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

  const applyAdministrativeExit = (message, shouldLogout = false) => {
    setConnectionError(message);
    stopVoiceTranscription();
    cleanupCall(true);
    intentionalCloseRef.current = true;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.close(1000, "admin_control");
    }
    socketRef.current = null;
    setMessages((current) => [
      ...current,
      { id: createClientId(), type: "system", text: message, timestamp: new Date().toISOString() },
    ]);
    setSession(null);
    if (shouldLogout) {
      logout();
    }
  };

  const handleAdminControlEvent = async (payload) => {
    const message = payload.message || "Administrative action applied.";
    if (payload.type === "meeting_ended") {
      applyAdministrativeExit(message || "This meeting was ended by an administrator.");
      return true;
    }
    if (payload.type === "participant_kicked") {
      applyAdministrativeExit(message || "You were removed by an administrator.");
      return true;
    }
    if (payload.type === "force_logout") {
      applyAdministrativeExit(message || "Your session was ended by an administrator.", true);
      return true;
    }
    if (payload.type === "force_reconnect") {
      setConnectionError(message || "Administrator requested reconnect.");
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close(1012, "admin_force_reconnect");
      }
      return true;
    }
    if (payload.type === "room_policy") {
      setRoomLocked(Boolean(payload.locked));
      setChatEnabled(payload.chat_enabled !== false);
      setTranslationEnabledByAdmin(payload.translation_enabled !== false);
      return true;
    }
    if (payload.type === "feature_flag_update") {
      setFeatureFlags((current) => ({
        ...current,
        [payload.key]: payload.enabled,
      }));
      if (payload.key === "voice_translation" && !payload.enabled) {
        setTranslationEnabledByAdmin(false);
        stopVoiceTranscription();
      }
      return true;
    }
    if (payload.type === "room_locked" || payload.type === "room_unlocked") {
      setRoomLocked(payload.type === "room_locked");
    }
    if (payload.type === "chat_disabled" || payload.type === "chat_enabled") {
      setChatEnabled(payload.type === "chat_enabled");
    }
    if (payload.type === "translation_disabled" || payload.type === "translation_enabled") {
      const enabled = payload.type === "translation_enabled";
      setTranslationEnabledByAdmin(enabled);
      if (!enabled) stopVoiceTranscription();
    }
    if (payload.type === "mute_all" || payload.type === "participant_muted") {
      setIsMuted(true);
      isMutedRef.current = true;
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    }
    if (payload.type === "participant_unmuted") {
      setIsMuted(false);
      isMutedRef.current = false;
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
    }
    if (payload.type === "system_notification") {
      setMessages((current) => [
        ...current,
        { id: createClientId(), type: "system", text: message, timestamp: payload.timestamp },
      ]);
      return true;
    }
    if (ADMIN_CONTROL_TYPES.has(payload.type)) {
      setMessages((current) => [
        ...current,
        { id: createClientId(), type: "system", text: message, timestamp: payload.timestamp },
      ]);
      return true;
    }
    return false;
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

        // Adapt noise floor
        if (rms < 0.05) {
          noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
        }

        // Determine active threshold based on preset
        let activeThreshold = VOICE_RMS_THRESHOLD;
        if (vadPreset === "Quiet Room") activeThreshold = 0.006;
        else if (vadPreset === "Office") activeThreshold = 0.012;
        else if (vadPreset === "Classroom") activeThreshold = 0.020;
        else if (vadPreset === "Noisy Environment") activeThreshold = 0.035;
        else if (vadPreset === "Custom") activeThreshold = customVadThreshold;

        if (adaptiveSilence) {
          activeThreshold = Math.max(activeThreshold, noiseFloorRef.current * 2.0);
        }

        // Determine active silence timeout
        let activeSilenceMs = VOICE_SILENCE_MS;
        if (vadPreset === "Quiet Room") activeSilenceMs = 400;
        else if (vadPreset === "Office") activeSilenceMs = 600;
        else if (vadPreset === "Classroom") activeSilenceMs = 800;
        else if (vadPreset === "Noisy Environment") activeSilenceMs = 1000;
        else if (vadPreset === "Custom") activeSilenceMs = customSilenceMs;

        if (rms >= activeThreshold) {
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
          silenceDuration >= activeSilenceMs;

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
  };

  const recoverPeerConnection = async (peerId) => {
    const connection = peerConnectionsRef.current.get(peerId);
    if (!connection) return;

    if (connection.__isRestarting) return;
    connection.__isRestarting = true;

    connection.__restartCount = (connection.__restartCount || 0) + 1;
    console.warn(`Recovering peer connection for ${peerId}, attempt: ${connection.__restartCount}`);
    updatePeerDiagnostic(peerId, { connectionState: "connecting" });

    const isCaller = sessionIdRef.current < peerId;
    if (isCaller) {
      try {
        const offer = await connection.createOffer({ iceRestart: true });
        await connection.setLocalDescription(offer);
        sendSignal("webrtc_offer", peerId, {
          description: connection.localDescription,
          media_type: isVideoCallRef.current ? "video" : "audio",
          isRestart: true
        });
      } catch (err) {
        console.error("ICE restart offer failed, recreating connection...", err);
        connection.__isRestarting = false;
        await recreatePeerConnection(peerId);
      }
    } else {
      setTimeout(async () => {
        const currentConn = peerConnectionsRef.current.get(peerId);
        if (currentConn && (currentConn.connectionState === "failed" || currentConn.iceConnectionState === "failed")) {
          await recreatePeerConnection(peerId);
        }
      }, 5000);
    }
  };

  const recreatePeerConnection = async (peerId) => {
    console.warn(`Tearing down and recreating connection for: ${peerId}`);
    removePeerConnection(peerId);
    if (sessionIdRef.current < peerId) {
      await createOfferForPeer(peerId);
    }
  };

  const createPeerConnection = async (peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const localStream = await ensureLocalMedia({ video: isVideoCallRef.current });
    const cachedIce = iceServersRef.current;
    let iceServers = cachedIce.servers;
    if (!cachedIce.expiresAt || cachedIce.expiresAt <= Date.now() / 1000 + 60) {
      try {
        const response = await getIceServers();
        iceServers = response.iceServers?.length
          ? response.iceServers
          : DEFAULT_ICE_SERVERS;
        iceServersRef.current = {
          servers: iceServers,
          expiresAt: response.expiresAt || Date.now() / 1000 + 300,
        };
      } catch (error) {
        console.warn("TURN configuration unavailable; using STUN only", error);
        iceServers = DEFAULT_ICE_SERVERS;
        iceServersRef.current = {
          servers: iceServers,
          expiresAt: Date.now() / 1000 + 60,
        };
      }
    }
    const connection = new RTCPeerConnection({ iceServers });
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
      if (state === "failed") {
        void recoverPeerConnection(peerId);
      }
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
        connection.__isRestarting = false;
        connection.__restartCount = 0;
        updatePeerDiagnostic(peerId, { connectionState: state });
        noteDiagnostic("peer connected");
        updateConnectedPeer(peerId, true);
      }
      if (state === "failed") {
        console.warn("Peer connection failed, initiating recovery", { peerId });
        void recoverPeerConnection(peerId);
      }
      if (state === "disconnected" || state === "closed") {
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
    sendSocketMessage({
      type: "status_update",
      room_id: session.roomId,
      is_muted: muted,
    });
  };

  const toggleCamera = () => {
    const cameraOff = !isCameraOffRef.current;
    isCameraOffRef.current = cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
    setIsCameraOff(cameraOff);
    sendSocketMessage({
      type: "status_update",
      room_id: session.roomId,
      is_camera_off: cameraOff,
    });
  };

  const toggleHandRaised = () => {
    const nextHand = !isHandRaisedRef.current;
    isHandRaisedRef.current = nextHand;
    setIsHandRaised(nextHand);
    sendSocketMessage({
      type: "status_update",
      room_id: session.roomId,
      hand_raised: nextHand,
    });
  };

  const toggleScreenShare = async () => {
    if (!isConnected) return;
    if (userRole !== "host" && userRole !== "admin" && userRole !== "co-host") {
      if (!hostPermissions.allow_share) {
        setCallError("Screen sharing is disabled by the meeting host.");
        return;
      }
    }
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      setScreenStream(stream);
      setIsScreenSharing(true);
      const screenVideoTrack = stream.getVideoTracks()[0];
      peerConnectionsRef.current.forEach((connection) => {
        const senders = connection.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(screenVideoTrack).catch(err => {
            console.warn("Failed to replace track", err);
          });
        }
      });
      setLocalMediaStream(stream);
      screenVideoTrack.onended = () => {
        stopScreenShare();
      };
      sendSocketMessage({
        type: "screen_share_update",
        room_id: session.roomId,
        active: true,
      });
      noteDiagnostic("screen sharing started");
    } catch (err) {
      console.error("Screen sharing denied", err);
      setCallError("Screen sharing permission denied or failed.");
    }
  };

  const stopScreenShare = async () => {
    setIsScreenSharing(false);
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
    }
    try {
      const originalStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: !isCameraOff
      });
      localStreamRef.current = originalStream;
      setLocalMediaStream(originalStream);
      const cameraVideoTrack = originalStream.getVideoTracks()[0];
      peerConnectionsRef.current.forEach((connection) => {
        const senders = connection.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === "video");
        if (videoSender && cameraVideoTrack) {
          videoSender.replaceTrack(cameraVideoTrack).catch(err => {
            console.warn("Failed to restore camera track", err);
          });
        }
      });
    } catch (err) {
      console.warn("Failed to restore camera track", err);
    }
    sendSocketMessage({
      type: "screen_share_update",
      room_id: session.roomId,
      active: false,
    });
    noteDiagnostic("screen sharing stopped");
  };

  const updateRecording = (status) => {
    if (userRole !== "host" && userRole !== "admin" && userRole !== "co-host") return;
    sendSocketMessage({
      type: "recording_update",
      room_id: session.roomId,
      status: status,
    });
  };

  const startResizingLeft = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = leftPanelWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent) => {
      const newWidth = Math.max(200, Math.min(450, startWidth + (mouseMoveEvent.clientX - startX)));
      setLeftPanelWidth(newWidth);
      localStorage.setItem("meeting_left_panel_width", newWidth);
    };

    const stopDrag = () => {
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    };

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const startResizingRight = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = rightPanelWidth;
    const startX = mouseDownEvent.clientX;

    const doDrag = (mouseMoveEvent) => {
      const newWidth = Math.max(280, Math.min(600, startWidth - (mouseMoveEvent.clientX - startX)));
      setRightPanelWidth(newWidth);
      localStorage.setItem("meeting_right_panel_width", newWidth);
    };

    const stopDrag = () => {
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    };

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const resetLeftWidth = () => {
    setLeftPanelWidth(256);
    localStorage.setItem("meeting_left_panel_width", 256);
  };

  const resetRightWidth = () => {
    setRightPanelWidth(380);
    localStorage.setItem("meeting_right_panel_width", 380);
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

  useEffect(() => {
    let active = true;
    getFeatureFlags()
      .then((data) => {
        if (active && data?.features) {
          setFeatureFlags(data.features);
          if (data.features.voice_translation === false) {
            setTranslationEnabledByAdmin(false);
          }
        }
      })
      .catch((err) => console.warn("Failed to fetch feature flags", err));
    return () => { active = false; };
  }, []);

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
        socket.send(
          JSON.stringify({
            type: "status_update",
            room_id: session.roomId,
            is_muted: isMutedRef.current,
            is_camera_off: isCameraOffRef.current,
            hand_raised: isHandRaisedRef.current,
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
        if (payload.type === "sync_collaboration_state") {
          setWhiteboardShapes(payload.whiteboard_shapes || []);
          setNotesContent(payload.notes_content || "");
          setHostPermissions(payload.host_permissions || {
            allow_share: true,
            allow_whiteboard: true,
            allow_files: true,
            allow_notes: true,
            allow_annotations: true,
          });
          setActiveScreenSharer(payload.active_screen_sharer_session_id);
          setRecordingStatus(payload.recording_status || { status: "stopped", timestamp: null });
          if (payload.active_screen_sharer_session_id) {
            setMeetingLayout("presentation");
          }
          return;
        }
        if (payload.type === "whiteboard_update") {
          setWhiteboardShapes(payload.whiteboard_shapes || []);
          return;
        }
        if (payload.type === "notes_update") {
          setNotesContent(payload.notes_content || "");
          return;
        }
        if (payload.type === "screen_share_update") {
          setActiveScreenSharer(payload.active_screen_sharer_session_id);
          if (payload.active_screen_sharer_session_id) {
            setMeetingLayout("presentation");
          } else {
            setMeetingLayout("gallery");
          }
          return;
        }
        if (payload.type === "permissions_update") {
          setHostPermissions(payload.host_permissions || {});
          return;
        }
        if (payload.type === "recording_update") {
          setRecordingStatus(payload.recording_status || { status: "stopped", timestamp: null });
          return;
        }
        if (payload.type === "presentation_pointer") {
          if (window.onPresentationPointerReceived) {
            window.onPresentationPointerReceived(payload);
          }
          return;
        }

        if (ADMIN_CONTROL_TYPES.has(payload.type) && await handleAdminControlEvent(payload)) {
          return;
        }
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
        if (meetingPanel !== "chat" || rightPanelCollapsed) {
          setUnreadMessagesCount((prev) => prev + 1);
        }
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
  }, [session, meetingPanel, rightPanelCollapsed]);

  useEffect(() => {
    if (meetingPanel === "chat" && !rightPanelCollapsed) {
      setUnreadMessagesCount(0);
    }
  }, [meetingPanel, rightPanelCollapsed]);

  useEffect(() => {
    const container = listEndRef.current?.parentElement;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
      const lastMessage = messages[messages.length - 1];
      const isMine = lastMessage?.sender === session?.username;
      if (isNearBottom || isMine) {
        listEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("translation_debug", showTranslationDebug ? "true" : "false");
  }, [showTranslationDebug]);

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
    if (!chatEnabled) {
      setConnectionError("Chat is disabled by an administrator.");
      return;
    }
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
        languages={languages}
      />
    );
  }

  const handleRoomControl = (targetMember, command_type) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      sendSocketMessage({
        type: "room_control",
        room_id: session.roomId,
        command_type,
        target_user_id: targetMember.user_id,
        payload: command_type === "PROMOTE_USER" ? { role: "host" } : {}
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand-dark xl:h-screen xl:flex-row xl:overflow-hidden">
      {/* Left panel: Participants */}
      <aside
        className={`flex max-h-[42vh] w-full flex-shrink-0 flex-col border-b border-white/[0.06] bg-ui-secondary xl:max-h-none xl:border-b-0 xl:border-r transition-all duration-200 ${
          leftPanelCollapsed ? "xl:w-0 xl:overflow-hidden xl:border-r-0" : "xl:w-64"
        }`}
        style={{ width: !leftPanelCollapsed && window.innerWidth >= 1280 ? `${leftPanelWidth}px` : undefined }}
      >
        <div className="px-5 py-5 flex-shrink-0">
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
                connectionState={peerDiagnostics[member.session_id]?.connectionState}
                currentUserRole={userRole}
                onModerate={handleRoomControl}
              />
            ))}
          </div>

          {(userRole === "host" || userRole === "admin" || userRole === "co-host") && (
            <div className="mt-4 border-t border-white/[0.06] pt-4 px-2 mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ui-muted mb-2.5">
                Host Controls
              </p>
              <div className="space-y-2.5">
                {[
                  ["allow_share", "Allow Screen Share"],
                  ["allow_whiteboard", "Allow Whiteboard"],
                  ["allow_notes", "Allow Shared Notes"],
                  ["allow_files", "Allow File Uploads"],
                  ["allow_annotations", "Allow Annotations"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between text-xs text-brand-bg/85 cursor-pointer">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={hostPermissions[key] ?? true}
                      onChange={(e) => {
                        const val = e.target.checked;
                        sendSocketMessage({
                          type: "permissions_update",
                          room_id: session.roomId,
                          host_permissions: {
                            ...hostPermissions,
                            [key]: val
                          }
                        });
                      }}
                      className="accent-brand-accent h-3.5 w-3.5"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <CallPanel
            userRole={userRole}
            callActive={callActive}
            inCall={inCall}
            isMuted={isMuted}
            callStatus={callStatus}
            callError={callError}
            connectedPeers={connectedPeers}
            canStartCall={featureFlags.video_calling && (userRole === "host" || userRole === "admin")}
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

        <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
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

      {/* Resize Handle Left */}
      {!leftPanelCollapsed && (
        <div
          onMouseDown={startResizingLeft}
          onDoubleClick={resetLeftWidth}
          className="hidden xl:block w-1 cursor-col-resize hover:bg-brand-accent/50 active:bg-brand-accent bg-white/[0.04] self-stretch flex-shrink-0 z-30 transition-colors"
          title="Double click to reset width"
        />
      )}

      {/* Main Content Area */}
      <main className="flex min-h-[70vh] min-w-0 flex-1 flex-col bg-brand-dark xl:min-h-0">
        <header className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between flex-shrink-0">
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
                {languages.map((language) => (
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
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col justify-between">
          <div className="flex-1">
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
              canStartCall={featureFlags.video_calling && (userRole === "host" || userRole === "admin")}
              onStartVideo={startVideoCall}
              onJoinVideo={joinVideoCall}
              onLeave={leaveAudioCall}
              onToggleMute={toggleMute}
              onToggleCamera={toggleCamera}
              muteRemoteAudio={originalAudioMuted}
              translationStatuses={participantTranslationStatus}
              videoCallingEnabled={featureFlags.video_calling}
              meetingLayout={meetingLayout}
              activeScreenSharer={activeScreenSharer}
              sessionId={sessionId}
              socket={socketRef.current}
              roomId={session.roomId}
              isPinned={isPinned}
              onTogglePin={() => setIsPinned(!isPinned)}
              onToggleLayout={() => setMeetingLayout(meetingLayout === "gallery" ? "presentation" : "gallery")}
            />

            {/* Floating Live Captions Overlay */}
            {captionSettings.showCaptions && activeCaption && (
              <div 
                className="pointer-events-none absolute left-0 right-0 flex justify-center z-20"
                style={{
                  top: captionSettings.position === "top" ? "80px" : "auto",
                  bottom: captionSettings.position === "bottom" ? "100px" : "auto",
                }}
              >
                <div 
                  className={`pointer-events-auto rounded-lg px-4 py-2 text-center transition-all ${
                    captionSettings.theme === "light" 
                      ? "bg-white text-black border border-black/10" 
                      : captionSettings.theme === "amber" 
                        ? "bg-[#1e1e1e] text-amber-400 border border-amber-500/20" 
                        : "bg-black text-white border border-white/10"
                  }`}
                  style={{
                    fontSize: captionSettings.fontSize,
                    backgroundColor: `rgba(${
                      captionSettings.theme === "light" ? "255, 255, 255" : "0, 0, 0"
                    }, ${captionSettings.bgOpacity})`,
                    maxWidth: captionSettings.maxWidth,
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider mb-0.5">
                    {activeCaption.sender} ({activeCaption.detected_language?.toUpperCase()})
                  </p>
                  <p className="leading-snug font-medium">
                    {captionSettings.captionMode === "original" 
                      ? activeCaption.original 
                      : activeCaption.translated}
                  </p>
                </div>
              </div>
            )}

            <div className="meeting-scroll space-y-3 px-4 py-5 sm:px-6">
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
          </div>
        </div>

        {/* Bottom Meeting Toolbar */}
        <div className="bg-ui-secondary border-t border-white/[0.06] px-6 py-3 flex items-center justify-between z-40 flex-shrink-0">
          <div className="hidden md:flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-xs text-ui-muted">
              {isConnected ? "Connected" : "Offline"} | peers: {connectedPeers.length}
            </span>
          </div>

          <div className="flex items-center gap-2.5 mx-auto md:mx-0">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                isMuted
                  ? "bg-ui-danger text-white hover:bg-ui-danger/90"
                  : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
              }`}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              onClick={toggleCamera}
              className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                isCameraOff
                  ? "bg-ui-danger text-white hover:bg-ui-danger/90"
                  : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
              }`}
              title={isCameraOff ? "Turn Video On" : "Turn Video Off"}
            >
              {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                isScreenSharing
                  ? "bg-brand-accent text-white"
                  : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
              }`}
              title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
            >
              <Monitor size={20} />
            </button>

            <button
              onClick={() => {
                if (meetingPanel === "whiteboard" && !rightPanelCollapsed) {
                  setRightPanelCollapsed(true);
                } else {
                  setMeetingPanel("whiteboard");
                  setRightPanelCollapsed(false);
                }
              }}
              className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                !rightPanelCollapsed && meetingPanel === "whiteboard"
                  ? "bg-brand-accent text-white"
                  : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
              }`}
              title="Toggle Whiteboard"
            >
              <Presentation size={20} />
            </button>

            <button
              onClick={toggleHandRaised}
              className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                isHandRaised
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
              }`}
              title={isHandRaised ? "Lower Hand" : "Raise Hand"}
            >
              <Hand size={20} />
            </button>

            <button
              onClick={() => setShowCaptionSettings(!showCaptionSettings)}
              className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                showCaptionSettings
                  ? "bg-brand-accent text-white"
                  : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
              }`}
              title="Caption Settings"
            >
              <Captions size={20} />
            </button>

            {/* Recording controls UI placeholder */}
            <div className="flex items-center gap-1.5 border-l border-white/10 pl-2.5">
              {recordingStatus.status === "recording" && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
              <button
                onClick={() => {
                  const canRec = userRole === "host" || userRole === "admin" || userRole === "co-host";
                  if (!canRec) return;
                  if (recordingStatus.status === "recording") {
                    updateRecording("stopped");
                  } else {
                    updateRecording("recording");
                  }
                }}
                disabled={!(userRole === "host" || userRole === "admin" || userRole === "co-host")}
                className={`px-3 py-1.5 rounded-full transition-all duration-200 text-[10px] font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-accent ${
                  recordingStatus.status === "recording"
                    ? "bg-red-650 text-white animate-pulse"
                    : recordingStatus.status === "paused"
                      ? "bg-amber-500 text-white"
                      : "bg-white/[0.06] text-brand-bg/85 hover:bg-white/[0.12]"
                } ${!(userRole === "host" || userRole === "admin" || userRole === "co-host") ? "opacity-50 cursor-not-allowed" : ""}`}
                title={
                  !(userRole === "host" || userRole === "admin" || userRole === "co-host")
                    ? `Recording is ${recordingStatus.status}`
                    : recordingStatus.status === "recording"
                      ? "Stop Recording"
                      : "Start Recording"
                }
              >
                {recordingStatus.status === "recording" ? "● Rec" : "Record"}
              </button>
              {(userRole === "host" || userRole === "admin" || userRole === "co-host") && recordingStatus.status === "recording" && (
                <button
                  onClick={() => updateRecording("paused")}
                  className="p-1 rounded bg-white/10 text-white text-[9px] font-bold hover:bg-white/20"
                >
                  Pause
                </button>
              )}
              {(userRole === "host" || userRole === "admin" || userRole === "co-host") && recordingStatus.status === "paused" && (
                <button
                  onClick={() => updateRecording("recording")}
                  className="p-1 rounded bg-brand-accent text-white text-[9px] font-bold hover:brightness-110"
                >
                  Resume
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLeftPanelCollapsed((prev) => !prev)}
              className={`p-2.5 rounded-lg transition-all focus:outline-none ${
                !leftPanelCollapsed
                  ? "bg-brand-accent/20 text-brand-accent"
                  : "text-ui-muted hover:bg-white/[0.04]"
              }`}
              title="Toggle Participants Panel"
            >
              <Users size={18} />
            </button>

            <button
              onClick={() => {
                if (meetingPanel === "chat" && !rightPanelCollapsed) {
                  setRightPanelCollapsed(true);
                } else {
                  setMeetingPanel("chat");
                  setRightPanelCollapsed(false);
                }
              }}
              className={`relative p-2.5 rounded-lg transition-all focus:outline-none ${
                !rightPanelCollapsed && meetingPanel === "chat"
                  ? "bg-brand-accent/20 text-brand-accent"
                  : "text-ui-muted hover:bg-white/[0.04]"
              }`}
              title="Toggle Chat Panel"
            >
              <MessageSquare size={18} />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-ui-danger text-white text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
                  {unreadMessagesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                if (meetingPanel === "translation" && !rightPanelCollapsed) {
                  setRightPanelCollapsed(true);
                } else {
                  setMeetingPanel("translation");
                  setRightPanelCollapsed(false);
                }
              }}
              className={`p-2.5 rounded-lg transition-all focus:outline-none ${
                !rightPanelCollapsed && meetingPanel === "translation"
                  ? "bg-brand-accent/20 text-brand-accent"
                  : "text-ui-muted hover:bg-white/[0.04]"
              }`}
              title="Toggle Translation Panel"
            >
              <Languages size={18} />
            </button>

            <button
              onClick={() => {
                if (meetingPanel === "notes" && !rightPanelCollapsed) {
                  setRightPanelCollapsed(true);
                } else {
                  setMeetingPanel("notes");
                  setRightPanelCollapsed(false);
                }
              }}
              className={`p-2.5 rounded-lg transition-all focus:outline-none ${
                !rightPanelCollapsed && meetingPanel === "notes"
                  ? "bg-brand-accent/20 text-brand-accent"
                  : "text-ui-muted hover:bg-white/[0.04]"
              }`}
              title="Toggle Notes Panel"
            >
              <StickyNote size={18} />
            </button>

            <button
              onClick={() => {
                if (meetingPanel === "files" && !rightPanelCollapsed) {
                  setRightPanelCollapsed(true);
                } else {
                  setMeetingPanel("files");
                  setRightPanelCollapsed(false);
                }
              }}
              className={`p-2.5 rounded-lg transition-all focus:outline-none ${
                !rightPanelCollapsed && meetingPanel === "files"
                  ? "bg-brand-accent/20 text-brand-accent"
                  : "text-ui-muted hover:bg-white/[0.04]"
              }`}
              title="Toggle Files Panel"
            >
              <FolderOpen size={18} />
            </button>

            <button
              onClick={() => {
                if (meetingPanel === "diagnostics" && !rightPanelCollapsed) {
                  setRightPanelCollapsed(true);
                } else {
                  setMeetingPanel("diagnostics");
                  setRightPanelCollapsed(false);
                }
              }}
              className={`p-2.5 rounded-lg transition-all focus:outline-none ${
                !rightPanelCollapsed && meetingPanel === "diagnostics"
                  ? "bg-brand-accent/20 text-brand-accent"
                  : "text-ui-muted hover:bg-white/[0.04]"
              }`}
              title="Toggle Diagnostics Panel"
            >
              <Activity size={18} />
            </button>

            <button
              onClick={leaveAudioCall}
              className="ml-2 px-4 py-2 bg-ui-danger hover:bg-ui-danger/90 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 focus:outline-none"
              title="Leave Room Call"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
      </main>

      {/* Resize Handle Right */}
      {!rightPanelCollapsed && (
        <div
          onMouseDown={startResizingRight}
          onDoubleClick={resetRightWidth}
          className="hidden xl:block w-1 cursor-col-resize hover:bg-brand-accent/50 active:bg-brand-accent bg-white/[0.04] self-stretch flex-shrink-0 z-30 transition-colors"
          title="Double click to reset width"
        />
      )}

      {/* Right panel: Chat / Translation / Diagnostics */}
      <aside
        id="meeting-side-panel"
        className={`meeting-side-panel w-full flex-shrink-0 border-t border-white/[0.06] bg-ui-secondary xl:border-l xl:border-t-0 flex flex-col transition-all duration-200 ${
          rightPanelCollapsed ? "xl:w-0 xl:overflow-hidden xl:border-l-0" : "xl:w-[380px]"
        }`}
        style={{ width: !rightPanelCollapsed && window.innerWidth >= 1280 ? `${rightPanelWidth}px` : undefined }}
      >
        <div className="meeting-panel-tabs" role="tablist" aria-label="Meeting tools">
          {[
            ["chat", "Chat"],
            ["translation", "Translation"],
            ["whiteboard", "Whiteboard"],
            ["notes", "Notes"],
            ["files", "Files"],
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
        {(roomLocked || !chatEnabled || !translationEnabledByAdmin) && (
          <div className="mx-4 mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
            {roomLocked ? "Room locked. " : ""}
            {!chatEnabled ? "Chat disabled. " : ""}
            {!translationEnabledByAdmin ? "Translation disabled." : ""}
          </div>
        )}

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
                messages.map((message, idx) => {
                  const prev = messages[idx - 1];
                  const isConsecutive =
                    prev &&
                    prev.sender === message.sender &&
                    prev.type !== "system" &&
                    message.type !== "system" &&
                    new Date(message.timestamp).getTime() - new Date(prev.timestamp).getTime() < 60000;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isMine={message.sender === session.username}
                      showTranslationDebug={showTranslationDebug}
                      isConsecutive={isConsecutive}
                    />
                  );
                })
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
                  placeholder={chatEnabled ? "Write a message..." : "Chat disabled by administrator"}
                  className="ui-input"
                  aria-label="Chat message"
                  disabled={!chatEnabled}
                />
                <button type="submit" disabled={!isConnected || !draft.trim() || !chatEnabled} aria-label="Send message">
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
              onChangeListenerMode={translationEnabledByAdmin ? changeListenerMode : () => setTranscriptionError("Translation is disabled by an administrator.")}
              disabled={!translationEnabledByAdmin}
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
              transcripts={transcripts}
              userRole={userRole}

              vadPreset={vadPreset}
              setVadPreset={setVadPreset}
              customVadThreshold={customVadThreshold}
              setCustomVadThreshold={setCustomVadThreshold}
              customSilenceMs={customSilenceMs}
              setCustomSilenceMs={setCustomSilenceMs}
              adaptiveSilence={adaptiveSilence}
              setAdaptiveSilence={setAdaptiveSilence}
              developerMode={developerMode}
              setDeveloperMode={setDeveloperMode}
            />
          </div>
        )}

        {meetingPanel === "whiteboard" && (
          <div className="meeting-scroll meeting-tool-panel flex-grow flex flex-col h-full overflow-hidden" role="tabpanel">
            <WhiteboardPanel
              roomId={session.roomId}
              sessionId={sessionId}
              socket={socketRef.current}
              initialShapes={whiteboardShapes}
              allowEditing={hostPermissions.allow_whiteboard || userRole === "host" || userRole === "admin" || userRole === "co-host"}
            />
          </div>
        )}

        {meetingPanel === "notes" && (
          <div className="meeting-scroll meeting-tool-panel flex-grow flex flex-col h-full overflow-hidden" role="tabpanel">
            <NotesPanel
              roomId={session.roomId}
              sessionId={sessionId}
              socket={socketRef.current}
              initialContent={notesContent}
              allowEditing={hostPermissions.allow_notes || userRole === "host" || userRole === "admin" || userRole === "co-host"}
            />
          </div>
        )}

        {meetingPanel === "files" && (
          <div className="meeting-scroll meeting-tool-panel flex-grow flex flex-col h-full overflow-hidden" role="tabpanel">
            <FilesPanel
              roomId={session.roomId}
              sessionId={sessionId}
              username={session.username}
              socket={socketRef.current}
              currentUserRole={userRole}
              allowUploads={hostPermissions.allow_files || userRole === "host" || userRole === "admin" || userRole === "co-host"}
            />
          </div>
        )}
      </aside>

      {/* Caption Settings Modal */}
      {showCaptionSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-ui-secondary border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl animate-fade-in text-brand-bg">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Captions size={18} className="text-brand-accent" />
                Live Captions Settings
              </h3>
              <button 
                onClick={() => setShowCaptionSettings(false)}
                className="text-ui-muted hover:text-brand-bg transition text-xs font-semibold"
              >
                Close
              </button>
            </div>
            
            <div className="space-y-3.5 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span>Show Captions</span>
                <input 
                  type="checkbox"
                  checked={captionSettings.showCaptions}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, showCaptions: e.target.checked })}
                  className="accent-brand-accent h-4 w-4"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-ui-muted">Caption Mode</span>
                <select
                  value={captionSettings.captionMode}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, captionMode: e.target.value })}
                  className="w-full bg-brand-dark border border-white/10 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-accent"
                >
                  <option value="translated">Translated Text</option>
                  <option value="original">Original Speech Text</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-ui-muted">Position</span>
                <select
                  value={captionSettings.position}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, position: e.target.value })}
                  className="w-full bg-brand-dark border border-white/10 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-accent"
                >
                  <option value="bottom">Bottom Overlay</option>
                  <option value="top">Top Overlay</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-ui-muted">Font Size</span>
                <select
                  value={captionSettings.fontSize}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, fontSize: e.target.value })}
                  className="w-full bg-brand-dark border border-white/10 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-accent"
                >
                  <option value="12px">Small (12px)</option>
                  <option value="16px">Medium (16px)</option>
                  <option value="22px">Large (22px)</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-ui-muted">Color Theme</span>
                <select
                  value={captionSettings.theme}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, theme: e.target.value })}
                  className="w-full bg-brand-dark border border-white/10 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-accent"
                >
                  <option value="dark">White on Black</option>
                  <option value="light">Black on White</option>
                  <option value="amber">Amber on Dark Gray</option>
                </select>
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between">
                  <span className="text-ui-muted">Background Opacity</span>
                  <span>{Math.round(captionSettings.bgOpacity * 100)}%</span>
                </div>
                <input 
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={captionSettings.bgOpacity}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, bgOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-brand-accent"
                />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between">
                  <span className="text-ui-muted">Rendering Delay</span>
                  <span>{captionSettings.delay}ms</span>
                </div>
                <input 
                  type="range"
                  min="0"
                  max="2000"
                  step="100"
                  value={captionSettings.delay}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, delay: parseInt(e.target.value, 10) })}
                  className="w-full accent-brand-accent"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-ui-muted">Maximum Width</span>
                <select
                  value={captionSettings.maxWidth}
                  onChange={(e) => setCaptionSettings({ ...captionSettings, maxWidth: e.target.value })}
                  className="w-full bg-brand-dark border border-white/10 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-accent"
                >
                  <option value="400px">Narrow (400px)</option>
                  <option value="600px">Standard (600px)</option>
                  <option value="900px">Wide (900px)</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

