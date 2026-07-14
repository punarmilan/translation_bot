import StatusBadge from "./ui/StatusBadge";
import Button from "./ui/Button";
import VideoGrid from "./VideoGrid";

export default function VideoCall({
  callActive,
  inCall,
  isVideoCall,
  isMuted,
  isCameraOff,
  callError,
  connectedPeers,
  localStream,
  remoteStreams,
  members,
  localLabel,
  canStartCall,
  onStartVideo,
  onJoinVideo,
  onLeave,
  onToggleMute,
  onToggleCamera,
  muteRemoteAudio = false,
  translationStatuses = {},
  videoCallingEnabled = true,
  meetingLayout = "gallery",
  activeScreenSharer = null,
  sessionId = "",
  socket = null,
  roomId = "",
  isPinned = false,
  onTogglePin = () => {},
  onToggleLayout = () => {},
}) {
  const callTone = inCall ? "green" : callActive ? "yellow" : "neutral";
  const callLabel = inCall
    ? `${isVideoCall ? "Video" : "Audio"} live`
    : callActive
      ? "Room call active"
      : "No active call";

  return (
    <section className="meeting-stage bg-brand-dark px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-brand-bg">Meeting stage</p>
            <StatusBadge tone={callTone}>{callLabel}</StatusBadge>
            {inCall && connectedPeers.length === 0 && (
              <StatusBadge tone="yellow">Waiting for peers</StatusBadge>
            )}
          </div>
          <p className="mt-1 text-xs text-brand-bg/45">
            {inCall
              ? `Connected peers: ${connectedPeers.length}`
              : callActive
                ? "Join the room call to exchange media."
                : "Start a video call when participants are ready."}
          </p>
          {callError && <p className="mt-2 text-xs text-red-300">{callError}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!callActive && canStartCall && videoCallingEnabled && (
            <Button variant="primary" onClick={onStartVideo}>
              Join Video Call
            </Button>
          )}
          {callActive && !inCall && videoCallingEnabled && (
            <Button variant="primary" onClick={onJoinVideo}>
              Join Video Call
            </Button>
          )}
        </div>
      </div>

      {isVideoCall && inCall && (
        <VideoGrid
          localStream={localStream}
          localLabel={localLabel}
          localCameraOff={isCameraOff}
          remoteStreams={remoteStreams}
          members={members}
          muteRemoteAudio={muteRemoteAudio}
          translationStatuses={translationStatuses}
          meetingLayout={meetingLayout}
          activeScreenSharer={activeScreenSharer}
          sessionId={sessionId}
          socket={socket}
          roomId={roomId}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          onToggleLayout={onToggleLayout}
        />
      )}
    </section>
  );
}
