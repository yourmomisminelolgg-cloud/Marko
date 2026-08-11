import { NextRequest, NextResponse } from "next/server";

// Fetch YouTube timedtext captions (public, no key). Tries multiple langs.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const langs = ["en","en-US","en-GB","auto"];
  for (const lang of langs) {
    try {
      // list available tracks first via innertube? fallback try direct timedtext
      const urls = [
        `https://www.youtube.com/api/timedtext?lang=${lang}&v=${id}`,
        `https://www.youtube.com/api/timedtext?lang=${lang}&v=${id}&fmt=json3`,
      ];
      for (const url of urls) {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const text = await res.text();
        if (!text || text.includes("<transcript>") === false && text.length < 50) continue;
        // parse XML or json3
        if (text.trim().startsWith("{")) {
          const j = JSON.parse(text);
          const events = j.events?.filter((e:any)=>e.segs).map((e:any)=> ({
            text: e.segs.map((s:any)=>s.utf8).join("").trim(),
            start: e.tStartMs/1000,
            dur: e.dDurationMs ? e.dDurationMs/1000 : 1.5,
          })).filter((e:any)=>e.text);
          if (events?.length) return NextResponse.json({ source:"youtube", lang, segments: events });
        } else {
          // XML parse <text start="..." dur="...">...</text>
          const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
          const segs: any[] = [];
          let m;
          while ((m = regex.exec(text)) !== null) {
            const decoded = m[3].replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
            if (decoded.trim()) segs.push({ text: decoded.trim(), start: parseFloat(m[1]), dur: parseFloat(m[2]) });
          }
          if (segs.length) return NextResponse.json({ source:"youtube", lang, segments: segs });
        }
      }
    } catch {}
  }
  // no captions found
  return NextResponse.json({ source:"none", segments: [], error: "No captions found. Try uploading the video file and use AI transcription (Groq Whisper)." }, { status: 200 });
}

export async function POST(req: NextRequest) {
  // proxy transcription via Groq Whisper if user provides key + audio
  // expects multipart form with file and apiKey, provider
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const apiKey = form.get("apiKey") as string | null;
    const provider = (form.get("provider") as string) || "groq";
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "API key required for upload transcription" }, { status: 400 });

    if (provider === "groq") {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("model", "whisper-large-v3");
      fd.append("response_format", "verbose_json");
      fd.append("timestamp_granularities[]", "segment");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd as any,
      });
      const j = await r.json();
      if (!r.ok) return NextResponse.json({ error: j.error?.message || "groq failed", raw: j }, { status: 500 });
      const segments = (j.segments || []).map((s:any)=>({ text: s.text.trim(), start: s.start, dur: s.end - s.start }));
      return NextResponse.json({ source:"groq", segments, text: j.text });
    }
    return NextResponse.json({ error: "unsupported provider" }, { status: 400 });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
