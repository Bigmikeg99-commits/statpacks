import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface ArchivePick { result: string | null }
interface ArchiveDay { date: string; picks: ArchivePick[] }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${MONTHS[+m - 1]} ${+d}, ${y}`
}

function computeRecord(picks: ArchivePick[]) {
  return picks.reduce((a, p) => {
    if (p.result === 'W') a.w++
    else if (p.result === 'L') a.l++
    return a
  }, { w: 0, l: 0 })
}

export default async function OgImage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const archive: ArchiveDay[] = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'picks_archive.json'), 'utf-8'))
  const day = archive.find(d => d.date === date)

  const label = day ? formatDate(date) : date
  const picks = day?.picks ?? []
  const rec = computeRecord(picks)
  const settled = (rec.w + rec.l) > 0
  const recStr = settled ? `${rec.w}–${rec.l}` : `${picks.length} picks`
  const pct = settled ? ((rec.w / (rec.w + rec.l)) * 100).toFixed(0) + '%' : ''
  const recCol = settled
    ? (rec.w / (rec.w + rec.l) >= 0.524 ? '#3ab05a' : rec.w / (rec.w + rec.l) >= 0.5 ? '#D4AF37' : '#C44536')
    : '#F5F1E6'

  return new ImageResponse(
    (
      <div style={{width:'1200px',height:'630px',background:'#0A1628',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',position:'relative',fontFamily:'sans-serif'}}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:'3px',background:'linear-gradient(90deg,transparent,#D4AF37,transparent)'}} />
        <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(212,175,55,0.04) 60px),repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(212,175,55,0.04) 60px)'}} />
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',zIndex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'28px'}}>
            <span style={{display:'flex',alignItems:'center',border:'2px solid #C44536',borderRadius:'5px',padding:'4px 10px',fontSize:'14px',letterSpacing:'0.3em',color:'#D4AF37',textTransform:'uppercase'}}>STATPACKS</span>
            <span style={{fontSize:'14px',letterSpacing:'0.2em',color:'rgba(245,241,230,0.3)',textTransform:'uppercase'}}>MLB K MODEL</span>
          </div>
          <div style={{fontSize:'56px',fontWeight:900,color:'#F5F1E6',letterSpacing:'-0.01em',lineHeight:1,marginBottom:'24px'}}>{label}</div>
          <div style={{display:'flex',alignItems:'baseline',gap:'16px'}}>
            <span style={{fontSize:'72px',fontWeight:900,color:recCol,lineHeight:1}}>{recStr}</span>
            {pct && <span style={{fontSize:'28px',fontWeight:600,color:recCol,opacity:0.7}}>{pct}</span>}
          </div>
          <div style={{fontSize:'16px',color:'rgba(245,241,230,0.4)',marginTop:'16px',letterSpacing:'0.08em',textTransform:'uppercase'}}>{picks.length} picks · statpacks.app</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
