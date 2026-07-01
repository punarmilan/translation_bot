# Troubleshooting

## Camera Not Detected

Check:

- Browser has camera permission.
- Page is served over HTTPS for cross-device testing.
- No other application is using the camera.
- The browser supports `navigator.mediaDevices.getUserMedia`.

Fix:

```powershell
.\scripts\run-frontend-https.ps1
.\scripts\run-backend-https.ps1
```

Then open the HTTPS URL and allow camera access.

## Microphone Permission Blocked

Chrome and Edge often block microphone access on LAN HTTP pages. Use HTTPS and reset permissions:

1. Open site settings from the browser address bar.
2. Set microphone to Allow.
3. Refresh the page.
4. Rejoin the room.

## ICE Connection Fails

Symptoms:

- connected peers stays at 0
- local video appears but remote video does not
- diagnostics shows `failed` or `disconnected`

Likely causes:

- devices are on different networks
- firewall blocks peer traffic
- no TURN server is configured
- one browser denied media permission

Fix:

- test both devices on the same Wi-Fi
- use HTTPS
- check diagnostics for ICE candidates
- add a TURN server before production demos outside local Wi-Fi

## WebSocket Disconnects

Check:

- backend is running on port 8000
- frontend is using the correct host
- browser console has no JavaScript crash
- device can reach backend URL from the browser

If testing from a second device, use the laptop IP address instead of `localhost`.

## User Joins Then Immediately Leaves

Common causes:

- frontend cannot keep the WebSocket open
- page JavaScript crashed after join
- token is missing or expired
- backend closed the socket because message shape was invalid

Open browser devtools on the second device and check Console and Network tabs.

## Translation Is Wrong

Possible causes:

- source language detection guessed incorrectly
- sentence was cut too early
- LibreTranslate quality is weak for that language pair
- mixed-language input confused the detector

Improvements planned:

- voice activity detection
- sentence buffering
- larger Whisper model option
- custom translation model support

## STT Is Slow or Stuck

Check:

- Faster-Whisper model downloaded successfully
- CPU is not overloaded
- `WHISPER_MODEL=tiny` for local testing
- Hugging Face token is configured if model download is rate-limited

Tiny is fast for demos. Base or small is more accurate but slower on CPU.

## TTS Fails

Check:

- `PIPER_EXECUTABLE` points to `piper.exe`
- Piper voice model exists in `backend/models/piper`
- model `.onnx` and `.onnx.json` are both present
- selected language has a configured voice

The voice test page shows the requested voice, selected voice model, fallback state, and latency.

## Audio Playback Does Not Start

Browsers may block autoplay. Click the play button once after translated audio appears. Future versions can add explicit listener preferences for automatic playback.
