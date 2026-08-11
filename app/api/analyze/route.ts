import { NextRequest, NextResponse } from "next/server";

function heuristicClips(segments: any[], duration: number, count=3, targetLen=30) {
  if (!segments.length) {
    // fallback: split uniformly
    const clips=[];
    const step = Math.max(targetLen, Math.floor(duration / count));
    for(let i=0;i<count;i++){
      const start = Math.floor((duration / (count+1)) * (i+1) - targetLen/2);
      const s = Math.max(0, start); const e = Math.min(duration, s+targetLen);
      clips.push({ start:s, end:e, score: 0.5 + Math.random()*0.3, hook: `Highlight ${i+1}`, reason: "Uniform split (no transcript)" });
    }
    return clips;
  }
  // score each segment for virality
  const viralWords = ["you","why","how","secret","never","always","craziest","insane","truth","viral","money","ai","podcast","story","mistake","hack","tip","free","best","worst"];
  const scored = segments.map(s=>{
    let score = 0;
    const t = s.text.toLowerCase();
    if (/[?!]/.test(s.text)) score+=1.5;
    if (t.length>40 && t.length<140) score+=0.8;
    if (/\d+/.test(t)) score+=0.5;
    for(const w of viralWords) if(t.includes(w)) score+=0.6;
    if (t.includes("i ") || t.includes("we ")) score+=0.3;
    // caps = energy
    const capsRatio = (s.text.match(/[A-Z]/g)||[]).length / Math.max(1,s.text.length);
    if (capsRatio>0.15) score+=0.4;
    score += Math.random()*0.4;
    return {...s, score};
  });
  // sliding window of targetLen seconds (~ 10-15 segs)
  const windows:any[]=[];
  for(let start=0; start<duration - targetLen + 1; start+=3){
    const end=start+targetLen;
    const inside = scored.filter(s=>s.start>=start && s.start<end);
    if(!inside.length) continue;
    const avg = inside.reduce((a,b)=>a+b.score,0)/inside.length;
    const max = Math.max(...inside.map(i=>i.score));
    const text = inside.map(i=>i.text).join(" ").slice(0,180);
    windows.push({ start, end, score: avg*0.7 + max*0.3, text, count: inside.length });
  }
  // dedup non-overlapping top
  windows.sort((a,b)=>b.score-a.score);
  const picked:any[]=[];
  for(const w of windows){
    if(picked.length>=count) break;
    if(picked.some(p=> Math.abs(p.start-w.start) < targetLen*0.6)) continue;
    picked.push(w);
  }
  // if not enough, fill
  while(picked.length<count && windows.length){
    const rem = windows.find(w=>!picked.includes(w));
    if(!rem) break; picked.push(rem);
  }
  return picked.map((p,i)=>({
    start: Math.round(p.start*10)/10,
    end: Math.round(p.end*10)/10,
    score: Math.round(p.score*100)/100,
    hook: p.text.split(".")[0].slice(0,70) || `Viral Moment ${i+1}`,
    reason: `High energy & keywords (${p.count} lines, score ${p.score.toFixed(2)})`,
    keywords: p.text
  })).sort((a,b)=>a.start-b.start);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { segments, duration, count=3, targetLen=30, provider="heuristic", apiKey, model, prompt } = body;
  if (!segments) return NextResponse.json({ error:"missing segments"},{status:400});

  // if heuristic or no key
  if (provider==="heuristic" || !apiKey) {
    const clips = heuristicClips(segments, duration||120, count, targetLen);
    return NextResponse.json({ clips, mode:"heuristic" });
  }

  // Try LLM
  const transcriptText = segments.map((s:any)=> `[${s.start.toFixed(1)}s] ${s.text}`).join("\n").slice(0, 12000);
  const sys = `You are ProPagandaAi, a viral clip hunter for podcasts & YouTube. Given a transcript with timestamps, pick the ${count} MOST VIRAL moments. Each clip must be ${targetLen-5} to ${targetLen+5} seconds. Return JSON array: [{"start":number,"end":number,"score":0-10,"hook":"punchy title <=8 words","reason":"why viral"}]. Rules: no overlapping clips, must be within 0-${duration}s, prefer hooks/questions/controversy/story. ${prompt||""}`;
  const user = `Duration: ${duration}s\nTranscript:\n${transcriptText}\nReturn ONLY JSON array.`;

  try {
    let url="", headers:any={}, payload:any;
    if (provider==="groq") {
      url="https://api.groq.com/openai/v1/chat/completions";
      headers={ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" };
      payload={ model: model||"llama-3.1-8b-instant", messages:[{role:"system",content:sys},{role:"user",content:user}], temperature:0.7, max_tokens:1200 };
    } else if (provider==="gemini") {
      const m = model||"gemini-1.5-flash";
      url=`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      headers={ "Content-Type":"application/json" };
      payload={ contents:[{ parts:[{ text: sys+"\n\n"+user }]}], generationConfig:{temperature:0.7} };
    } else if (provider==="openai") {
      url="https://api.openai.com/v1/chat/completions";
      headers={ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" };
      payload={ model: model||"gpt-4o-mini", messages:[{role:"system",content:sys},{role:"user",content:user}], temperature:0.7 };
    } else {
      throw new Error("unknown provider");
    }

    const r = await fetch(url,{ method:"POST", headers, body: JSON.stringify(payload)});
    const j = await r.json();
    if (!r.ok) {
      // fallback heuristic
      const clips = heuristicClips(segments, duration, count, targetLen);
      return NextResponse.json({ clips, mode:"heuristic_fallback", llmError: j });
    }
    let text="";
    if (provider==="gemini") text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
    else text = j.choices?.[0]?.message?.content || "";

    // extract json
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("no json in llm output: "+text.slice(0,400));
    let clips = JSON.parse(m[0]);
    // sanitize
    clips = clips.map((c:any)=> ({
      start: Math.max(0, Math.min(duration-targetLen, Number(c.start))),
      end: Math.max(0, Math.min(duration, Number(c.end))),
      score: Number(c.score)||7,
      hook: String(c.hook||"Viral Clip").slice(0,80),
      reason: String(c.reason||"LLM picked").slice(0,180),
    })).slice(0,count);
    // ensure length
    clips = clips.map((c:any)=> ({...c, end: c.end<=c.start? c.start+targetLen : c.end }));
    return NextResponse.json({ clips, mode: provider, raw: text.slice(0,500) });
  } catch (e:any) {
    const clips = heuristicClips(segments, duration, count, targetLen);
    return NextResponse.json({ clips, mode:"heuristic_error", error: e.message });
  }
}
