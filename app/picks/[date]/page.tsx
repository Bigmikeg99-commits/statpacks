import { readFileSync } from 'fs'
import { join } from 'path'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

/* ---- types ---- */
interface ArchivePick {
  name: string; team: string; opp: string; hand: string; ha: string
  rec: string; line: number; pred_k: number; edge: number | null
  actual_k: number | null; result: string | null; mlbamid?: string
}
interface ArchiveDay { date: string; picks: ArchivePick[] }

/* ---- helpers ---- */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Single config constant for model version ranges — update when a new model ships
const MODEL_VERSIONS = [
  { from: '2026-03-26', to: '2026-06-10', label: 'V1 Model' },
  { from: '2026-06-11', to: null as string | null, label: 'PSI+ V2' },
]

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${MONTHS[+m - 1]} ${+d}, ${y}`
}

function slugify(name: string) {
  return name.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function getModelLabel(date: string) {
  for (const v of MODEL_VERSIONS) {
    if (date >= v.from && (v.to === null || date <= v.to)) return v.label
  }
  return 'V1 Model'
}

function dotColor(r: string | null) {
  if (r === 'W') return '#3ab05a'
  if (r === 'L') return '#C44536'
  if (r === 'push' || r === 'P') return '#D4AF37'
  if (r === 'PPD') return '#4EABDE'
  return 'transparent'
}

function computeRecord(picks: ArchivePick[]) {
  return picks.reduce((a, p) => {
    if (p.result === 'W') a.w++
    else if (p.result === 'L') a.l++
    return a
  }, { w: 0, l: 0 })
}

function recordColor(w: number, l: number) {
  const pct = (w + l) > 0 ? w / (w + l) : 0
  if (pct >= 0.524) return '#3ab05a'
  if (pct >= 0.5) return '#D4AF37'
  return '#C44536'
}

function loadArchive(): ArchiveDay[] {
  return JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'picks_archive.json'), 'utf-8'))
}

/* ---- static generation ---- */
export async function generateStaticParams() {
  return loadArchive().map(d => ({ date: d.date }))
}

/* ---- metadata ---- */
export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params
  const day = loadArchive().find(d => d.date === date)
  if (!day) return { title: 'Not Found — StatPacks' }

  const label = formatDate(date)
  const rec = computeRecord(day.picks)
  const recStr = (rec.w + rec.l) > 0 ? `${rec.w}-${rec.l}` : `${day.picks.length} picks`
  const title = `${label} — ${recStr} · StatPacks K Model`
  const description = `${day.picks.length} MLB strikeout picks for ${label}. ${recStr} record. StatPacks PSI+ model.`
  const ogImage = `https://statpacks.app/picks/${date}/opengraph-image`

  return {
    title,
    description,
    openGraph: { title, description, url: `https://statpacks.app/picks/${date}`, siteName: 'StatPacks', type: 'article', images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

/* ---- page ---- */
export default async function PickDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const day = loadArchive().find(d => d.date === date)
  if (!day) notFound()

  const picks = day.picks
  const rec = computeRecord(picks)
  const label = formatDate(date)
  const settled = (rec.w + rec.l) > 0
  const modelLabel = getModelLabel(date)

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <Link href="/"><div className="nav-logo-badge"><span>StatPacks</span></div></Link>
        </div>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/psi" style={{color:'var(--gold)'}}>PSI+</Link>
          <Link href="/#picks">Picks</Link>
          <Link href="/performance">Performance</Link>
        </div>
      </nav>

      <div style={{maxWidth:'560px',margin:'0 auto',padding:'40px 20px 80px'}}>

        {/* Card */}
        <div style={{background:'rgba(13,30,53,0.98)',border:'1px solid rgba(212,175,55,0.2)',borderRadius:'12px',overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,0.4)'}}>

          {/* Header */}
          <div style={{padding:'18px 20px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px'}}>
            <div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.2em',textTransform:'uppercase',color:'var(--gold)',fontWeight:600,marginBottom:'5px'}}>
                Pick Archive · {modelLabel}
              </div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'22px',fontWeight:700,color:'var(--cream)',lineHeight:1.1}}>
                {label}
              </div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.4)',marginTop:'3px'}}>
                {picks.length} pick{picks.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
              {settled && (
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:'15px',fontWeight:700,color:recordColor(rec.w,rec.l)}}>
                  {rec.w}-{rec.l}
                </span>
              )}
              <a
                href={`https://statpacks.app/picks/${date}`}
                style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.45)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'5px',padding:'5px 8px',textDecoration:'none',letterSpacing:'0.04em'}}
              >
                ↗ Permalink
              </a>
            </div>
          </div>

          {/* Pick rows */}
          <div>
            {picks.map((p, i) => {
              const edgeStr = p.edge != null ? (p.edge >= 0 ? '+' : '') + p.edge.toFixed(1) : null
              const initials = p.name.split(' ').map((n:string) => n[0]).slice(0,2).join('')
              const dot = dotColor(p.result)
              const hasDot = p.result !== null

              return (
                <div
                  key={i}
                  id={slugify(p.name)}
                  style={{padding:'12px 20px',borderBottom:i<picks.length-1?'1px solid rgba(255,255,255,0.04)':'none',display:'flex',alignItems:'center',gap:'12px',scrollMarginTop:'80px'}}
                >
                  <div style={{width:'34px',height:'34px',borderRadius:'50%',flexShrink:0,background:'rgba(212,175,55,0.08)',border:'1px solid rgba(212,175,55,0.15)',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Inter',sans-serif",fontSize:'11px',fontWeight:700,color:'rgba(212,175,55,0.7)'}}>
                    {p.mlbamid
                      ? <img src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_67,q_auto:best/v1/people/${p.mlbamid}/headshot/67/current`} alt={p.name} width={34} height={34} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      : initials}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:'12px',fontWeight:600,color:'var(--cream)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.65)',marginTop:'2px'}}>{p.team} {p.ha==='Home'?'vs':'@'} {p.opp}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:'11px',fontWeight:700,color:'var(--cream)',letterSpacing:'0.05em'}}>{p.rec} {p.line}K</div>
                    {edgeStr && (
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:p.edge!>0?'#3ab05a':'#C44536',marginTop:'2px'}}>{edgeStr} edge</div>
                    )}
                    {p.actual_k != null && (
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.65)',marginTop:'2px'}}>Strikeouts: {p.actual_k}</div>
                    )}
                  </div>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:hasDot?dot:'transparent',border:hasDot?'none':'1px solid rgba(245,241,230,0.2)',flexShrink:0}} />
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{padding:'12px 20px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',gap:'16px',flexWrap:'wrap'}}>
            {[['#3ab05a','Win'],['#C44536','Loss'],['#D4AF37','Push'],['#4EABDE','PPD']].map(([c,l]) => (
              <span key={l} style={{display:'flex',alignItems:'center',gap:'5px',fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.6)'}}>
                <span style={{width:'8px',height:'8px',borderRadius:'50%',background:c,display:'inline-block',flexShrink:0}}/>
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{marginTop:'16px',textAlign:'center',fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.3)',letterSpacing:'0.04em'}}>
          {modelLabel} · −110 breakeven = 52.4% ·{' '}
          <Link href="/performance" style={{color:'rgba(212,175,55,0.4)'}}>← Performance</Link>
        </div>

      </div>
    </>
  )
}
