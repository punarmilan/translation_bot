import { useEffect, useMemo, useRef } from "react";
import StatusBadge from "./ui/StatusBadge";

function VideoTile({
  label,
  stream,
  muted = false,
  cameraOff = false,
  isLocal = false,
  member,
  translationStatus,
}) {
  const videoRef = useRef(null);
  const audioTrack = stream?.getAudioTracks?.()[0];
  const videoTrack = stream?.getVideoTracks?.()[0];
  const audioOn = Boolean(audioTrack?.enabled);
  const videoReady = Boolean(videoTrack && videoTrack.readyState === "live" && !cameraOff);
  const speaking = translationStatus === "Listening...";

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <article
      className={`video-tile group relative aspect-video min-h-52 overflow-hidden rounded-large border bg-brand-dark shadow-panel transition-ui ${
        speaking
          ? "border-brand-accent shadow-[0_0_0_2px_rgba(91,141,239,0.18)]"
          : "border-white/[0.06]"
      }`}
    >
      {stream && videoReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-brand-mid text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ui-elevated text-lg font-semibold text-ui-muted">
            {label.slice(0, 1).toUpperCase()}
          </div>
          <p className="text-sm font-semibold text-brand-bg">Camera off</p>
          <p className="mt-1 text-xs text-brand-bg/40">
            {isLocal ? "Your preview is hidden" : "Waiting for video"}
          </p>
        </div>
      )}

      <div className="video-tile__meta absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-brand-bg">{label}</p>
              {member?.role === "host" && <StatusBadge tone="blue">Host</StatusBadge>}
              {member?.preferred_language && (
                <StatusBadge>{member.preferred_language.toUpperCase()}</StatusBadge>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ui-muted">
              {translationStatus || (isLocal ? "Local stream" : "Connection good")}
            </p>
          </div>
          <div className="flex gap-1.5">
            <StatusBadge tone={audioOn ? "green" : "red"}>
              {audioOn ? "Mic" : "Muted"}
            </StatusBadge>
            <StatusBadge tone={videoReady ? "green" : "neutral"}>
              {videoReady ? "Cam" : "Off"}
            </StatusBadge>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function VideoGrid({
  localStream,
  localLabel,
  localCameraOff,
  remoteStreams,
  members,
  muteRemoteAudio = false,
  translationStatuses = {},
}) {
  const remoteEntries = Object.entries(remoteStreams);
  const tileCount = (localStream ? 1 : 0) + remoteEntries.length;
  const gridClass =
    tileCount <= 1
      ? "video-grid video-grid--single"
      : tileCount === 2
        ? "video-grid video-grid--pair"
        : "video-grid video-grid--group";
  const remoteTiles = useMemo(
    () =>
      remoteEntries.map(([peerId, stream]) => {
        const member = members.find((item) => item.session_id === peerId);
        return {
          peerId,
          stream,
          label: member?.name || member?.username || "Peer",
          member,
          translationStatus: translationStatuses[peerId],
        };
      }),
    [members, remoteEntries],
  );

  return (
    <div className="space-y-3">
      <div className={gridClass}>
        {localStream && (
          <VideoTile
            label={`${localLabel} (you)`}
            stream={localStream}
            muted
            cameraOff={localCameraOff}
            isLocal
            member={members.find((item) => item.name === localLabel || item.username === localLabel)}
            translationStatus={
              Object.entries(translationStatuses).find(([, value]) => value)?.[1]
            }
          />
        )}
        {remoteTiles.map(({ peerId, stream, label, member, translationStatus }) => (
          <VideoTile
            key={peerId}
            label={label}
            stream={stream}
            muted={muteRemoteAudio}
            member={member}
            translationStatus={translationStatus}
          />
        ))}
      </div>

      {localStream && remoteTiles.length === 0 && (
        <div className="rounded-panel bg-brand-mid px-4 py-5 text-center">
          <p className="text-sm font-semibold text-brand-bg">Waiting for another participant</p>
          <p className="mt-1 text-xs text-brand-bg/45">
            Keep this tab open. The remote video tile appears after signaling and ICE connect.
          </p>
        </div>
      )}
    </div>
  );
}
