# Cross-Device Video and Translation Testing

## 1. Find the host laptop IP

In PowerShell:

```powershell
ipconfig
```

Use the IPv4 address for the Wi-Fi adapter, for example `192.168.1.25`.

## 2. Generate local HTTPS certificates

From the project root:

```powershell
.\scripts\generate-local-certs.ps1 -LanIp 192.168.1.25
```

The script creates:

```text
certs/translation-bot.key
certs/translation-bot.crt
```

Browsers will show a warning because this is self-signed. For local testing,
open the URL and choose the advanced/continue option. On phones, you may need
to install/trust the certificate manually for full camera/microphone support.

## 3. Start dependencies

```powershell
docker compose up -d mongodb libretranslate
```

## 4. Start backend over HTTPS

```powershell
.\scripts\run-backend-https.ps1
```

Backend:

```text
https://192.168.1.25:8000
```

## 5. Start frontend over HTTPS

Open a second terminal:

```powershell
.\scripts\run-frontend-https.ps1
```

Frontend:

```text
https://192.168.1.25:5173
```

## 6. Browser tests

### Laptop to phone

1. Laptop browser: open `https://localhost:5173`.
2. Phone browser on the same Wi-Fi: open `https://192.168.1.25:5173`.
3. Accept the certificate warning.
4. Log in as two different users.
5. Join the same room.
6. Host clicks `Join Video Call`.
7. Participant clicks `Join Video Call`.
8. Allow camera and microphone permissions on both devices.
9. Check the Diagnostics panel for:
   - WebSocket: connected
   - Local audio/video: on/live
   - Remote streams: 1 or more
   - ICE state: connected/completed
   - Peer state: connected

### Laptop to laptop

Repeat the same steps with two laptops on the same Wi-Fi. Use the host laptop's
LAN IP on the second laptop.

### Phone to phone

Use one computer as the backend/frontend host. Open the LAN HTTPS URL on both
phones and join as different users.

## Failure scenarios to test

- Deny microphone permission: the UI should show a permission error.
- Deny camera permission: video call should fail cleanly.
- Turn Wi-Fi off on one device: WebSocket should reconnect after network returns.
- Refresh one participant during a call: the host should send a fresh offer when
  the participant rejoins.
- Start translated speech while in video call: chat/video should remain usable.

## Common blockers

- Self-signed certificate not trusted on phone.
- Phone and laptop are not on the same Wi-Fi network.
- Windows firewall blocks port `5173` or `8000`.
- Router blocks device-to-device traffic.
- WebRTC needs TURN for restrictive NATs; Google STUN is not enough on every network.

## Multi-Participant Video Recommendation

### Option A: Pure Mesh WebRTC

Pros:
- Fits the current architecture.
- Fastest to implement.
- No media server cost.
- Existing WebSocket signaling can support it.

Cons:
- Every participant sends video to every other participant.
- Upload bandwidth grows quickly.
- CPU load grows quickly.

Scaling limit:
- Practical for 2-4 users on good devices/networks.
- Starts hurting around 5+ video participants.

Implementation effort:
- Low to medium.

### Option B: SFU Architecture

Pros:
- Best architecture for a Google Meet-style product.
- Each user uploads one stream to the SFU.
- SFU forwards streams to others.
- Scales much better than mesh.

Cons:
- Requires a media server such as mediasoup, LiveKit, Janus, or Pion.
- More deployment complexity.
- More backend/media orchestration.

Scaling limit:
- Dozens of users depending on server capacity and video quality.

Implementation effort:
- High.

### Option C: Jitsi Integration

Pros:
- Fastest way to get robust production video meetings.
- Built-in SFU, screen sharing, device handling, and many call controls.
- Good cross-device behavior.

Cons:
- Less control over custom translation/audio pipeline.
- Integration can become awkward if translated audio must be deeply synchronized.
- Product identity may feel partly like embedded Jitsi.

Scaling limit:
- Strong, depending on Jitsi deployment.

Implementation effort:
- Medium.

## Recommendation

Keep the current mesh WebRTC implementation for the next prototype milestone,
but design all new call state around an eventual SFU. For the real product,
move to an SFU before serious multi-user video work. Jitsi is useful for a demo
or fallback, but a custom SFU path gives better control for real-time translated
speech.
