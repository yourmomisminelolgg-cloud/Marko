import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    // try oEmbed for title/author
    const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { next: { revalidate: 3600 } }).then(r=>r.json()).catch(()=>null);
    // try noembed fallback
    return NextResponse.json({
      id,
      title: oembed?.title || `YouTube Video ${id}`,
      author: oembed?.author_name || "Unknown",
      thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      thumbnailFallback: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    });
  } catch (e:any) {
    return NextResponse.json({ id, title: id, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg` });
  }
}
