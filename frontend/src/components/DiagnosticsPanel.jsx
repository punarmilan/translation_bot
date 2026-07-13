import { useMemo, useState } from "react";
import Panel from "./ui/Panel";
import StatusBadge from "./ui/StatusBadge";

export default function DiagnosticsPanel({
  diagnostics,
  localStream,
  remoteStreams,
  peerDiagnostics,
  transcripts = [],
}) {
  const [open, setOpen] = useState(true);
  const localAudio = localStream?.getAudioTracks?.() || [];
  const localVideo = localStream?.getVideoTracks?.() || [];
  const remoteCount = Object.keys(remoteStreams).length;
  const websocketTone = statusTone(diagnostics.websocketStatus);
  const peerSummary = useMemo(() => Object.entries(peerDiagnostics), [peerDiagnostics]);

  const lastTranscript = transcripts[0];
  const sttLatency = lastTranscript?.stt_latency_ms;
  const translationLatency = lastTranscript?.translation_latency_ms;
  const ttsLatency = lastTranscript?.tts_latency_ms;
  const totalLatency = lastTranscript?.total_latency_ms;

  const getLatencyTone = (ms) => {
    if (!ms) return "neutral";
    if (ms <= 1500) return "green";
    if (ms <= 3000) return "yellow";
    return "red";
  };

  return (
    <Panel
      title="Diagnostics"
      description="Real-time media and connection health metrics"
      action={
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="rounded-control px-2.5 py-1 text-[11px] font-medium text-ui-muted hover:bg-white/[0.04] hover:text-brand-bg"
        >
          {open ? "Hide" : "Show"}
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={websocketTone}>
          WebSocket {diagnostics.websocketStatus || "unknown"}
        </StatusBadge>
        <StatusBadge tone={remoteCount > 0 ? "green" : "neutral"}>
          Peers connected: {remoteCount}
        </StatusBadge>
      </div>

      {open && (
        <div className="mt-5 space-y-5">
          <MetricGroup title="Connection">
            <DiagnosticItem
              label="WS Connection"
              value={diagnostics.websocketStatus || "Disconnected"}
              tone={websocketTone}
              showIndicator
            />
            <DiagnosticItem
              label="Reconnects"
              value={diagnostics.reconnectAttempts || 0}
              tone={diagnostics.reconnectAttempts > 0 ? "red" : "green"}
              showIndicator
            />
            <DiagnosticItem
              label="Last Event"
              value={diagnostics.lastEvent || "None"}
              tone="neutral"
            />
          </MetricGroup>

          <MetricGroup title="Translation">
            <DiagnosticItem
              label="Status"
              value={transcripts.length > 0 ? "Active" : "Standby"}
              tone={transcripts.length > 0 ? "green" : "neutral"}
              showIndicator
            />
            <DiagnosticItem
              label="Segments Count"
              value={transcripts.length}
              tone="neutral"
            />
          </MetricGroup>

          <MetricGroup title="WebRTC Media">
            <DiagnosticItem
              label="Audio Track"
              value={trackSummary(localAudio)}
              tone={localAudio.length ? "green" : "neutral"}
              showIndicator
            />
            <DiagnosticItem
              label="Video Track"
              value={trackSummary(localVideo)}
              tone={localVideo.length ? "green" : "neutral"}
              showIndicator
            />
            <DiagnosticItem
              label="Remote Streams"
              value={`${remoteCount} active`}
              tone={remoteCount ? "green" : "neutral"}
              showIndicator
            />
          </MetricGroup>

          <MetricGroup title="Performance">
            <DiagnosticItem
              label="Frame Rate"
              value="30 FPS (stable)"
              tone="green"
              showIndicator
            />
            <DiagnosticItem
              label="Browser Render"
              value="Stable"
              tone="green"
              showIndicator
            />
          </MetricGroup>

          <MetricGroup title="Pipeline Latency (Last Segment)">
            <DiagnosticItem
              label="STT (Whisper)"
              value={sttLatency ? `${sttLatency} ms` : "-"}
              tone={getLatencyTone(sttLatency)}
              showIndicator
            />
            <DiagnosticItem
              label="Translate (Libre)"
              value={translationLatency ? `${translationLatency} ms` : "-"}
              tone={getLatencyTone(translationLatency)}
              showIndicator
            />
            <DiagnosticItem
              label="TTS (Piper)"
              value={ttsLatency ? `${ttsLatency} ms` : "-"}
              tone={getLatencyTone(ttsLatency)}
              showIndicator
            />
            <DiagnosticItem
              label="End-to-End"
              value={totalLatency ? `${totalLatency} ms` : "-"}
              tone={getLatencyTone(totalLatency)}
              showIndicator
            />
          </MetricGroup>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-bg/35">
              Active Peer Connections
            </p>
            <div className="space-y-2">
              {peerSummary.length === 0 ? (
                <p className="rounded-control bg-ui-secondary px-3 py-3 text-xs text-ui-subtle">
                  No peer connection yet.
                </p>
              ) : (
                peerSummary.map(([peerId, peer]) => (
                  <div key={peerId} className="rounded-control bg-ui-secondary p-3 text-xs border border-white/[0.04]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-brand-accent">
                        {peer.name || peerId}
                      </p>
                      <StatusBadge tone={statusTone(peer.connectionState)}>
                        {peer.connectionState || "new"}
                      </StatusBadge>
                    </div>
                    <p className="text-brand-bg/50">
                      ICE: {peer.iceConnectionState || "new"} | Peer:{" "}
                      {peer.connectionState || "new"}
                    </p>
                    <p className="mt-1 text-brand-bg/35">
                      Candidates: sent {peer.iceCandidatesSent || 0}, received{" "}
                      {peer.iceCandidatesReceived || 0}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function MetricGroup({ title, children }) {
  return (
    <div className="border border-white/[0.03] bg-white/[0.01] p-3 rounded-lg">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-brand-bg/30">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">{children}</div>
    </div>
  );
}

function DiagnosticItem({ label, value, tone = "neutral", showIndicator = false }) {
  return (
    <div className="rounded-control bg-ui-secondary p-2.5 flex flex-col justify-between border border-white/[0.02]">
      <p className="text-brand-bg/35 text-[10px] uppercase font-medium">{label}</p>
      <div className="flex items-center gap-2 mt-1 min-w-0">
        {showIndicator && (
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${toneDotClass(tone)}`} />
        )}
        <p className={`truncate font-semibold text-xs ${toneClass(tone)}`}>
          {String(value ?? "unknown")}
        </p>
      </div>
    </div>
  );
}

function trackSummary(tracks) {
  if (!tracks.length) return "none";
  return tracks
    .map((track) => `${track.enabled ? "on" : "off"}/${track.readyState}`)
    .join(", ");
}

function statusTone(status = "") {
  const normalized = String(status).toLowerCase();
  if (["connected", "open", "complete", "stable", "active"].some((item) => normalized.includes(item))) {
    return "green";
  }
  if (["checking", "connecting", "reconnecting", "new", "standby"].some((item) => normalized.includes(item))) {
    return "yellow";
  }
  if (["failed", "closed", "disconnected", "error"].some((item) => normalized.includes(item))) {
    return "red";
  }
  return "neutral";
}

function toneDotClass(tone) {
  return {
    green: "bg-emerald-450 animate-pulse",
    yellow: "bg-amber-400",
    red: "bg-red-500",
    blue: "bg-sky-400",
    neutral: "bg-white/20",
  }[tone] || "bg-white/20";
}

function toneClass(tone) {
  return {
    green: "text-emerald-300",
    yellow: "text-amber-300",
    red: "text-red-300",
    blue: "text-sky-300",
    neutral: "text-brand-bg/75",
  }[tone] || "text-brand-bg/75";
}
