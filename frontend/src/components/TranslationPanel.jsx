import { useState, useMemo } from "react";
import { Copy } from "lucide-react";
import TranslatedAudioPlayer from "./TranslatedAudioPlayer";
import Panel from "./ui/Panel";
import StatusBadge from "./ui/StatusBadge";

const LISTENER_MODE_OPTIONS = [
  { value: "original_audio_only", label: "Original audio only" },
  { value: "translated_audio_only", label: "Translated audio only" },
  { value: "original_transcript", label: "Original + translated transcript" },
  { value: "original_translated_audio", label: "Original + translated audio" },
];

const PIPELINE = [
  { id: "listening", label: "Listening" },
  { id: "transcribing", label: "Transcribing" },
  { id: "translating", label: "Translating" },
  { id: "generating", label: "Generating voice" },
  { id: "playing", label: "Playing" },
];

function ttsLabel(item) {
  if (item.tts_status === "synthesized" || item.tts_latency_ms) return "Synthesized";
  if (item.tts_status === "pending") return "Pending";
  if (item.tts_status === "not_requested") return "Not requested";
  if (item.tts_status === "skipped") {
    const reason = item.tts_skip_reason || "not_needed";
    return `Skipped: ${reason.replaceAll("_", " ")}`;
  }
  return "Not generated";
}

function activePipelineIndex(status = "", ttsStatus = "") {
  const value = `${status} ${ttsStatus}`.toLowerCase();
  if (value.includes("playing") || value.includes("delivered")) return 4;
  if (value.includes("speech") || value.includes("tts") || value.includes("generating")) return 3;
  if (value.includes("translat")) return 2;
  if (value.includes("transcrib") || value.includes("stt")) return 1;
  if (value.includes("listen")) return 0;
  return -1;
}

export default function TranslationPanel({
  transcripts,
  audioItems,
  listenerMode,
  enabled,
  error,
  status,
  ttsStatus,
  onChangeListenerMode,
  onPlaybackStateChange,
  disabled = false,
}) {
  const [speakerFilter, setSpeakerFilter] = useState("all");
  const audioEnabled =
    listenerMode === "translated_audio_only" ||
    listenerMode === "original_translated_audio";
  const activeIndex = activePipelineIndex(status, ttsStatus);

  const uniqueSpeakers = useMemo(() => {
    const speakers = new Set(transcripts.map(t => t.sender).filter(Boolean));
    return Array.from(speakers);
  }, [transcripts]);

  const filteredTranscripts = useMemo(() => {
    return transcripts.filter(t => speakerFilter === "all" || t.sender === speakerFilter);
  }, [transcripts, speakerFilter]);


  return (
    <Panel
      title="Translation pipeline"
      description="Live speech processing for this meeting"
      action={
        <StatusBadge tone={enabled ? "green" : "neutral"}>
          {enabled ? "Live" : "Standby"}
        </StatusBadge>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ui-muted">
          Listening preference
        </span>
        <select
          value={listenerMode}
          onChange={(event) => onChangeListenerMode(event.target.value)}
          className="ui-input text-sm"
          aria-label="Translation listening preference"
          disabled={disabled}
        >
          {LISTENER_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-5 space-y-0" aria-label="Translation progress">
        {PIPELINE.map((stage, index) => {
          const complete = activeIndex > index;
          const active = activeIndex === index;
          return (
            <div key={stage.id} className="relative flex min-h-10 gap-3">
              {index < PIPELINE.length - 1 && (
                <span
                  className={`absolute left-[7px] top-4 h-full w-px ${
                    complete ? "bg-brand-accent" : "bg-white/[0.08]"
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative mt-1 h-[15px] w-[15px] flex-shrink-0 rounded-full border-2 ${
                  active
                    ? "animate-pulse border-brand-accent bg-brand-accent"
                    : complete
                      ? "border-brand-accent bg-brand-accent"
                      : "border-ui-subtle bg-brand-mid"
                }`}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2 pb-3">
                <span className={active ? "text-sm font-medium text-brand-bg" : "text-sm text-ui-muted"}>
                  {stage.label}
                </span>
                {active && <span className="text-xs text-brand-accent">Active</span>}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="mt-2 rounded-control bg-ui-error/10 px-3 py-2 text-xs leading-5 text-ui-error">
          {error}
        </div>
      )}
      {disabled && (
        <div role="status" className="mt-2 rounded-control bg-ui-error/10 px-3 py-2 text-xs leading-5 text-ui-error">
          Translation controls are disabled by an administrator.
        </div>
      )}
      {status && <p className="mt-3 text-xs leading-5 text-ui-muted">{status}</p>}
      {ttsStatus && <p className="mt-1 text-xs leading-5 text-ui-muted">{ttsStatus}</p>}

      <TranslatedAudioPlayer
        audioItems={audioItems}
        enabled={audioEnabled && !disabled}
        onPlaybackStateChange={onPlaybackStateChange}
      />

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <div className="mb-3 border-b border-white/[0.04] pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-bg">Recent captions</h3>
            <span className="text-xs text-ui-subtle">{filteredTranscripts.length}</span>
          </div>
          {uniqueSpeakers.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase font-bold text-ui-subtle tracking-wider">Filter by Speaker</span>
              <select
                value={speakerFilter}
                onChange={(e) => setSpeakerFilter(e.target.value)}
                className="w-full bg-ui-secondary text-brand-bg/85 text-xs rounded border border-white/[0.06] p-1.5 focus:outline-none focus:border-brand-accent transition"
              >
                <option value="all">All Speakers</option>
                {uniqueSpeakers.map((sp) => (
                  <option key={sp} value={sp}>{sp}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="meeting-scroll max-h-80 space-y-3 overflow-y-auto pr-1">
          {filteredTranscripts.length === 0 ? (
            <div className="rounded-control bg-ui-secondary px-3 py-4 text-center text-xs leading-5 text-ui-subtle">
              No matching captions found.
            </div>
          ) : (
            filteredTranscripts.map((item) => (
              <article key={item.id} className="rounded-control bg-ui-secondary p-3.5 border border-white/[0.04] space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="truncate text-xs font-semibold text-brand-bg">{item.sender}</p>
                    {item.timestamp && (
                      <span className="text-[9px] text-ui-subtle font-mono">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.confidence !== undefined && (
                      <span className="text-[9px] bg-ui-elevated text-ui-muted px-1.5 py-0.5 rounded font-mono">
                        VAD: {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                    <span className="text-[10px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded font-mono font-bold">
                      {item.total_latency_ms ? `${item.total_latency_ms}ms` : "-"}
                    </span>
                  </div>
                </div>

                <div className="text-xs space-y-2.5">
                  {/* Original Text segment */}
                  <div>
                    <div className="flex justify-between items-center text-ui-subtle mb-1 text-[10px]">
                      <span className="font-semibold uppercase tracking-wider">Original Text ({item.detected_language?.toUpperCase() || "..."})</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(item.original)}
                        className="hover:text-brand-accent transition flex items-center gap-1 text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded"
                        title="Copy original text"
                      >
                        <Copy size={10} />
                        Copy
                      </button>
                    </div>
                    <p className="text-sm text-brand-bg bg-brand-dark/20 p-2 rounded">{item.original}</p>
                  </div>

                  {/* Flow Arrow */}
                  {item.original !== item.translated && (
                    <div className="flex justify-center text-brand-accent font-semibold select-none text-[11px]">
                      ⬇ Translated to {item.target_language?.toUpperCase()}
                    </div>
                  )}

                  {/* Translated Text segment */}
                  {item.original !== item.translated && (
                    <div>
                      <div className="flex justify-between items-center text-ui-subtle mb-1 text-[10px]">
                        <span className="font-semibold uppercase tracking-wider">Translated Text ({item.target_language?.toUpperCase()})</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(item.translated)}
                          className="hover:text-brand-accent transition flex items-center gap-1 text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded"
                          title="Copy translated text"
                        >
                          <Copy size={10} />
                          Copy
                        </button>
                      </div>
                      <p className="text-sm text-ui-muted bg-brand-dark/20 p-2 rounded">{item.translated}</p>
                    </div>
                  )}

                  {/* Latency breakdown pipeline details */}
                  <div className="flex flex-wrap gap-2 text-[10px] text-ui-subtle border-t border-white/[0.04] pt-2">
                    <span className="bg-ui-elevated px-1.5 py-0.5 rounded">STT: {item.stt_latency_ms || "-"}ms</span>
                    <span className="bg-ui-elevated px-1.5 py-0.5 rounded">Translate: {item.translation_latency_ms || "-"}ms</span>
                    {item.tts_latency_ms && (
                      <span className="bg-ui-elevated px-1.5 py-0.5 rounded">TTS: {item.tts_latency_ms}ms</span>
                    )}
                    <span className="bg-ui-success/10 text-ui-success px-1.5 py-0.5 rounded font-medium">
                      TTS Status: {ttsLabel(item)}
                    </span>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}
