import { useEffect, useMemo, useRef, useState } from "react";
import { MicOff, Maximize, Pin, PinOff, Grid, Monitor } from "lucide-react";
import StatusBadge from "./ui/StatusBadge";

function PresentationOverlay({ isPresenter, socket, roomId, activeScreenSharer }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("laser"); // laser | highlight | draw | none
  const [isDrawing, setIsDrawing] = useState(false);
  const annotationsRef = useRef([]);

  // WebSocket receiver for viewer annotations
  useEffect(() => {
    if (isPresenter) return;
    const handleWs = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "presentation_pointer" && data.room_id === roomId) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          const x = data.x * canvas.width;
          const y = data.y * canvas.height;
          
          if (data.pointer_type === "laser") {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawAnnotations(ctx);
            // Draw red laser dot
            ctx.beginPath();
            ctx.fillStyle = "#ef4444";
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();
            // Glow
            ctx.beginPath();
            ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
            ctx.arc(x, y, 12, 0, 2 * Math.PI);
            ctx.fill();
          } else if (data.pointer_type === "ripple") {
            drawRipple(ctx, x, y);
          } else if (data.pointer_type === "draw" || data.pointer_type === "highlight") {
            annotationsRef.current.push({
              type: data.pointer_type,
              x,
              y,
              color: data.color || "#3b82f6",
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {}
    };
    socket?.addEventListener("message", handleWs);
    return () => socket?.removeEventListener("message", handleWs);
  }, [socket, isPresenter, roomId]);

  // Render loop to decay annotations
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    const interval = setInterval(() => {
      const now = Date.now();
      annotationsRef.current = annotationsRef.current.filter(a => now - a.timestamp < 3000);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAnnotations(ctx);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const drawAnnotations = (ctx) => {
    annotationsRef.current.forEach((a) => {
      ctx.beginPath();
      ctx.fillStyle = a.color;
      ctx.globalAlpha = a.type === "highlight" ? 0.35 : 1.0;
      ctx.arc(a.x, a.y, a.type === "highlight" ? 12 : 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });
  };

  const drawRipple = (ctx, x, y) => {
    let radius = 2;
    const rippleInterval = setInterval(() => {
      if (!canvasRef.current) {
        clearInterval(rippleInterval);
        return;
      }
      ctx.beginPath();
      ctx.strokeStyle = "rgba(91, 141, 239, " + (1 - radius / 30) + ")";
      ctx.lineWidth = 2.5;
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      radius += 2;
      if (radius >= 30) clearInterval(rippleInterval);
    }, 30);
  };

  const getNormalizedPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handlePointerMove = (e) => {
    if (!isPresenter || !socket) return;
    const pos = getNormalizedPos(e);
    
    if (tool === "laser") {
      socket.send(JSON.stringify({
        type: "presentation_pointer",
        room_id: roomId,
        pointer_type: "laser",
        x: pos.x,
        y: pos.y,
      }));
    }

    if (isDrawing && (tool === "draw" || tool === "highlight")) {
      const color = tool === "highlight" ? "#eab308" : "#5b8def";
      socket.send(JSON.stringify({
        type: "presentation_pointer",
        room_id: roomId,
        pointer_type: tool,
        x: pos.x,
        y: pos.y,
        color,
      }));

      const canvas = canvasRef.current;
      if (canvas) {
        annotationsRef.current.push({
          type: tool,
          x: pos.x * canvas.width,
          y: pos.y * canvas.height,
          color,
          timestamp: Date.now(),
        });
      }
    }
  };

  const handlePointerDown = (e) => {
    if (!isPresenter || !socket) return;
    const pos = getNormalizedPos(e);
    setIsDrawing(true);

    socket.send(JSON.stringify({
      type: "presentation_pointer",
      room_id: roomId,
      pointer_type: "ripple",
      x: pos.x,
      y: pos.y,
    }));
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const clearAllAnnotations = () => {
    annotationsRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="absolute inset-0 z-30 select-none">
      <canvas
        ref={canvasRef}
        onMouseMove={handlePointerMove}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        className={`absolute inset-0 block w-full h-full ${
          isPresenter ? (tool === "none" ? "cursor-default" : "cursor-crosshair") : "cursor-default pointer-events-none"
        }`}
      />

      {isPresenter && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-brand-dark/95 border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-2xl z-40 select-none">
          <button
            onClick={() => setTool("laser")}
            className={`px-2 py-1 text-[10px] font-bold rounded-full transition ${
              tool === "laser" ? "bg-red-500 text-white" : "text-ui-muted hover:text-brand-bg"
            }`}
          >
            🔴 Laser
          </button>
          <button
            onClick={() => setTool("draw")}
            className={`px-2 py-1 text-[10px] font-bold rounded-full transition ${
              tool === "draw" ? "bg-brand-accent text-white" : "text-ui-muted hover:text-brand-bg"
            }`}
          >
            ✏️ Draw
          </button>
          <button
            onClick={() => setTool("highlight")}
            className={`px-2 py-1 text-[10px] font-bold rounded-full transition ${
              tool === "highlight" ? "bg-yellow-500 text-black font-semibold" : "text-ui-muted hover:text-brand-bg"
            }`}
          >
            🖊️ Highlight
          </button>
          <button
            onClick={() => setTool("none")}
            className={`px-2 py-1 text-[10px] font-bold rounded-full transition ${
              tool === "none" ? "bg-ui-secondary text-white" : "text-ui-muted hover:text-brand-bg"
            }`}
          >
            🚫 Cursor
          </button>
          <button
            onClick={clearAllAnnotations}
            className="px-2 py-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition border-l border-white/10 pl-2"
          >
            🗑️ Clear
          </button>
        </div>
      )}
    </div>
  );
}

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
  const speaking = translationStatus === "Listening..." || member?.is_speaking;
  const isMuted = member?.is_muted ?? !audioOn;
  const handRaised = member?.hand_raised;

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      console.info("webrtc.video_track_attached", {
        label,
        isLocal,
        streamId: stream.id,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
      });
      video.play?.().catch((error) => {
        console.info("webrtc.video_play_waiting", {
          label,
          isLocal,
          error: error.message,
        });
      });
    }
  }, [stream, label, isLocal]);

  return (
    <article
      className={`video-tile group relative aspect-video min-h-52 overflow-hidden rounded-large border bg-brand-dark shadow-panel transition-ui ${
        speaking
          ? "border-brand-accent shadow-[0_0_15px_rgba(91,141,239,0.5)] animate-pulse"
          : "border-white/[0.06]"
      }`}
    >
      {speaking && (
        <div className="absolute top-3 left-3 bg-brand-accent text-white px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1.5 shadow-md z-20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          Speaking
        </div>
      )}

      {handRaised && (
        <div className="absolute top-3 right-3 bg-amber-500 text-white rounded-full p-1.5 shadow-lg animate-bounce z-20" title="Hand Raised">
          <span className="text-sm leading-none">✋</span>
        </div>
      )}

      {isMuted && (
        <div className="absolute bottom-3 right-3 bg-red-600/85 backdrop-blur text-white p-1.5 rounded-full shadow-md z-20" title="Muted">
          <MicOff size={13} />
        </div>
      )}

      {stream && videoReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
          onLoadedMetadata={() => console.info("webrtc.video_rendering", { label, isLocal })}
          onPlaying={() => console.info("webrtc.video_playing", { label, isLocal })}
          onError={() => console.info("webrtc.video_render_error", { label, isLocal })}
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

      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        <span className="truncate max-w-[120px]">{label}</span>
        <div className="flex items-center gap-1">
          <StatusBadge tone={videoReady ? "green" : "neutral"}>
            {videoReady ? "Cam" : "Off"}
          </StatusBadge>
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
  meetingLayout = "gallery", // gallery | presentation
  activeScreenSharer = null, // session_id | null
  sessionId = "",
  socket = null,
  roomId = "",
  isPinned = false,
  onTogglePin = () => {},
  onToggleLayout = () => {},
}) {
  const remoteEntries = Object.entries(remoteStreams);
  const tileCount = (localStream ? 1 : 0) + remoteEntries.length;

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
    [members, remoteEntries, translationStatuses],
  );

  const presentationTileRef = useRef(null);

  const handleFullscreen = () => {
    const el = presentationTileRef.current;
    if (el) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  };

  // Find stream of active screen sharer
  const presentationStream = useMemo(() => {
    if (!activeScreenSharer) return null;
    if (activeScreenSharer === sessionId) {
      return localStream;
    }
    return remoteStreams[activeScreenSharer];
  }, [activeScreenSharer, sessionId, localStream, remoteStreams]);

  const presenterLabel = useMemo(() => {
    if (!activeScreenSharer) return "";
    if (activeScreenSharer === sessionId) return `${localLabel} (you)`;
    const member = members.find(m => m.session_id === activeScreenSharer);
    return member?.name || member?.username || "Presenter";
  }, [activeScreenSharer, sessionId, localLabel, members]);

  // Render Presentation Mode
  if (activeScreenSharer && meetingLayout === "presentation" && presentationStream) {
    const isPresenter = activeScreenSharer === sessionId;

    return (
      <div className="flex flex-col gap-4 h-full">
        {/* Main presentation zone */}
        <div ref={presentationTileRef} className="relative flex-1 bg-brand-dark rounded-large overflow-hidden border border-brand-accent/30 group">
          {/* Badge Overlay */}
          <div className="absolute top-3 left-3 z-40 bg-brand-accent/90 text-white font-semibold text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
            <Monitor size={12} className="animate-pulse" />
            <span>{presenterLabel}'s Screen</span>
            <span className="bg-white/20 text-[10px] px-1 rounded">Primary Presentation</span>
          </div>

          {/* Floating Actions Strip */}
          <div className="absolute bottom-3 right-3 z-40 bg-black/75 rounded-control p-1 flex items-center gap-1.5 backdrop-blur shadow-md opacity-70 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onTogglePin}
              className={`p-1.5 rounded hover:bg-white/[0.06] text-xs font-semibold flex items-center gap-1 ${
                isPinned ? "text-brand-accent" : "text-ui-muted hover:text-brand-bg"
              }`}
              title={isPinned ? "Unpin Presentation" : "Pin Presentation"}
            >
              {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              <span className="hidden sm:inline">{isPinned ? "Pinned" : "Pin"}</span>
            </button>
            <button
              onClick={handleFullscreen}
              className="p-1.5 rounded hover:bg-white/[0.06] text-ui-muted hover:text-brand-bg text-xs font-semibold flex items-center gap-1"
              title="Fullscreen"
            >
              <Maximize size={13} />
              <span className="hidden sm:inline">Fullscreen</span>
            </button>
            <button
              onClick={onToggleLayout}
              className="p-1.5 rounded hover:bg-white/[0.06] text-ui-muted hover:text-brand-bg text-xs font-semibold flex items-center gap-1"
              title="Return to Grid View"
            >
              <Grid size={13} />
              <span className="hidden sm:inline">Gallery</span>
            </button>
          </div>

          {/* Laser Pointer / Ripple / Annotations canvas overlay */}
          <PresentationOverlay
            isPresenter={isPresenter}
            socket={socket}
            roomId={roomId}
            activeScreenSharer={activeScreenSharer}
          />

          {/* Video Stream Element */}
          <VideoTile
            label={presenterLabel}
            stream={presentationStream}
            muted={isPresenter}
            cameraOff={false}
            isLocal={isPresenter}
            member={members.find(m => m.session_id === activeScreenSharer)}
            translationStatus=""
          />
        </div>

        {/* Small thumbnail strip of other participants */}
        <div className="flex gap-3 overflow-x-auto py-2 px-1 scroll-smooth meeting-scroll flex-shrink-0">
          {localStream && activeScreenSharer !== sessionId && (
            <div className="w-48 flex-shrink-0 aspect-video">
              <VideoTile
                label={`${localLabel} (you)`}
                stream={localStream}
                muted
                cameraOff={localCameraOff}
                isLocal
                member={members.find((item) => item.name === localLabel || item.username === localLabel)}
                translationStatus=""
              />
            </div>
          )}
          {remoteTiles
            .filter(tile => tile.peerId !== activeScreenSharer)
            .map(({ peerId, stream, label, member, translationStatus }) => (
              <div key={peerId} className="w-48 flex-shrink-0 aspect-video">
                <VideoTile
                  label={label}
                  stream={stream}
                  muted={muteRemoteAudio}
                  member={member}
                  translationStatus={translationStatus}
                />
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Normal Gallery Mode Layout
  const gridClass =
    tileCount <= 1
      ? "video-grid video-grid--single"
      : tileCount === 2
        ? "video-grid video-grid--pair"
        : "video-grid video-grid--group";

  return (
    <div className="space-y-3">
      {activeScreenSharer && meetingLayout === "gallery" && (
        <div className="flex items-center justify-between bg-brand-accent/15 border border-brand-accent/30 rounded-large px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-bg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-accent"></span>
            </span>
            <span>{presenterLabel} is screen sharing.</span>
          </div>
          <button
            onClick={onToggleLayout}
            className="bg-brand-accent hover:brightness-110 text-white text-[11px] font-bold px-3 py-1 rounded transition flex items-center gap-1"
          >
            <Monitor size={11} />
            Switch to Presentation Mode
          </button>
        </div>
      )}

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

