import { useMemo, useState } from "react";
import Panel from "./ui/Panel";
import StatusBadge from "./ui/StatusBadge";

export default function DiagnosticsPanel({
  diagnostics,
  localStream,
  remoteStreams,
  peerDiagnostics,
}) {
  const [open, setOpen] = useState(true);
  const localAudio = localStream?.getAudioTracks?.() || [];
  const localVideo = localStream?.getVideoTracks?.() || [];
  const remoteCount = Object.keys(remoteStreams).length;
  const websocketTone = statusTone(diagnostics.websocketStatus);
  const peerSummary = useMemo(() => Object.entries(peerDiagnostics), [peerDiagnostics]);

  return (
    <Panel
      title="Diagnostics"
      description="Transport and media health"
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
          Remote streams {remoteCount}
        </StatusBadge>
        {diagnostics.reconnectAttempts > 0 && (
          <StatusBadge tone="yellow">Reconnects {diagnostics.reconnectAttempts}</StatusBadge>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <MetricGroup title="Transport">
            <DiagnosticItem
              label="WebSocket"
              value={diagnostics.websocketStatus}
              tone={websocketTone}
            />
            <DiagnosticItem
              label="Reconnects"
              value={diagnostics.reconnectAttempts}
              tone={diagnostics.reconnectAttempts ? "yellow" : "green"}
            />
            <DiagnosticItem label="Last event" value={diagnostics.lastEvent || "none"} />
          </MetricGroup>

          <MetricGroup title="Local media">
            <DiagnosticItem
              label="Audio"
              value={trackSummary(localAudio)}
              tone={localAudio.length ? "green" : "neutral"}
            />
            <DiagnosticItem
              label="Video"
              value={trackSummary(localVideo)}
              tone={localVideo.length ? "green" : "neutral"}
            />
            <DiagnosticItem
              label="Remote streams"
              value={remoteCount}
              tone={remoteCount ? "green" : "neutral"}
            />
          </MetricGroup>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-bg/35">
              Peer connections
            </p>
            <div className="space-y-2">
              {peerSummary.length === 0 ? (
                <p className="rounded-control bg-ui-secondary px-3 py-3 text-xs text-ui-subtle">
                  No peer connection yet.
                </p>
              ) : (
                peerSummary.map(([peerId, peer]) => (
                  <div key={peerId} className="rounded-control bg-ui-secondary p-3 text-xs">
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
                      Candidates sent {peer.iceCandidatesSent || 0}, received{" "}
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
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-bg/35">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">{children}</div>
    </div>
  );
}

function DiagnosticItem({ label, value, tone = "neutral" }) {
  return (
    <div className="rounded-control bg-ui-secondary p-3">
      <p className="text-brand-bg/35">{label}</p>
      <p className={`truncate font-semibold ${toneClass(tone)}`}>
        {String(value ?? "unknown")}
      </p>
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
  if (["connected", "open", "complete", "stable"].some((item) => normalized.includes(item))) {
    return "green";
  }
  if (["checking", "connecting", "reconnecting", "new"].some((item) => normalized.includes(item))) {
    return "yellow";
  }
  if (["failed", "closed", "disconnected", "error"].some((item) => normalized.includes(item))) {
    return "red";
  }
  return "neutral";
}

function toneClass(tone) {
  return {
    green: "text-emerald-200",
    yellow: "text-amber-100",
    red: "text-red-200",
    blue: "text-sky-100",
    neutral: "text-brand-bg/75",
  }[tone] || "text-brand-bg/75";
}
