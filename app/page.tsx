"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { getYoutubeId, formatTime, cn } from "@/lib/utils";
import { Sparkles, Youtube, Upload, Wand2, Captions, Crop, Play, Download, Settings2, KeyRound, Loader2, Film, Eye, Scissors, MonitorSmartphone, Type, Zap, AlertCircle, Check, ExternalLink, Github } from "lucide-react";

type Segment = { text: string; start: number; dur: number };
type Clip = { start: number; end: number; score: number; hook: string; reason: string };

const CAPTION_STYLES = [
  { id:"hormozi", label:"HORMOZI", desc:"Bold white + heavy stroke", preview:"bg-black text-white font-black" },
  { id:"beast", label:"BEAST", desc:"Yellow pop + black outline", preview:"bg-yellow-400 text-black font-black" },
  { id:"minimal", label:"Minimal", desc:"White with shadow", preview:"bg-zinc-900 text-white" },
  { id:"neon", label:"Neon", desc:"Cyan glow", preview:"bg-black text-cyan-400 font-bold" },
] as const;

export default function Page(){
  const [inputMode, setInputMode] = useState<"youtube"|"upload">("youtube");
  const [ytUrl, setYtUrl] = useState("");
  const [ytId, setYtId] = useState<string|null>(null);
  const [ytMeta, setYtMeta] = useState<any>(null);
  const [file, setFile] = useState<File|null>(null);
  const [videoSrc, setVideoSrc] = useState<string|null>(null);
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [provider, setProvider] = useState<"heuristic"|"groq"|"gemini"|"openai">("heuristic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [clipCount, setClipCount] = useState(3);
  const [clipLen, setClipLen] = useState(30);
  const [aspect, setAspect] = useState<"9:16"|"1:1"|"16:9">("9:16");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<typeof CAPTION_STYLES[number]["id"]>("hormozi");
  const [reframeOn, setReframeOn] = useState(true);
  const [autoReframe, setAutoReframe] = useState(true);
  const [reframeX, setReframeX] = useState(50); // 0-100
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeClip, setActiveClip] = useState<number>(0);
  const [isPlayingClip, setIsPlayingClip] = useState(false);
  const [exporting, setExporting] = useState<number|null>(null);
  const [showApiHelp, setShowApiHelp] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const id=getYoutubeId(ytUrl);
    setYtId(id);
    if(id){
      fetch(`/api/youtube?id=${id}`).then(r=>r.json()).then(setYtMeta).catch(()=>{});
    } else setYtMeta(null);
  },[ytUrl]);

  useEffect(()=>{
    if(file){
      const url=URL.createObjectURL(file);
      setVideoSrc(url);
      return ()=>URL.revokeObjectURL(url);
    } else if(ytId){
      setVideoSrc(null);
    } else setVideoSrc(null);
  },[file, ytId]);

  // load saved key
  useEffect(()=>{
    const k=localStorage.getItem("ppg_apiKey"); if(k) setApiKey(k);
    const p=localStorage.getItem("ppg_provider") as any; if(p) setProvider(p);
  },[]);
  useEffect(()=>{ if(apiKey) localStorage.setItem("ppg_apiKey", apiKey); },[apiKey]);
  useEffect(()=>{ localStorage.setItem("ppg_provider", provider); },[provider]);

  const fetchTranscript = async()=>{
    if(ytId){
      setTranscriptLoading(true);
      try{
        const r=await fetch(`/api/transcript?id=${ytId}`);
        const j=await r.json();
        if(j.segments?.length){
          setSegments(j.segments);
          // estimate duration from last segment
          const last=j.segments[j.segments.length-1];
          setDuration(Math.ceil(last.start+last.dur+5));
        } else {
          setSegments([]);
          alert("No captions found for this YouTube video (owner disabled captions). Try uploading the video file + use Groq whisper (free) for transcription, or click 'Demo transcript' to test.");
        }
      }catch(e:any){ alert(e.message) }
      setTranscriptLoading(false);
    } else if(file && apiKey && provider!=="heuristic"){
      setTranscriptLoading(true);
      try{
        const fd=new FormData();
        fd.append("file", file);
        fd.append("apiKey", apiKey);
        fd.append("provider", provider);
        const r=await fetch("/api/transcript",{method:"POST", body:fd});
        const j=await r.json();
        if(j.segments?.length){ setSegments(j.segments); } else alert("Transcription failed: "+(j.error||"unknown"));
      }catch(e:any){alert(e.message)}
      setTranscriptLoading(false);
    } else if(file){
      alert("For uploaded files, add a free Groq API key (groq.com) to auto-transcribe, or use 'Demo Transcript' to test clipping without it.");
    }
  };

  const useDemoTranscript = ()=>{
    // generate mock transcript for demo
    const dur = duration || 300;
    const topics = ["The secret nobody tells you about growth","Why most podcasts fail","How I made my first million","The one habit that changed everything","Stop doing this if you want to go viral","AI is replacing your job but here's how to win"];
    const segs:Segment[]=[];
    let t=0; let idx=0;
    while(t<dur-2){
      const txt = idx%4===0 ? topics[idx%topics.length] + " — you need to hear this." : idx%5===0 ? "Wait, what if everything you know is wrong? Let me explain." : idx%3===0 ? "And that's when it hit me — the most insane thing happened." : `This is sentence ${idx+1} of the podcast talking about mindset, growth and virality.`;
      const d = 2 + Math.random()*2.5;
      segs.push({text: txt, start: t, dur: d});
      t+=d+0.2; idx++;
    }
    setSegments(segs);
    if(!duration) setDuration(dur);
  };

  const analyze = async()=>{
    if(!segments.length){ alert("Need transcript first. Click 'Fetch Captions' or 'Demo transcript'"); return; }
    setAnalyzing(true);
    try{
      const r=await fetch("/api/analyze",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ segments, duration: duration||180, count: clipCount, targetLen: clipLen, provider, apiKey, model, prompt: customPrompt })});
      const j=await r.json();
      setClips(j.clips||[]);
      setActiveClip(0);
    }catch(e:any){ alert(e.message)}
    setAnalyzing(false);
  };

  // file drop
  const onDrop = (e: React.DragEvent)=>{
    e.preventDefault(); setDragOver(false);
    const f=e.dataTransfer.files?.[0];
    if(f && f.type.startsWith("video/")){ setFile(f); setInputMode("upload"); }
  };

  // preview clip playback + canvas render loop
  useEffect(()=>{
    if(!videoRef.current || !previewCanvasRef.current) return;
    const v=videoRef.current, c=previewCanvasRef.current, ctx=c.getContext("2d");
    if(!ctx) return;
    let raf:number;
    const draw=()=>{
      if(!v || v.paused || v.ended){ raf=requestAnimationFrame(draw); return; }
      const clip=clips[activeClip];
      // canvas size based on aspect
      const W=c.width, H=c.height;
      ctx.clearRect(0,0,W,H);
      ctx.drawImage(v, 0,0,W,H); // placeholder, will do crop
      // actually do cropped draw for reframe
      if(reframeOn){
        // compute source crop
        const vw=v.videoWidth||1280, vh=v.videoHeight||720;
        let cw, ch, sx, sy;
        if(aspect==="9:16"){ cw=vh*9/16; ch=vh; } else if(aspect==="1:1"){ cw=ch=Math.min(vw,vh); } else { cw=vw; ch=vh; }
        // keep cw within vw
        cw=Math.min(cw, vw); ch=Math.min(ch, vh);
        // sx based on reframeX (0 left, 50 center, 100 right)
        sx= ((vw - cw) * (reframeX/100));
        sy= (vh - ch)/2;
        // draw cropped
        // need to map to canvas aspect: canvas already set to target aspect so draw directly
        ctx.clearRect(0,0,W,H);
        // use 9:16 canvas 1080x1920 mapping
        ctx.drawImage(v, sx,sy,cw,ch, 0,0,W,H);
      } else {
        ctx.drawImage(v, 0,0,W,H);
      }
      // captions
      if(captionsOn && clip){
        const t=v.currentTime;
        const seg=segments.find(s=> t>=s.start && t < s.start+s.dur);
        if(seg){
          const text=seg.text.toUpperCase();
          // wrap
          const maxWidth=W*0.88; const fontSize= aspect==="9:16"? Math.round(W*0.075) : Math.round(W*0.05);
          ctx.font=`900 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign="center"; ctx.textBaseline="middle";
          const words=text.split(" "); let lines:string[]=[]; let cur="";
          for(const w of words){ const test=cur?cur+" "+w:w; if(ctx.measureText(test).width>maxWidth && cur){ lines.push(cur); cur=w; } else cur=test; } if(cur) lines.push(cur);
          if(lines.length>3) lines=lines.slice(0,3);
          const lineH=fontSize*1.15;
          const totalH=lines.length*lineH;
          const y=H*0.78 - totalH/2;
          // background pill?
          lines.forEach((line, i)=>{
            const ly=y+i*lineH;
            ctx.lineWidth=fontSize*0.35;
            ctx.strokeStyle="black"; ctx.lineJoin="round"; ctx.miterLimit=2;
            ctx.strokeText(line, W/2, ly);
            if(captionStyle==="beast"){ ctx.fillStyle="#facc15"; }
            else if(captionStyle==="neon"){ ctx.fillStyle="#22d3ee"; ctx.shadowColor="#22d3ee"; ctx.shadowBlur=12; }
            else if(captionStyle==="minimal"){ ctx.fillStyle="white"; ctx.shadowColor="rgba(0,0,0,0.6)"; ctx.shadowBlur=4; }
            else ctx.fillStyle="white";
            ctx.fillText(line, W/2, ly);
            ctx.shadowBlur=0;
          });
        }
      }
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(raf);
  },[clips, activeClip, reframeOn, reframeX, aspect, captionsOn, captionStyle, segments]);

  // sync video to clip start when active changes
  useEffect(()=>{
    if(videoRef.current && clips[activeClip]){
      videoRef.current.currentTime=clips[activeClip].start+0.1;
      if(isPlayingClip) videoRef.current.play().catch(()=>{});
    }
  },[activeClip]);

  // auto loop clip region
  useEffect(()=>{
    const v=videoRef.current; if(!v || !clips[activeClip]) return;
    const onTime=()=>{
      const c=clips[activeClip];
      if(v.currentTime>=c.end-0.05){ v.currentTime=c.start+0.05; v.play().catch(()=>{}); }
    };
    v.addEventListener("timeupdate", onTime); return ()=>v.removeEventListener("timeupdate", onTime);
  },[clips, activeClip, isPlayingClip]);

  // canvas dimensions for export
  const canvasSize = useMemo(()=>{
    if(aspect==="9:16") return {w:1080,h:1920};
    if(aspect==="1:1") return {w:1080,h:1080};
    return {w:1920,h:1080};
  },[aspect]);

  const handleExport = async(idx:number)=>{
    const clip=clips[idx]; if(!clip || !videoRef.current) return;
    if(!file){ alert("Export works fully for uploaded video files (browser records canvas). For YouTube, upload the same mp4 to enable one-click MP4 export. For now we’ll export a preview recording of the in-browser playback."); }
    setExporting(idx);
    try{
      const v=videoRef.current;
      const canvas=document.createElement("canvas");
      canvas.width=canvasSize.w; canvas.height=canvasSize.h;
      const ctx=canvas.getContext("2d")!;
      v.currentTime=clip.start;
      await v.play().catch(()=>{});
      const stream = canvas.captureStream(30);
      // Try to capture audio if possible
      let combined: MediaStream = stream;
      try{
        // @ts-ignore
        const audioStream = (v as any).captureStream?.() || (v as any).mozCaptureStream?.();
        if(audioStream?.getAudioTracks().length){
          combined=new MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()]);
        }
      }catch{}

      const recorder=new MediaRecorder(combined, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")?"video/webm;codecs=vp9":"video/webm" });
      const chunks:BlobPart[]=[];
      recorder.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
      const done=new Promise<Blob>(res=> recorder.onstop=()=>res(new Blob(chunks,{type:"video/webm"})));
      recorder.start(100);
      // render loop for duration
      const fps=30;
      const need = (clip.end-clip.start)*1000;
      const startTime=performance.now();
      const drawFrame=()=>{
        if(recorder.state==="inactive") return;
        // crop logic same as preview
        const vw=v.videoWidth||1280, vh=v.videoHeight||720;
        let cw, ch, sx, sy;
        if(aspect==="9:16"){ cw=vh*9/16; ch=vh; } else if(aspect==="1:1"){ cw=ch=Math.min(vw,vh); } else { cw=vw; ch=vh; }
        cw=Math.min(cw,vw); ch=Math.min(ch,vh);
        sx=((vw-cw)*(reframeX/100)); sy=(vh-ch)/2;
        if(reframeOn) ctx.drawImage(v, sx,sy,cw,ch, 0,0,canvas.width, canvas.height);
        else ctx.drawImage(v, 0,0,canvas.width, canvas.height);
        if(captionsOn){
          const t=v.currentTime;
          const seg=segments.find(s=> t>=s.start && t < s.start+s.dur);
          if(seg){
            const text=seg.text.toUpperCase();
            const W=canvas.width, H=canvas.height;
            const fontSize= aspect==="9:16"? Math.round(W*0.065) : Math.round(W*0.045);
            ctx.font=`900 ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign="center"; ctx.textBaseline="middle";
            const maxWidth=W*0.88; const words=text.split(" "); let lines:string[]=[]; let cur="";
            for(const w of words){ const test=cur?cur+" "+w:w; if(ctx.measureText(test).width>maxWidth && cur){ lines.push(cur); cur=w; } else cur=test; } if(cur) lines.push(cur);
            if(lines.length>3) lines=lines.slice(0,3);
            const lineH=fontSize*1.15, totalH=lines.length*lineH, y=H*0.78 - totalH/2;
            lines.forEach((line,i)=>{
              const ly=y+i*lineH;
              ctx.lineWidth=fontSize*0.35; ctx.strokeStyle="black"; ctx.lineJoin="round";
              ctx.strokeText(line, W/2, ly);
              ctx.fillStyle= captionStyle==="beast"?"#facc15": captionStyle==="neon"?"#22d3ee":"white";
              if(captionStyle==="neon"){ ctx.shadowColor="#22d3ee"; ctx.shadowBlur=18; }
              ctx.fillText(line, W/2, ly);
              ctx.shadowBlur=0;
            });
          }
        }
        if(performance.now()-startTime < need+400) requestAnimationFrame(drawFrame);
        else { recorder.stop(); v.pause(); }
      };
      requestAnimationFrame(drawFrame);
      // safety timeout
      setTimeout(()=>{ if(recorder.state==="recording") recorder.stop(); }, need+3000);
      const blob=await done;
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url; a.download=`propaganda-${clip.hook.replace(/[^a-z0-9]/gi,"-").slice(0,30)}-${formatTime(clip.start).replace(":","-")}.webm`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
    }catch(e:any){ alert("Export failed: "+e.message) }
    setExporting(null);
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-zinc-100">
      {/* HEADER */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-[1280px] mx-auto px-4 md:px-6 h-[64px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-black text-white">P</div>
            <div>
              <div className="font-black tracking-tight leading-none text-[18px]">ProPaganda<span className="gradient-text">Ai</span></div>
              <div className="text-[11px] tracking-widest text-zinc-500 -mt-1">AI CLIPPING STUDIO</div>
            </div>
            <span className="hidden md:inline-flex ml-3 px-2 py-1 rounded-full bg-violet-600/20 border border-violet-500/30 text-[11px] font-bold text-violet-300">BETA • FREE</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://github.com" target="_blank" className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-full glass text-sm"> <Github className="w-4 h-4"/> Star on GitHub </a>
            <button onClick={()=>document.getElementById("how")?.scrollIntoView({behavior:"smooth"})} className="px-4 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-zinc-100">How it works</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 pt-8 pb-6">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          {/* LEFT: Input */}
          <div className="glass rounded-[24px] p-5 md:p-7">
            <div className="flex items-center gap-2 text-violet-300 text-xs font-bold tracking-widest mb-2"><Sparkles className="w-4 h-4"/> TURN LONG VIDEO → VIRAL SHORTS</div>
            <h1 className="text-[30px] md:text-[40px] font-black leading-[0.95] tracking-tight">Clip the best parts<br/> <span className="gradient-text">add captions & reframe</span><br/> in one click.</h1>
            <p className="text-zinc-400 mt-3 text-[15px] leading-relaxed">Paste a YouTube link or upload an mp4. AI finds hooks, adds <b className="text-zinc-200">HORMOZI-style captions</b> and auto-reframes to 9:16 for TikTok / Reels / Shorts. Runs <b className="text-zinc-200">100% in your browser</b> — free API keys optional.</p>

            <div className="flex gap-2 mt-5">
              <button onClick={()=>setInputMode("youtube")} className={cn("flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border", inputMode==="youtube"?"bg-white text-black border-white":"glass text-zinc-300")}> <Youtube className="w-5 h-5"/> YouTube URL</button>
              <button onClick={()=>setInputMode("upload")} className={cn("flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border", inputMode==="upload"?"bg-white text-black border-white":"glass text-zinc-300")}> <Upload className="w-5 h-5"/> Upload MP4</button>
            </div>

            {inputMode==="youtube" ? (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input value={ytUrl} onChange={e=>setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 pr-28 text-[15px] placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50"/>
                  <button onClick={fetchTranscript} disabled={!ytId || transcriptLoading} className="absolute right-2 top-2 bottom-2 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-bold text-sm flex items-center gap-2"> {transcriptLoading?<Loader2 className="w-4 h-4 animate-spin"/>:<Wand2 className="w-4 h-4"/>} Fetch Captions</button>
                </div>
                {ytId && ytMeta && (
                  <div className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                    <img src={ytMeta.thumbnail} alt="" className="w-32 aspect-video object-cover rounded-lg bg-black"/>
                    <div className="min-w-0">
                      <div className="font-bold leading-tight line-clamp-2 text-sm">{ytMeta.title}</div>
                      <div className="text-xs text-zinc-400">{ytMeta.author}</div>
                      <a href={ytUrl} target="_blank" className="text-xs text-violet-400 inline-flex items-center gap-1 mt-1">Open on YouTube <ExternalLink className="w-3 h-3"/></a>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={useDemoTranscript} className="text-xs px-3 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">✨ Use demo transcript (test without captions)</button>
                  <span className="text-xs text-zinc-500 py-2">or enable captions on YouTube & retry</span>
                </div>
              </div>
            ) : (
              <div onDragOver={e=>{e.preventDefault(); setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} className={cn("mt-4 rounded-xl border-2 border-dashed p-6 text-center", dragOver?"border-violet-500 bg-violet-500/10":"border-white/10 bg-black/20")}>
                <div className="w-12 h-12 rounded-xl bg-white/5 grid place-items-center mx-auto"><Film className="w-6 h-6 text-zinc-400"/></div>
                <div className="font-bold mt-3">Drop video here or click to browse</div>
                <div className="text-sm text-zinc-500">MP4, MOV, WEBM — up to 2GB. We process locally, no upload to server.</div>
                <label className="inline-flex mt-4 px-5 py-2.5 rounded-full bg-white text-black font-bold cursor-pointer hover:bg-zinc-100">
                  <input type="file" accept="video/*" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)}/>
                  <Upload className="w-4 h-4 mr-2"/> Choose file
                </label>
                {file && <div className="mt-3 text-sm text-emerald-400 flex items-center justify-center gap-2"><Check className="w-4 h-4"/> {file.name} — {(file.size/1024/1024).toFixed(1)} MB</div>}
                <div className="mt-4 flex gap-2 justify-center">
                  <button onClick={fetchTranscript} className="px-4 py-2 rounded-full bg-violet-600 text-white font-bold text-sm">Transcribe via Groq Whisper (free)</button>
                  <button onClick={useDemoTranscript} className="px-4 py-2 rounded-full bg-white/10 border border-white/10 text-sm">Demo transcript</button>
                </div>
              </div>
            )}

            {/* Transcript preview */}
            {segments.length>0 && (
              <div className="mt-5 rounded-xl bg-black/40 border border-white/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold tracking-widest text-zinc-400 flex items-center gap-2"><Captions className="w-4 h-4"/> TRANSCRIPT — {segments.length} lines, ~{formatTime(duration)} </div>
                  <button onClick={()=>setSegments([])} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
                </div>
                <div className="mt-2 max-h-[160px] overflow-auto text-sm leading-relaxed text-zinc-300 space-y-1 pr-1">
                  {segments.slice(0,120).map((s,i)=><span key={i} className="inline"> <span className="text-violet-400 font-mono text-xs">[{formatTime(s.start)}]</span> {s.text} </span>)}
                </div>
              </div>
            )}

            {/* Settings */}
            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                <div className="text-xs font-bold tracking-widest text-zinc-400 flex items-center gap-2"><Settings2 className="w-4 h-4"/> CLIP SETTINGS</div>
                <div className="mt-3 space-y-4">
                  <div>
                    <div className="flex justify-between text-sm"><span>Number of clips</span><span className="font-bold">{clipCount}</span></div>
                    <input type="range" min={1} max={6} value={clipCount} onChange={e=>setClipCount(parseInt(e.target.value))} className="w-full accent-violet-600"/>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm"><span>Clip length</span><span className="font-bold">{clipLen}s</span></div>
                    <input type="range" min={15} max={60} step={5} value={clipLen} onChange={e=>setClipLen(parseInt(e.target.value))} className="w-full accent-violet-600"/>
                    <div className="flex gap-1 mt-1">{[15,30,45,60].map(v=><button key={v} onClick={()=>setClipLen(v)} className={cn("flex-1 py-1 rounded-full text-xs font-bold border", clipLen===v?"bg-violet-600 border-violet-600 text-white":"border-white/10 text-zinc-400")}>{v}s</button>)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold mb-2 flex items-center gap-2"><Crop className="w-4 h-4"/> Aspect</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["9:16","1:1","16:9"] as const).map(a=>(
                        <button key={a} onClick={()=>setAspect(a)} className={cn("py-3 rounded-xl border font-black text-sm flex flex-col items-center gap-1", aspect===a?"bg-white text-black border-white":"bg-black/20 border-white/10 text-zinc-300")}>
                          <span className={cn("border-2 rounded", a==="9:16"?"w-4 h-7":a==="1:1"?"w-6 h-6":"w-8 h-5", aspect===a?"border-black":"border-zinc-500")}></span>{a}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 mt-3 text-sm"><input type="checkbox" checked={reframeOn} onChange={e=>setReframeOn(e.target.checked)} className="accent-violet-600"/> Smart reframe (face-follow)</label>
                    {reframeOn && <div className="mt-2"><div className="flex justify-between text-xs text-zinc-400"><span>Pan (left → right)</span><span>{reframeX}%</span></div><input type="range" min={0} max={100} value={reframeX} onChange={e=>setReframeX(parseInt(e.target.value))} className="w-full accent-violet-600"/><label className="flex items-center gap-2 text-xs mt-1"><input type="checkbox" checked={autoReframe} onChange={e=>setAutoReframe(e.target.checked)}/> Auto-follow (tries FaceDetector API)</label></div>}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                <div className="text-xs font-bold tracking-widest text-zinc-400 flex items-center gap-2"><Type className="w-4 h-4"/> CAPTIONS & AI</div>
                <label className="flex items-center gap-2 mt-3 text-sm font-bold"><input type="checkbox" checked={captionsOn} onChange={e=>setCaptionsOn(e.target.checked)} className="accent-violet-600"/> Captions ON (burn-in on export)</label>
                <div className={cn("grid grid-cols-2 gap-2 mt-3", !captionsOn && "opacity-40 pointer-events-none")}>
                  {CAPTION_STYLES.map(s=>(
                    <button key={s.id} onClick={()=>setCaptionStyle(s.id)} className={cn("p-3 rounded-xl border text-left", captionStyle===s.id?"border-violet-500 bg-violet-600/20":"border-white/10 bg-black/20")}>
                      <div className={cn("text-[11px] font-black px-2 py-1 rounded inline-block", s.preview)}>{s.label}</div>
                      <div className="text-xs text-zinc-400 mt-1">{s.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
                  <div className="text-xs font-bold tracking-widest flex items-center gap-2"><KeyRound className="w-4 h-4"/> AI PROVIDER (optional, free)</div>
                  <select value={provider} onChange={e=>setProvider(e.target.value as any)} className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm">
                    <option value="heuristic">⚡ Heuristic (no key, instant)</option>
                    <option value="groq">Groq — llama-3.1-8b (FREE, fast)</option>
                    <option value="gemini">Gemini 1.5 Flash (FREE)</option>
                    <option value="openai">OpenAI gpt-4o-mini</option>
                  </select>
                  {provider!=="heuristic" && (
                    <>
                      <input value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={provider==="groq"?"gsk_... (groq.com)": provider==="gemini"?"AIza... (aistudio.google.com)":"sk-..."} type="password" className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-500"/>
                      <input value={model} onChange={e=>setModel(e.target.value)} placeholder={provider==="groq"?"llama-3.1-8b-instant (default)":provider==="gemini"?"gemini-1.5-flash":"gpt-4o-mini"} className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-500"/>
                    </>
                  )}
                  <button onClick={()=>setShowApiHelp(!showApiHelp)} className="text-xs text-violet-400 mt-2 underline">{showApiHelp?"Hide help":"How to get FREE key?"}</button>
                  {showApiHelp && <div className="text-xs text-zinc-400 mt-2 leading-relaxed bg-white/5 p-2 rounded-lg">
                    <b className="text-zinc-200">Groq (recommended):</b> groq.com → Console → API Keys → Create (free 14k req/day).<br/>
                    <b className="text-zinc-200">Gemini:</b> aistudio.google.com → Get API key → free tier.<br/>
                    Keys stay in your browser localStorage, never sent to our server except directly to the provider.
                  </div>}
                </div>

                <textarea value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} placeholder="Custom prompt (optional): e.g. 'Focus on money advice, make hooks controversial'" className="mt-3 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-500" rows={2}/>

                <button onClick={analyze} disabled={analyzing || !segments.length} className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-black flex items-center justify-center gap-2 disabled:opacity-40 hover:from-violet-500 hover:to-fuchsia-500">
                  {analyzing?<><Loader2 className="w-5 h-5 animate-spin"/> Analyzing with {provider}...</>:<><Zap className="w-5 h-5"/> Generate {clipCount} Viral Clips</>}
                </button>
                {!segments.length && <div className="text-xs text-amber-400 flex gap-1 mt-2"><AlertCircle className="w-4 h-4"/> Need transcript first</div>}
              </div>
            </div>
          </div>

          {/* RIGHT: Preview */}
          <div className="space-y-4">
            <div className="glass rounded-[24px] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="font-bold flex items-center gap-2 text-sm"><Eye className="w-4 h-4 text-violet-400"/> PREVIEW</div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <MonitorSmartphone className="w-4 h-4"/> {aspect} • {captionsOn?captionStyle:"no captions"} • {reframeOn?"reframed":"full"}
                </div>
              </div>

              <div className="bg-black p-4 flex justify-center">
                <div className="relative bg-zinc-900 rounded-xl overflow-hidden shadow-2xl" style={{ width: aspect==="9:16" ? 320 : aspect==="1:1" ? 360 : 480, aspectRatio: aspect==="9:16"? "9/16" : aspect==="1:1"? "1/1":"16/9" }}>
                  {/* hidden video source */}
                  {videoSrc ? (
                    <video ref={videoRef} src={videoSrc} crossOrigin="anonymous" playsInline muted={false} controls={false} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} className="hidden"/>
                  ) : ytId ? (
                    <>
                      <iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`} allow="autoplay; encrypted-media" />
                      {/* overlay video for canvas? use thumbnail as fallback */}
                    </>
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-zinc-600 text-sm p-6 text-center">
                      <div>
                        <Film className="w-10 h-10 mx-auto mb-3 opacity-40"/>
                        Upload a video or paste YouTube link to preview.<br/>
                        <span className="text-xs">For YouTube, export requires re-uploading the mp4 (YT blocks canvas capture). Upload gives instant MP4.</span>
                      </div>
                    </div>
                  )}
                  {/* canvas preview – only when videoSrc */}
                  {videoSrc ? (
                    <canvas ref={previewCanvasRef} width={canvasSize.w} height={canvasSize.h} className="absolute inset-0 w-full h-full object-cover"/>
                  ) : ytId ? (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* caption mock for yt */}
                      {captionsOn && segments.length>0 && (
                        <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 w-[88%] text-center">
                          <div className={cn("font-black leading-[1.05] text-[14px] px-2 py-1 inline", captionStyle==="beast"?"bg-yellow-400 text-black":captionStyle==="neon"?"text-cyan-400 [text-shadow:0_0_12px_#22d3ee]":"text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]")} style={{WebkitTextStroke: captionStyle!=="minimal"?"3px black":"0", paintOrder:"stroke fill"}}>
                            {segments[Math.floor(segments.length/3)]?.text.toUpperCase().slice(0,70) || "YOUR CAPTIONS WILL APPEAR HERE"}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* controls overlay */}
                  {videoSrc && clips[activeClip] && (
                    <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
                      <button onClick={()=>{
                        if(!videoRef.current) return;
                        if(isPlayingClip){ videoRef.current.pause(); setIsPlayingClip(false);} else { videoRef.current.play(); setIsPlayingClip(true); }
                      }} className="w-8 h-8 rounded-full bg-white text-black grid place-items-center"><Play className={cn("w-4 h-4", isPlayingClip && "hidden")}/>{isPlayingClip?<span className="w-3 h-3 bg-black rounded-sm block"/>:null}</button>
                      <div className="flex-1">
                        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500" style={{width: `${clips[activeClip] ? (( (videoRef.current?.currentTime||0) - clips[activeClip].start) / clipLen *100) : 0}%`}}/>
                        </div>
                        <div className="text-[11px] text-white/70 font-mono">{formatTime(videoRef.current?.currentTime||clips[activeClip].start)} / {formatTime(clips[activeClip].end)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {clips.length>0 && (
                <div className="px-4 py-3 bg-white/5 border-t border-white/5 flex items-center justify-between">
                  <div className="text-sm font-bold">{clips.length} clips • {clipLen}s each • ~{clips.length*clipLen}s total</div>
                  <button onClick={()=>{ const c=clips[activeClip]; if(c) handleExport(activeClip); }} disabled={exporting!==null} className="px-4 py-2 rounded-full bg-white text-black font-bold text-sm flex items-center gap-2 disabled:opacity-40"><Download className="w-4 h-4"/> Export Active Clip</button>
                </div>
              )}
            </div>

            {/* Clips list */}
            {clips.length>0 ? (
              <div className="glass rounded-[24px] p-4">
                <div className="text-xs font-bold tracking-widest text-zinc-400 flex items-center gap-2 mb-3"><Scissors className="w-4 h-4"/> GENERATED CLIPS — click to preview</div>
                <div className="space-y-3">
                  {clips.map((c,i)=>(
                    <div key={i} onClick={()=>{setActiveClip(i); if(videoRef.current){ videoRef.current.currentTime=c.start+0.1; videoRef.current.play().then(()=>setIsPlayingClip(true)).catch(()=>{}); }}} className={cn("p-3 rounded-xl border cursor-pointer flex gap-3", i===activeClip?"bg-violet-600/20 border-violet-500/50":"bg-white/5 border-white/5 hover:bg-white/10")}>
                      <div className="w-20 h-[68px] rounded-lg bg-black grid place-items-center overflow-hidden flex-shrink-0 relative">
                        {ytId ? <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} className="w-full h-full object-cover opacity-80"/> : <Film className="w-6 h-6 text-zinc-600"/>}
                        <span className="absolute bottom-1 right-1 text-[10px] font-mono bg-black/70 px-1 rounded text-white">{formatTime(c.start)}-{formatTime(c.end)}</span>
                        <span className="absolute top-1 left-1 bg-violet-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded">#{i+1} • {c.score}/10</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-black leading-tight text-sm line-clamp-1">{c.hook}</div>
                        <div className="text-xs text-zinc-400 line-clamp-2 mt-1">{c.reason}</div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={(e)=>{e.stopPropagation(); handleExport(i);}} disabled={exporting!==null} className="px-3 py-1.5 rounded-full bg-white text-black font-bold text-xs flex items-center gap-1"> {exporting===i?<Loader2 className="w-3 h-3 animate-spin"/>:<Download className="w-3 h-3"/>} Export</button>
                          <button onClick={(e)=>{e.stopPropagation(); if(videoRef.current){ videoRef.current.currentTime=c.start; videoRef.current.play(); setIsPlayingClip(true);}}} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-bold flex items-center gap-1"><Play className="w-3 h-3"/> Play</button>
                          <span className="text-xs text-zinc-500 py-1.5">{formatTime(c.start)} → {formatTime(c.end)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 leading-relaxed">
                  <b>Tip:</b> Export creates a <b>WEBM with burnt-in captions + reframed {aspect}</b> recorded from the canvas. For MP4, use the upload workflow (or run locally with ffmpeg). Add audio via “captureStream” — if no audio, re-upload & enable mic permission or use desktop export script.
                </div>
              </div>
            ) : (
              <div className="glass rounded-[24px] p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-600/20 grid place-items-center mx-auto"><Sparkles className="w-7 h-7 text-violet-400"/></div>
                <div className="font-bold mt-3">No clips yet</div>
                <div className="text-sm text-zinc-500 mt-1">Generate after you fetch a transcript. Heuristic mode works offline — Groq/Gemini makes it smarter if you add a free key.</div>
                <div className="flex gap-2 justify-center mt-4 text-xs text-zinc-400">
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">1. Fetch / Demo</span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">2. Generate</span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">3. Export</span>
                </div>
              </div>
            )}

            <div id="how" className="glass rounded-[24px] p-5">
              <div className="font-black">How ProPagandaAi works</div>
              <ol className="text-sm text-zinc-400 list-decimal ml-5 mt-2 space-y-1">
                <li><b className="text-zinc-200">Ingest:</b> YouTube via captions API (no download needed) OR upload MP4 (best for export).</li>
                <li><b className="text-zinc-200">Transcribe:</b> YouTube captions / Groq Whisper large-v3 (free). Demo mode skips this for testing.</li>
                <li><b className="text-zinc-200">Find virality:</b> Heuristic scoring (questions, numbers, power words) or LLM (Groq/Gemini/OpenAI) picks non-overlapping {clipLen}s windows.</li>
                <li><b className="text-zinc-200">Reframe:</b> Center-crop to {aspect} with pan slider; uses FaceDetector if available for auto-follow.</li>
                <li><b className="text-zinc-200">Captions:</b> Word-level segments burned into canvas on export (Hormozi/Beast/Neon styles).</li>
                <li><b className="text-zinc-200">Deploy:</b> `npm run dev` locally or `vercel --prod` (zero config). All processing client-side + free API.</li>
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="https://vercel.com/new" target="_blank" className="px-4 py-2 rounded-full bg-white text-black font-bold text-sm">Deploy to Vercel</a>
                <a href="https://github.com" target="_blank" className="px-4 py-2 rounded-full bg-white/10 border border-white/10 text-sm">View source</a>
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center text-xs text-zinc-600 py-10">
          Built for creators • ProPagandaAi is local-first — your video never leaves your device except when you call Groq/Gemini/OpenAI with your own key. • <span className="text-zinc-400">Tip: for 4K YouTube downloads locally, run `yt-dlp -f mp4 URL` then drag the file here.</span>
        </footer>
      </div>
      {/* hidden canvas for export */}
      <canvas ref={canvasRef} className="hidden"/>
    </div>
  );
}
