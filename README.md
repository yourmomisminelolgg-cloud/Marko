# ProPagandaAi — AI Clipping Studio

**Turn any YouTube video or podcast into viral shorts in one click.**  
Paste a YouTube link or upload an MP4 → AI finds the best hooks → auto-reframes to 9:16 + burns in Hormozi-style captions → export.

![ProPagandaAi](https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg)

Live demo: run locally or deploy to Vercel in 1 click. **No backend to host — works in your browser.**

---

## ✨ Features

- **YouTube → Clips**: Paste any YouTube URL. Fetches public captions via `youtube/timedtext` (no API key). Falls back to demo transcript.
- **Upload MP4/MOV/WEBM**: Drag & drop. Full local processing — video never leaves your device.
- **AI viral finder**:
  - **Heuristic mode (default, no key)** — scores hooks, questions, numbers, power-words, finds non-overlapping windows.
  - **Groq `llama-3.1-8b-instant` (FREE, recommended)** — 14k req/day free, instant.
  - **Gemini 1.5 Flash (FREE)** — aistudio.google.com
  - **OpenAI gpt-4o-mini** — optional
- **Smart reframe**: 9:16 / 1:1 / 16:9 auto-crop. Pan slider + FaceDetector auto-follow when available. Perfect for podcasts — keeps speaker centered.
- **Captions**: Burned into export via Canvas. Styles: **HORMOZI** (white+stroke), **BEAST** (yellow pop), **Minimal**, **Neon**.
- **Export**: One-click canvas capture → `WEBM` (VP9) with captions + reframing. Audio included via `captureStream` when browser allows.
- **Privacy**: API keys stored in `localStorage`, sent directly to Groq/Gemini/OpenAI — never to our server.

---

## 🚀 Quick Start

### Local (recommended for YouTube downloads)

```bash
git clone <this-repo>
cd Marko
npm install
npm run dev
# open http://localhost:3000
```

- Paste a YouTube link → **Fetch Captions** → **Generate Clips** → preview & export.
- For full MP4 export of YouTube videos, install `yt-dlp` locally and drag the file:

```bash
pip install yt-dlp
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" "https://www.youtube.com/watch?v=VIDEO_ID" -o video.mp4
# then drag video.mp4 into ProPagandaAi
```

### Deploy to Vercel (1 click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourmomisminelolgg-cloud/Marko)

- Framework: **Next.js** — auto-detected.
- No env vars needed (users bring their own free Groq/Gemini key in the UI).
- Build command: `npm run build` — output `.next`

### Deploy to GitHub Pages / Other

```bash
npm run build
npm start
# or `vercel --prod`
```

---

## 🔑 Free AI Keys (optional but smarter clips)

App works **without any key** (heuristic).

For LLM-powered picking:

1. **Groq (fastest, free)** → https://console.groq.com → API Keys → Create → `gsk_...` → paste in UI, provider = Groq, model = `llama-3.1-8b-instant`
2. **Gemini** → https://aistudio.google.com/app/apikey → `AIza...` → provider = Gemini, model = `gemini-1.5-flash`
3. **OpenAI** → https://platform.openai.com/api-keys → `sk-...`

> Keys are saved to your browser only. Transcripts are truncated to ~12k chars for LLC.

### Transcription for uploads

- YouTube: automatic via captions API.
- Upload: needs Groq Whisper. Add Groq key → **Transcribe via Groq Whisper** (uses `whisper-large-v3`). Or click **Demo transcript** to test clipping without transcription.

---

## 🎬 How to Use

1. Choose **YouTube URL** or **Upload MP4**.
2. **Fetch Captions** (or Demo transcript).
3. Tune **Clip count / length / aspect / captions / reframe** in left panel.
4. Pick AI provider (or keep heuristic).
5. **Generate Viral Clips** → list appears on right.
6. Click a clip to preview (loops that region, shows burnt-in captions).
7. **Export Active Clip** — downloads `propaganda-HOOK-TIMESTAMP.webm`.

Pro tips:
- Podcast reframe: set 9:16, enable Smart reframe, drag pan slider to center speaker. For auto, keep “Auto-follow” on — Chrome will use `FaceDetector` if available.
- Caption style: Hormozi = white bold + 35% stroke, best for retention. Beast = yellow for MrBeast energy.
- If YouTube shows “No captions”, the owner disabled them — upload the mp4 instead.

---

## 🧩 Tech Stack

- **Next.js 14** (App Router) + **Tailwind** + **lucide-react**
- APIs:
  - `GET /api/youtube?id=...` — oEmbed + thumbnail
  - `GET /api/transcript?id=...` — tries `youtube/api/timedtext` XML + json3
  - `POST /api/transcript` — Groq Whisper proxy for uploads
  - `POST /api/analyze` — heuristic or LLM (Groq/Gemini/OpenAI) → non-overlapping clips
- Client: Canvas + `captureStream` + `MediaRecorder` for export. No ffmpeg needed (works offline). For true MP4, pipe webm through ffmpeg locally.

---

## 📦 Project Structure

```
app/
  page.tsx            # Main studio UI (upload, yt, settings, preview, clips)
  layout.tsx
  globals.css
  api/transcript/route.ts
  api/analyze/route.ts
  api/youtube/route.ts
lib/utils.ts
public/
```

---

## 🔧 Environment

No required env vars. Optional you can set defaults via `.env.local`:

```env
NEXT_PUBLIC_DEFAULT_PROVIDER=groq
```

---

## 📄 License

MIT — use freely, star if you like it!

Built with ♥ for creators who need clips yesterday.
