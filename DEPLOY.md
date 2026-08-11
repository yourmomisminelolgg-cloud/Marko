# Deploy ProPagandaAi

## One-click Vercel (recommended)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourmomisminelolgg-cloud/Marko&project-name=propaganda-ai&repository-name=propaganda-ai&branch=arena/019fee3a-marko)

1. Click button → Login to Vercel (GitHub)
2. Pick repo `Marko` branch `arena/019fee3a-marko` → **Deploy**
3. Done → you get `https://propaganda-ai-xxx.vercel.app`

No env vars needed.

## Local
```bash
git clone https://github.com/yourmomisminelolgg-cloud/Marko.git
cd Marko
git checkout arena/019fee3a-marko
npm install
npm run dev
```
Open http://localhost:3000

## GitHub Pages (static)
Not recommended (Next.js API routes needed for transcript/analyze). Use Vercel.
