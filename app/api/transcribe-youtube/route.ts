import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import ytdl from "@distube/ytdl-core";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel pro has 60s, hobby 10s but we try

function getId(url: string){
  try{
    const u = new URL(url);
    if(u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if(u.searchParams.get("v")) return u.searchParams.get("v")!;
    const m = u.pathname.match(/\/embed\/([^\/]+)/); if(m) return m[1];
    const m2 = u.pathname.match(/\/shorts\/([^\/]+)/); if(m2) return m2[1];
  }catch{}
  return url; // assume id
}

export async function POST(req: NextRequest){
  try{
    const { url, apiKey, provider="groq" } = await req.json();
    if(!url) return NextResponse.json({ error:"missing url"},{status:400});
    if(!apiKey) return NextResponse.json({ error:"Groq API key required for auto-transcribe (free at console.groq.com). Paste it in the UI."},{status:400});
    const id = getId(url);
    if(!id) return NextResponse.json({ error:"invalid youtube url"},{status:400});

    // Try ytdl-core first
    let audioUrl: string | null = null;
    let title = id;
    try{
      const info = await ytdl.getInfo(id);
      title = info.videoDetails.title;
      const fmt = ytdl.chooseFormat(info.formats, { quality:"highestaudio", filter:"audioonly" });
      audioUrl = fmt?.url || null;
    }catch(e:any){
      // fallback to Piped API
      try{
        const pr = await fetch(`https://pipedapi.kavin.rocks/streams/${id}`, { headers:{ "User-Agent":"Mozilla/5.0"} });
        const pj = await pr.json();
        if(pj.audioStreams?.[0]?.url) audioUrl = pj.audioStreams[0].url;
        if(pj.title) title = pj.title;
      }catch{}
      if(!audioUrl) throw new Error("Could not get audio stream (ytdl + piped failed). Try downloading via cobalt.tools and upload.");
    }

    if(!audioUrl) return NextResponse.json({ error:"Could not resolve audio URL. Try Upload mode."},{status:500});

    // Fetch audio - limit to ~25MB (Groq limit) -> for long videos we fetch first 20MB (~5-6 min at 64kbps, but we need full)
    // We'll fetch full but abort if >25MB
    const audioRes = await fetch(audioUrl, { headers:{ "User-Agent":"Mozilla/5.0"} });
    if(!audioRes.ok || !audioRes.body) return NextResponse.json({ error:"Failed to fetch audio"},{status:500});
    const ab = await audioRes.arrayBuffer();
    // Groq whisper limit 25 MB - if larger, we truncate (or split). For demo we truncate to 25MB which is ~10-12 min of audio at 128kbps
    let buf = Buffer.from(ab);
    if(buf.length > 25*1024*1024){
      buf = buf.slice(0, 25*1024*1024);
    }
    const blob = new Blob([buf], { type: "audio/mp3" });

    // Send to Groq whisper
    const fd = new FormData();
    fd.append("file", blob, `${id}.mp3`);
    fd.append("model", "whisper-large-v3");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "segment");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{
      method:"POST",
      headers:{ Authorization:`Bearer ${apiKey}`},
      body: fd as any
    });
    const j = await groqRes.json();
    if(!groqRes.ok){
      return NextResponse.json({ error: j.error?.message || "Groq transcribe failed", raw:j }, {status:500});
    }
    const segments = (j.segments || []).map((s:any)=>({ text: s.text.trim(), start: s.start, dur: s.end - s.start }));
    return NextResponse.json({ source:"groq-youtube", title, segments, text: j.text, duration: segments.length? segments[segments.length-1].start + segments[segments.length-1].dur : 0 });
  }catch(e:any){
    return NextResponse.json({ error: e.message || "unknown error"},{status:500});
  }
}
