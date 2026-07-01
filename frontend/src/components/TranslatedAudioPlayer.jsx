import { useEffect, useRef, useState } from "react";

export default function TranslatedAudioPlayer({
  audioItems,
  enabled,
  onPlaybackStateChange,
}) {
  const playedIdsRef = useRef(new Set());
  const queueRef = useRef([]);
  const playingRef = useRef(false);
  const currentAudioRef = useRef(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!enabled) {
      queueRef.current = [];
      playingRef.current = false;
      currentAudioRef.current?.pause();
      currentAudioRef.current = null;
      audioItems.forEach((item) => playedIdsRef.current.add(item.id));
      setStatus("");
      return;
    }

    const nextItems = audioItems
      .filter((item) => !playedIdsRef.current.has(item.id))
      .sort((a, b) => a.sequence - b.sequence);

    nextItems.forEach((item) => {
      playedIdsRef.current.add(item.id);
      queueRef.current.push(item);
    });

    const playNext = async () => {
      if (playingRef.current || queueRef.current.length === 0) return;
      const item = queueRef.current.shift();
      playingRef.current = true;
      setStatus(`Playing ${item.sender} (${item.target_language})`);
      onPlaybackStateChange?.(item, true);

      const audio = new Audio(`data:${item.mime_type};base64,${item.audio_base64}`);
      currentAudioRef.current = audio;
      audio.onended = () => {
        playingRef.current = false;
        currentAudioRef.current = null;
        setStatus("");
        onPlaybackStateChange?.(item, false);
        playNext();
      };
      audio.onerror = () => {
        playingRef.current = false;
        currentAudioRef.current = null;
        setStatus("Translated audio playback failed.");
        onPlaybackStateChange?.(item, false);
        playNext();
      };

      try {
        await audio.play();
      } catch {
        playingRef.current = false;
        currentAudioRef.current = null;
        onPlaybackStateChange?.(item, false);
        setStatus("Click in the page once to allow translated audio playback.");
      }
    };

    playNext();
  }, [audioItems, enabled, onPlaybackStateChange]);

  if (!enabled || !status) return null;

  return <p className="mt-2 text-xs text-brand-bg/50">{status}</p>;
}
