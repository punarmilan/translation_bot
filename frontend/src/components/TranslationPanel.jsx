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
  const audioEnabled =
    listenerMode === "translated_audio_only" ||
    listenerMode === "original_translated_audio";
  const activeIndex = activePipelineIndex(status, ttsStatus);

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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-bg">Recent captions</h3>
          <span className="text-xs text-ui-subtle">{transcripts.length}</span>
        </div>
        <div className="meeting-scroll max-h-80 space-y-2 overflow-y-auto pr-1">
          {transcripts.length === 0 ? (
            <div className="rounded-control bg-ui-secondary px-3 py-4 text-center text-xs leading-5 text-ui-subtle">
              Captions appear after someone speaks in the meeting.
            </div>
          ) : (
            transcripts.map((item) => (
              <article key={item.id} className="rounded-control bg-ui-secondary p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-brand-bg">{item.sender}</p>
                  <span className="text-[11px] text-ui-subtle">{item.total_latency_ms}ms</span>
                </div>
                <p className="mt-2 text-sm leading-5 text-brand-bg">{item.original}</p>
                {item.original !== item.translated && (
                  <div className="mt-2 border-t border-white/[0.06] pt-2">
                    <p className="text-[11px] font-medium uppercase text-brand-accent">
                      {item.detected_language} to {item.target_language}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-ui-muted">{item.translated}</p>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-ui-subtle">
                  <span>STT {item.stt_latency_ms}ms</span>
                  <span>Translate {item.translation_latency_ms}ms</span>
                  {item.tts_latency_ms ? <span>Voice {item.tts_latency_ms}ms</span> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}
