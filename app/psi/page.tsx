'use client'
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Cell,
} from 'recharts'

/* ───── Types ───── */
interface LBRow {
  id: string; name: string; psi: number; role: string
  k_pct: number; clw: number; velo: number; vaa: number; n: number
  slwr?: number | null
}
interface RollingRow { id: string; date: string; psi: number | null }

/* ───── Frozen public validation data ───── */
const STABILITY = [
  { name: 'PSI+',   r: 0.8380, color: '#3ab05a' },
  { name: 'SwStr%', r: 0.7560, color: '#4EABDE' },
  { name: 'K%',     r: 0.6939, color: '#D4AF37' },
  { name: 'CSW%',   r: 0.6379, color: '#E07B54' },
]

const PREDICTION = [
  { metric: 'Prior K%', r: 0.6924 },
  { metric: 'PSI+ clean reconstruction', r: 0.6892 },
  { metric: 'SwStr%', r: 0.6423 },
  { metric: 'CSW%', r: 0.5930 },
]

const CASE_STUDIES = [
  {
    type: 'PSI+ HIGHER', name: 'Jesús Luzardo', year: 2021,
    kpct: '22.5%', psi: '114.6', next_kpct: '29.9%', change: '+7.4pp',
    detail: 'Velo p95: 97.8 mph · CLW: .145',
  },
  {
    type: 'PSI+ LOWER', name: 'Adam Wainwright', year: 2022,
    kpct: '17.8%', psi: '78.5', next_kpct: '11.4%', change: '−6.4pp',
    detail: 'Velo p95: 90.8 to 90.1 mph · CLW: .093 to .073',
  },
]

const METHOD_SPECS = [
  { label: 'Data Source',       val: 'Baseball Savant', sub: 'regular-season pitches' },
  { label: 'Production',        val: '55 / 35 / 5 / 5', sub: 'CLW · Velo · VAA · SLWR' },
  { label: 'Score Scale',       val: '100 + 10z',        sub: 'within season and role' },
  { label: 'Role Handling',     val: 'Separate',         sub: 'starter and reliever baselines' },
  { label: 'Live Leaderboard',  val: 'Season to date',   sub: 'minimum 200 eligible pitches' },
  { label: 'Rolling View',      val: 'Prior 1,000',      sub: 'min 200; current appearance excluded' },
  { label: 'Validation Rules',  val: '2020–2024',        sub: 'clean reconstruction fixed before 2025' },
  { label: 'Validation Cohorts',val: '167 / 150',        sub: 'prediction / stability' },
]

/* ───── Custom Tooltip ───── */
interface ChartTipProps {
  active?: boolean
  payload?: ReadonlyArray<{ name?: ReactNode; value?: unknown }>
  label?: ReactNode
  fmt?: (value: unknown) => ReactNode
}

function ChartTip({ active, payload, label, fmt }: ChartTipProps) {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.22)',borderRadius:'4px',padding:'8px 12px',fontFamily:'Inter',fontSize:'11px',pointerEvents:'none'}}>
      {label && <div style={{color:'#D4AF37',fontWeight:600,marginBottom:'4px'}}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{color:'#F5F1E6'}}>{p.name}: {fmt ? fmt(p.value) : String(p.value ?? '')}</div>
      ))}
    </div>
  )
}

/* ───── Helpers ───── */
function psiColor(v: number) {
  if (v >= 120) return '#3ab05a'
  if (v >= 110) return '#7ec85a'
  if (v >= 90)  return 'var(--cream)'
  if (v >= 80)  return '#e08060'
  return '#C44536'
}

function fmtAsOf(d: string | null) {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  const dt = new Date(y, m - 1, day)
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function fmtAsOfFull(d: string | null) {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return null
  const dt = new Date(y, m - 1, day)
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

type LBKey = keyof LBRow
type SortDir = 'asc' | 'desc'

/* ───── Component ───── */
export default function PSIPage() {
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [role,          setRole]          = useState<'starter'|'reliever'>('starter')
  const [lbData,        setLbData]        = useState<LBRow[]|null>(null)
  const [rolling,       setRolling]       = useState<RollingRow[]|null>(null)
  const [rollingLoad,   setRollingLoad]   = useState(false)
  const [sort,          setSort]          = useState<{col: LBKey; dir: SortDir}>({col:'psi',dir:'desc'})
  const [search,        setSearch]        = useState('')
  const [minP,          setMinP]          = useState(200)
  const [pitcherQ,      setPitcherQ]      = useState('')
  const [selPitcher,    setSelPitcher]    = useState<LBRow|null>(null)
  const [showDrop,      setShowDrop]      = useState(false)
  const [showAll,       setShowAll]       = useState(false)
  const [asOf,          setAsOf]          = useState<string|null>(null)
  const [showWhyName,   setShowWhyName]   = useState(false)
  const [isMobile,      setIsMobile]      = useState(false)
  const [flippedCards,  setFlippedCards]  = useState<Set<number>>(new Set())

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetch('/data/psi_meta.json').then(r=>r.json()).then(d=>setAsOf(d?.asOf ?? null)).catch(()=>setAsOf(null))
    fetch('/data/psi_leaderboard_2026.json').then(r=>r.json()).then(data=>{
      setLbData(data)
      // Default trajectory to Dylan Cease
      const cease = data.find((p: LBRow) => p.name.toLowerCase().includes('cease'))
      if (cease) {
        setSelPitcher(cease)
        setPitcherQ(cease.name)
      }
    }).catch(()=>setLbData([]))
    // Pre-load Cease's rolling data for default trajectory display
    fetch('/data/psi_rolling/656302.json').then(r=>r.json()).then(d=>setRolling(d)).catch(()=>{})
  }, [])


  const loadRolling = useCallback((pitcher?: LBRow) => {
    const target = pitcher || selPitcher
    if (!target) return
    setRollingLoad(true)
    fetch(`/data/psi_rolling/${target.id}.json`)
      .then(r=>r.json())
      .then(d => {
        setRolling(prev => {
          const existing = prev?.filter(r => r.id !== target.id) ?? []
          return [...existing, ...d]
        })
        setRollingLoad(false)
      })
      .catch(()=>setRollingLoad(false))
  }, [selPitcher])

  /* Leaderboard derived */
  const filtered = (lbData ?? [])
    .filter(r => r.role === role && r.n >= minP)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sort.col] as number, bv = b[sort.col] as number
      return sort.dir === 'desc' ? bv - av : av - bv
    })

  const handleSort = (col: LBKey) =>
    setSort(prev => prev.col === col ? {col, dir: prev.dir==='desc'?'asc':'desc'} : {col, dir:'desc'})

  const toggleCard = (index: number) => {
    if (!isMobile) return
    setFlippedCards(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  /* Trajectory derived */
  const suggestions = pitcherQ.length >= 2
    ? (lbData ?? []).filter(r => r.name.toLowerCase().includes(pitcherQ.toLowerCase())).slice(0, 8)
    : []

  const trajectoryData = selPitcher && rolling
    ? rolling.filter(r => r.id === selPitcher.id).sort((a,b) => a.date.localeCompare(b.date))
    : []

  /* ── Shared section wrapper style ── */
  const sec = { padding:'80px 40px', maxWidth:'1200px', margin:'0 auto' } as const
  const card = {
    background:'#0d1e35', border:'1px solid rgba(212,175,55,0.15)',
    borderRadius:'6px', padding:'24px', position:'relative' as const, overflow:'hidden' as const,
  }
  const cardTop = {
    position:'absolute' as const, top:0, left:0, right:0, height:'2px',
    background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.4),transparent)',
    borderRadius:'6px 6px 0 0',
  }

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <Link href="/" className="nav-logo-badge"><span>StatPacks</span></Link>
        </div>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/psi" style={{color:'var(--gold)'}}>PSI+</Link>
          <Link href="/#picks">Picks</Link>
          <Link href="/performance">Performance</Link>
        </div>
        <button className={`nav-hamburger${menuOpen?' open':''}`} aria-label="Menu" onClick={()=>setMenuOpen(o=>!o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen?' open':''}`}>
        <Link href="/"            onClick={()=>setMenuOpen(false)}>Home</Link>
        <Link href="/psi"         onClick={()=>setMenuOpen(false)} style={{color:'var(--gold)'}}>PSI+</Link>
        <Link href="/#picks"      onClick={()=>setMenuOpen(false)}>Picks</Link>
        <Link href="/performance" onClick={()=>setMenuOpen(false)}>Performance</Link>
      </div>

      <main style={{minHeight:'100vh',paddingBottom:'80px'}}>

        {/* ══ HERO ══ */}
        <section style={{background:'var(--navy)',padding:'40px',textAlign:'center',borderBottom:'2px solid rgba(212,175,55,0.15)',position:'relative',overflow:'hidden',minHeight:'calc(100vh - 64px)',display:'flex',flexDirection:'column',justifyContent:'center'}}>
          <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(0deg,rgba(78,171,222,0.03) 0,rgba(78,171,222,0.03) 1px,transparent 1px,transparent 70px),repeating-linear-gradient(90deg,rgba(78,171,222,0.03) 0,rgba(78,171,222,0.03) 1px,transparent 1px,transparent 70px)',pointerEvents:'none'}}/>
          <div style={{position:'relative',zIndex:1,maxWidth:'900px',margin:'0 auto'}}>
            <div className="hero-eyebrow">Pitcher Strikeout Index · 2026</div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:'clamp(60px,10vw,110px)',fontWeight:900,color:'var(--cream)',lineHeight:.9,marginBottom:'14px',letterSpacing:'-0.01em'}}>
              PSI<span style={{color:'var(--gold)',fontSize:'0.45em',verticalAlign:'super',fontWeight:700,letterSpacing:0}}>+</span>
            </h1>
            <p style={{fontSize:'16px',color:'rgba(245,241,230,0.9)',maxWidth:'620px',margin:'0 auto 8px',lineHeight:1.7,fontFamily:"'Inter',sans-serif",fontWeight:500}}>
              A new framework for evaluating strikeout ability in modern baseball.
            </p>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.6)',maxWidth:'560px',margin:'0 auto 24px',lineHeight:1.8,fontFamily:"'Inter',sans-serif",fontStyle:'italic'}}>
              Tells you which pitchers are built to strikeout hitters, not just which ones have recently.
            </p>
            <div style={{display:'flex',justifyContent:'center',marginBottom:'14px'}}>
              <a href="#leaderboard" className="btn btn-primary btn-hero">
                See Who’s Leading PSI+
                <span aria-hidden="true" style={{marginLeft:'10px'}}>→</span>
              </a>
            </div>
            <div style={{textAlign:'center',marginBottom:'20px'}}>
              <a href="#validation" className="link-quiet">Validation Results</a>
            </div>
            <div style={{fontSize:'12.5px',color:'rgba(245,241,230,0.52)',fontFamily:"'Inter',sans-serif",letterSpacing:'0.01em',lineHeight:1.7,maxWidth:'620px',margin:'0 auto',textAlign:'center'}}>
              Production PSI+ &nbsp;·&nbsp; 2025 validation uses a clean reconstruction fixed from 2020–2024
            </div>
            <div style={{marginTop:'8px',fontSize:'9.5px',letterSpacing:'0.12em',color:'rgba(245,241,230,0.32)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',textAlign:'center'}}>
              Count Leverage &nbsp;·&nbsp; Velocity &nbsp;·&nbsp; Pitch Angle &nbsp;·&nbsp; SLWR
            </div>
            <div style={{marginTop:'14px',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.22)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>
              {fmtAsOfFull(asOf) ? `Last updated: ${fmtAsOfFull(asOf)}` : 'Last updated: pending'}
            </div>
          </div>
        </section>

        {/* ══ COMPONENT DEEP DIVE ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Four Components · Starters and Relievers Scored Separately</div>
            <h2 className="sec-title">What Goes Into PSI+</h2>
          </div>

          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(2,1fr)',gap:'16px'}}>

            {/* 01 — CLW */}
            <div className={`flip-card${flippedCards.has(0)?' flipped':''}`} style={{height:'340px'}} onClick={()=>toggleCard(0)}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(58,176,90,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,#3ab05a,transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'#3ab05a',letterSpacing:'0.08em'}}>CLW</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 55%</div>
                  </div>
                  <div className="method-title">Count-Leveraged Whiff Rate</div>
                  <p className="method-desc" style={{color:'rgba(245,241,230,0.72)',lineHeight:1.85}}>Weighted valid whiffs divided by weighted eligible pitches across the full eligible arsenal. Two-strike pitches count double, first pitches count half, and all other pitches receive neutral weight.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(58,176,90,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>{isMobile?'Tap':'Hover'} to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(58,176,90,0.25)',borderLeft:'3px solid #3ab05a',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Count-Leveraged Whiff Rate (CLW)</div>
                  <p style={{fontSize:'13px',color:'rgba(245,241,230,0.72)',fontFamily:"'Inter',sans-serif",lineHeight:1.85,margin:0}}>CLW is not fastball-only. Every eligible pitch contributes to the weighted rate.</p>
                  <div>
                    <div style={{fontSize:'8px',letterSpacing:'0.18em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px'}}>Count Weights</div>
                    {[['Two-strike','2.0×'],['First-pitch','0.5×'],['All others','1.0×']].map(([lbl,val])=>(
                      <div key={lbl} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(212,175,55,0.08)'}}>
                        <span style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif"}}>{lbl}</span>
                        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'13px',fontWeight:700,color:'#3ab05a'}}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'3px',padding:'10px 14px',marginTop:'auto',fontSize:'10px',color:'rgba(245,241,230,0.42)',fontFamily:"'Inter',sans-serif",lineHeight:1.6}}>Formula: weighted valid whiffs ÷ weighted eligible pitches.</div>
                </div>
              </div>
            </div>

            {/* 02 — VELO P95 */}
            <div className={`flip-card${flippedCards.has(1)?' flipped':''}`} style={{height:'340px'}} onClick={()=>toggleCard(1)}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(78,171,222,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,#4EABDE,transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'#4EABDE',letterSpacing:'0.08em'}}>VELO P95</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 35%</div>
                  </div>
                  <div className="method-title">Fastball Velocity Ceiling</div>
                  <p className="method-desc" style={{color:'rgba(245,241,230,0.72)',lineHeight:1.85}}>Captures the upper-end fastball speed a pitcher can reach. It uses the 95th percentile instead of an average or a single maximum.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(78,171,222,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>{isMobile?'Tap':'Hover'} to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(78,171,222,0.25)',borderLeft:'3px solid #4EABDE',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Fastball Velocity Ceiling (Velo P95)</div>
                  <p style={{fontSize:'13px',color:'rgba(245,241,230,0.72)',fontFamily:"'Inter',sans-serif",lineHeight:1.85,margin:0}}>95th percentile of release speed across four-seam fastballs, sinkers, and cutters. This measures a pitcher’s top-end gear without letting one isolated reading define the component.</p>
                </div>
              </div>
            </div>

            {/* 03 — VAA */}
            <div className={`flip-card${flippedCards.has(2)?' flipped':''}`} style={{height:'340px'}} onClick={()=>toggleCard(2)}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(212,175,55,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,var(--gold),transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'var(--gold)',letterSpacing:'0.08em'}}>VAA</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 5%</div>
                  </div>
                  <div className="method-title">Fastball Vertical Approach Angle</div>
                  <p className="method-desc" style={{color:'rgba(245,241,230,0.72)',lineHeight:1.85}}>Measures how flat or steep a fastball enters the plate. PSI+ uses the raw average VAA of four-seam fastballs, sinkers, and cutters.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(212,175,55,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>{isMobile?'Tap':'Hover'} to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(212,175,55,0.25)',borderLeft:'3px solid var(--gold)',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Fastball Vertical Approach Angle (VAA)</div>
                  <p style={{fontSize:'13px',color:'rgba(245,241,230,0.72)',fontFamily:"'Inter',sans-serif",lineHeight:1.85,margin:0}}>Raw average vertical approach angle at the front of home plate for FF, SI, and FC. More negative values indicate a flatter plane. The measure is not adjusted for pitch location.</p>
                </div>
              </div>
            </div>

            {/* 04 — SLWR */}
            <div className={`flip-card${flippedCards.has(3)?' flipped':''}`} style={{height:'340px'}} onClick={()=>toggleCard(3)}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(224,123,84,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,#E07B54,transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'#E07B54',letterSpacing:'0.08em'}}>SLWR</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 5%</div>
                  </div>
                  <div className="method-title">Secondary Leverage Whiff Rate</div>
                  <p className="method-desc" style={{color:'rgba(245,241,230,0.72)',lineHeight:1.85}}>Applies the same count-weighting logic as CLW to eligible secondary pitches. Those whiffs already appear in CLW, so SLWR gives that subset additional emphasis.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(224,123,84,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>{isMobile?'Tap':'Hover'} to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(224,123,84,0.25)',borderLeft:'3px solid #E07B54',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Secondary Leverage Whiff Rate (SLWR)</div>
                  <p style={{fontSize:'13px',color:'rgba(245,241,230,0.72)',fontFamily:"'Inter',sans-serif",lineHeight:1.85,margin:0}}>Applies count-leverage multipliers to breaking balls, changeups, and other eligible off-speed pitches. It is included after a pitcher reaches 50 eligible secondary pitches.</p>
                  <div>
                    <div style={{fontSize:'8px',letterSpacing:'0.18em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px'}}>Fallback weights · {"<"}50 secondary pitches</div>
                    {[['CLW','57.89%'],['Velo','36.84%'],['VAA','5.26%']].map(([lbl,val])=>(
                      <div key={lbl} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid rgba(212,175,55,0.08)'}}>
                        <span style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif"}}>{lbl}</span>
                        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'12px',fontWeight:700,color:'#E07B54'}}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'3px',padding:'8px 14px',marginTop:'auto',fontSize:'10px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",lineHeight:1.6}}>
                    When SLWR is excluded the remaining three weights are rescaled proportionally.
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Why the Name? toggle */}
          <div style={{marginTop:'36px',textAlign:'center'}}>
            <button
              onClick={() => setShowWhyName(v => !v)}
              style={{
                background:'none',border:'none',cursor:'pointer',padding:0,
                fontFamily:"'Inter',sans-serif",fontSize:'10.5px',letterSpacing:'0.18em',
                textTransform:'uppercase',color:'rgba(212,175,55,0.7)',
              }}
            >
              Why the Name? <span style={{display:'inline-block',marginLeft:'6px',transition:'transform 0.2s',transform: showWhyName ? 'rotate(180deg)' : 'rotate(0deg)'}}>▾</span>
            </button>
            {showWhyName && (
              <p style={{fontFamily:"'Playfair Display',serif",fontSize:'clamp(13px,1.4vw,15.5px)',color:'rgba(245,241,230,0.55)',lineHeight:2.1,margin:'20px auto 0',maxWidth:'780px',textAlign:'center'}}>
                PSI+ takes its name from the unit of pressure measurement. Every count carries a different level of consequence. It ranges from getting ahead on the first pitch to putting hitters away with two strikes.{' '}
                <span style={{color:'rgba(245,241,230,0.82)',fontWeight:600}}>The whiff components weight every eligible pitch by the count in which it was thrown.</span>
              </p>
            )}
          </div>
        </section>

        <div className="divider"/>

        {/* ══ LEADERBOARD ══ */}
        <section id="leaderboard" style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Production PSI+{fmtAsOf(asOf) ? ` · Through ${fmtAsOf(asOf)}` : ''}</div>
            <h2 className="sec-title">2026 Season-to-Date Leaderboard</h2>
            <p className="sec-sub">Current-season production scores with a minimum of {minP} eligible pitches. Starters and relievers are normalized separately. A 100 is the mean for the relevant season and role, 110 is about one standard deviation above it, and 120 is about two.</p>
          </div>

          {/* Role tabs */}
          <div style={{display:'flex',marginBottom:'20px',border:'1px solid rgba(212,175,55,0.25)',borderRadius:'4px',overflow:'hidden',width:'fit-content'}}>
            {(['starter','reliever'] as const).map(r=>(
              <button key={r} onClick={()=>{setRole(r);setShowAll(false)}} style={{fontFamily:"'Inter',sans-serif",fontSize:'11px',fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',padding:'10px 24px',cursor:'pointer',border:'none',background:role===r?'rgba(212,175,55,0.12)':'transparent',color:role===r?'var(--gold)':'rgba(245,241,230,0.4)',transition:'all .2s',borderRight:r==='starter'?'1px solid rgba(212,175,55,0.25)':'none'}}>
                {r==='starter'?'Starters':'Relievers'}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="filter-bar">
            <input type="text" placeholder="Search pitcher..." value={search} onChange={e=>{setSearch(e.target.value);setShowAll(false)}}
              style={{fontFamily:"'Inter',sans-serif",fontSize:'11px',padding:'8px 14px',background:'#0d1e35',border:'1px solid rgba(212,175,55,0.25)',borderRadius:'4px',color:'var(--cream)',outline:'none',width:'200px'}}/>
            <select className="filter-select" value={minP} onChange={e=>setMinP(Number(e.target.value))}>
              <option value={200}>Min 200 pitches</option>
              <option value={500}>Min 500 pitches</option>
            </select>
          </div>

          {!lbData ? (
            <div style={{textAlign:'center',padding:'60px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",fontSize:'13px'}}>Loading leaderboard…</div>
          ) : lbData.length === 0 ? (
            <div style={{...card,textAlign:'center',padding:'40px'}}>
              <div style={cardTop}/>
              <div style={{fontSize:'13px',color:'rgba(245,241,230,0.4)',fontFamily:"'Inter',sans-serif",marginBottom:'12px'}}>Leaderboard data not yet loaded.</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.25)',fontFamily:"'Inter',sans-serif",lineHeight:1.8}}>
                Copy your CSVs to <code style={{color:'var(--gold)'}}>~/Desktop/StatPacks/New Stat/</code> and run
                <code style={{color:'var(--gold)'}}> convert_psi_data.py</code>
              </div>
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Inter',sans-serif"}}>
                <thead>
                  <tr style={{borderBottom:'2px solid rgba(212,175,55,0.3)'}}>
                    {([
                      {col:'_rank',    label:'#',          align:'center'},
                      {col:'name',     label:'Pitcher',    align:'left'},
                      {col:'psi',      label:'PSI+',       align:'center'},
                      {col:'k_pct',    label:'K%',         align:'center'},
                      {col:'clw',      label:'CLW',        align:'center'},
                      {col:'velo',     label:'Velo p95',   align:'center'},
                      {col:'vaa',      label:'VAA',        align:'center'},
                      {col:'slwr',     label:'SLWR',       align:'center'},
                    ] as const).map(({col,label,align})=>{
                      const isSort = sort.col === (col as LBKey)
                      const clickable = col !== '_rank'
                      return (
                        <th key={col} onClick={clickable ? ()=>handleSort(col as LBKey) : undefined}
                          style={{textAlign:align,padding:'12px 12px',fontSize:'9px',letterSpacing:'0.18em',color:isSort?'var(--gold)':'rgba(212,175,55,0.7)',textTransform:'uppercase',cursor:clickable?'pointer':'default',whiteSpace:'nowrap',fontWeight:700,userSelect:'none'}}>
                          {label}{isSort?(sort.dir==='desc'?' ↓':' ↑'):''}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? filtered : filtered.slice(0, 10)).map((r, i) => (
                    <tr key={r.id} style={{borderBottom:'1px solid rgba(212,175,55,0.12)',transition:'background .15s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(212,175,55,0.06)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'12px 12px',textAlign:'center',fontSize:'12px',color:'rgba(245,241,230,0.45)',fontFamily:"'Inter',sans-serif"}}>{i+1}</td>
                      <td style={{padding:'12px 12px',textAlign:'left',fontSize:'14px',color:'var(--cream)',fontFamily:"'Inter',sans-serif",fontWeight:600}}>{r.name}</td>
                      <td style={{padding:'12px 12px',textAlign:'center'}}>
                        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'14px',fontWeight:700,color:psiColor(r.psi)}}>{r.psi}</span>
                      </td>
                      <td style={{padding:'12px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',color:'rgba(245,241,230,0.9)'}}>{(r.k_pct * 100).toFixed(1)}%</td>
                      <td style={{padding:'12px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',color:'rgba(245,241,230,0.9)'}}>{r.clw?.toFixed(3)}</td>
                      <td style={{padding:'12px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',color:'rgba(245,241,230,0.9)'}}>{r.velo}</td>
                      <td style={{padding:'12px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',color:'rgba(245,241,230,0.9)'}}>{r.vaa?.toFixed(2)}°</td>
                      <td style={{padding:'12px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',color: r.slwr != null ? 'rgba(245,241,230,0.9)' : 'rgba(245,241,230,0.25)'}}>{r.slwr != null ? r.slwr.toFixed(3) : 'N/A'}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{textAlign:'center',padding:'32px',color:'rgba(245,241,230,0.3)',fontSize:'12px',fontFamily:"'Inter',sans-serif"}}>No pitchers match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Expand / collapse */}
          {filtered.length > 10 && (
            <div style={{textAlign:'center',marginTop:'16px'}}>
              <button onClick={()=>setShowAll(v=>!v)} style={{fontFamily:"'Inter',sans-serif",fontSize:'12px',fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',padding:'13px 36px',cursor:'pointer',border:'2px solid var(--gold)',borderRadius:'4px',background:'rgba(212,175,55,0.1)',color:'var(--gold)',transition:'all .2s',boxShadow:'0 0 24px rgba(212,175,55,0.08)'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(212,175,55,0.18)';(e.currentTarget as HTMLButtonElement).style.boxShadow='0 0 32px rgba(212,175,55,0.18)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(212,175,55,0.1)';(e.currentTarget as HTMLButtonElement).style.boxShadow='0 0 24px rgba(212,175,55,0.08)'}}>
                {showAll ? '↑ Collapse to Top 10' : `↓ Show All ${filtered.length} Pitchers`}
              </button>
            </div>
          )}

          {/* PSI+ color legend */}
          <div style={{display:'flex',gap:'16px',marginTop:'16px',flexWrap:'wrap'}}>
            {[
              {label:'≥ 120', color:'#3ab05a'},
              {label:'110–119', color:'#7ec85a'},
              {label:'90–109', color:'rgba(245,241,230,0.45)'},
              {label:'80–89', color:'#e08060'},
              {label:'< 80', color:'#C44536'},
            ].map(l=>(
              <div key={l.label} style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'10px',color:'rgba(245,241,230,0.4)',fontFamily:"'Inter',sans-serif"}}>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:l.color,flexShrink:0}}/>
                {l.label}
              </div>
            ))}
          </div>
        </section>

        <div className="divider"/>

        {/* ══ PITCHER TRAJECTORY ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Separate Rolling View · Updated Every Appearance</div>
            <h2 className="sec-title">Rolling PSI+ Over Time</h2>
            <p className="sec-sub">This is not the season-to-date leaderboard. Each point uses the pitcher’s previous 1,000 eligible pitches, requires at least 200, and excludes the current appearance.</p>
          </div>

          <div style={{display:'flex',gap:'12px',alignItems:'center',marginBottom:'24px',flexWrap:'wrap'}}>
            <div style={{position:'relative'}}>
              <input type="text" placeholder="Search player…" value={pitcherQ}
                onChange={e=>{setPitcherQ(e.target.value);setShowDrop(true)}}
                onFocus={()=>setShowDrop(true)}
                onBlur={()=>setTimeout(()=>setShowDrop(false),160)}
                style={{fontFamily:"'Inter',sans-serif",fontSize:'13px',padding:'10px 16px',background:'#0d1e35',border:'1px solid rgba(212,175,55,0.3)',borderRadius:'4px',color:'var(--cream)',outline:'none',width:'260px'}}
              />
              {showDrop && suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0d1e35',border:'1px solid rgba(212,175,55,0.22)',borderTop:'none',borderRadius:'0 0 4px 4px',zIndex:20,maxHeight:'240px',overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                  {suggestions.map(p=>(
                    <div key={p.id} onMouseDown={()=>{setSelPitcher(p);setPitcherQ(p.name);setShowDrop(false);loadRolling(p)}}
                      style={{padding:'10px 16px',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:'12px',color:'var(--cream)',borderBottom:'1px solid rgba(212,175,55,0.05)',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'background .12s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(212,175,55,0.07)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <span>{p.name}</span>
                      <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'10px',color:psiColor(p.psi),fontWeight:700}}>{p.psi}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {rollingLoad && <span style={{fontSize:'11px',color:'rgba(245,241,230,0.32)',fontFamily:"'Inter',sans-serif"}}>Loading trajectory data…</span>}
          </div>

          {selPitcher ? (
            <div style={card}>
              <div style={cardTop}/>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px',flexWrap:'wrap',gap:'10px'}}>
                <div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'22px',fontWeight:700,color:'var(--cream)'}}>{selPitcher.name}</div>
                  <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginTop:'3px'}}>Rolling PSI+ · Prior 1,000 eligible pitches · Min 200 · Current appearance excluded</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'28px',fontWeight:700,color:psiColor(selPitcher.psi),lineHeight:1}}>{selPitcher.psi}</div>
                  <div style={{fontSize:'9px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",marginTop:'3px',letterSpacing:'0.1em',textTransform:'uppercase'}}>2026 season-to-date PSI+</div>
                </div>
              </div>

              {trajectoryData.length === 0 ? (
                <div style={{textAlign:'center',padding:'48px',color:'rgba(245,241,230,0.28)',fontSize:'12px',fontFamily:"'Inter',sans-serif"}}>
                  {rolling ? 'No rolling data found for this pitcher.' : 'Loading trajectory…'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trajectoryData} margin={{top:8,right:48,bottom:8,left:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)"/>
                    <XAxis dataKey="date"
                      tick={{fill:'rgba(245,241,230,0.6)',fontSize:isMobile?9:11,fontFamily:'Inter'}}
                      axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}
                      interval={Math.floor(trajectoryData.length / (isMobile ? 4 : 7))}
                      tickFormatter={(d:string)=>{
                        const dt = new Date(d)
                        if (isMobile) return `'${String(dt.getFullYear()).slice(2)}`
                        return `${dt.toLocaleString('en',{month:'short'})} '${String(dt.getFullYear()).slice(2)}`
                      }}/>
                    <YAxis domain={[70,145]}
                      tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}}
                      axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}
                      tickFormatter={(v:number)=>String(v)}
                      width={32}/>
                    <Tooltip cursor={false} content={(p)=><ChartTip {...p} fmt={(v: unknown)=>Number(v).toFixed(1)} />}/>
                    <ReferenceLine y={100} stroke="rgba(245,241,230,0.2)" strokeDasharray="5 4"
                      label={{value:'Avg (100)',fill:'rgba(245,241,230,0.35)',fontSize:10,fontFamily:'Inter',position:'insideTopRight'}}/>
                    <Line type="monotone" dataKey="psi" stroke="#D4AF37" strokeWidth={2.5} dot={false} activeDot={{r:5,fill:'#D4AF37',stroke:'var(--navy)',strokeWidth:2}}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <div style={{background:'rgba(13,30,53,0.4)',border:'1px solid rgba(212,175,55,0.08)',borderRadius:'6px',padding:'56px',textAlign:'center'}}>
              <div style={{fontSize:'13px',color:'rgba(245,241,230,0.25)',fontFamily:"'Inter',sans-serif"}}>{rollingLoad ? 'Loading trajectory data…' : 'Search for a pitcher above to view their rolling PSI+ trajectory.'}</div>
            </div>
          )}
        </section>

        <div className="divider"/>

        {/* ══ CASE STUDIES ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Two Earlier Illustrations</div>
            <h2 className="sec-title">When PSI+ and K% Saw Different Profiles</h2>
            <p className="sec-sub">These examples illustrate what a disagreement can look like. They are not part of the 2025 validation evidence.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'16px',marginBottom:'28px'}}>
            {CASE_STUDIES.map(cs=>{
              const up = cs.type==='PSI+ HIGHER'
              const accentColor = up ? '#3ab05a' : '#C44536'
              return (
                <div key={cs.name} style={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.12)',borderRadius:'6px',padding:'24px',position:'relative',overflow:'hidden'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,${accentColor},transparent)`}}/>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
                    <span style={{fontSize:'8px',fontWeight:700,letterSpacing:'0.2em',fontFamily:"'Inter',sans-serif",color:accentColor,background:`${accentColor}14`,border:`1px solid ${accentColor}30`,borderRadius:'2px',padding:'3px 8px'}}>{cs.type}</span>
                    <span style={{fontSize:'10px',color:'rgba(245,241,230,0.28)',fontFamily:"'Inter',sans-serif"}}>{cs.year}</span>
                  </div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'20px',fontWeight:700,color:'var(--cream)',marginBottom:'16px'}}>{cs.name}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
                    {[
                      {lbl:'K%',      val:cs.kpct,      color:'rgba(245,241,230,0.55)'},
                      {lbl:'PSI+',    val:cs.psi,       color:'var(--gold)'},
                      {lbl:'Next K%', val:cs.next_kpct, color:accentColor},
                    ].map(s=>(
                      <div key={s.lbl} style={{textAlign:'center',background:'rgba(255,255,255,0.03)',borderRadius:'3px',padding:'10px 6px'}}>
                        <div style={{fontSize:'7px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.28)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>{s.lbl}</div>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'13px',fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'14px'}}>
                    <span style={{fontSize:'10px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif"}}>Change:</span>
                    <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'14px',fontWeight:700,color:accentColor}}>{cs.change}</span>
                  </div>
                  <p style={{fontSize:'12px',color:'rgba(245,241,230,0.55)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>{cs.detail}</p>
                </div>
              )
            })}
          </div>

          <div style={{background:'rgba(58,176,90,0.07)',border:'1px solid rgba(58,176,90,0.2)',borderRadius:'4px',padding:'18px 22px'}}>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.75)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>
              Luzardo’s current four-component historical score is <strong style={{color:'#3ab05a'}}>114.6</strong>. Wainwright’s is <strong style={{color:'#3ab05a'}}>78.5</strong>. Both use the same four-component identity as current production PSI+.
            </p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ VALIDATION ══ */}
        <section id="validation" style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Clean Four-Component Reconstruction · 2025 Evaluation</div>
            <h2 className="sec-title">What the 2025 Test Showed</h2>
            <p className="sec-sub">The exact production weights had already been informed by 2025, so they are not presented as a clean 2025 holdout. The public results below come from a four-component reconstruction whose rules and weights were selected using only 2020–2024 information, then evaluated on 2025. It is a validation construction, not a second live PSI+ metric.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:'20px',marginBottom:'24px'}}>
            <div style={card}>
              <div style={cardTop}/>
              <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>2024 to 2025 Stability · n = 150</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',marginBottom:'4px'}}>Year-to-Year Self-Correlation</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.4)',fontFamily:"'Inter',sans-serif",marginBottom:'20px'}}>Same both-year starter cohort for every metric. Higher means more stable.</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={STABILITY} layout="vertical" margin={{left:36,right:64,top:4,bottom:4}}>
                  <XAxis type="number" domain={[0,0.9]} hide/>
                  <YAxis type="category" dataKey="name" tick={{fill:'rgba(245,241,230,0.65)',fontSize:11,fontFamily:'Inter'}} axisLine={false} tickLine={false} width={46}/>
                  <Tooltip cursor={false} content={(p)=><ChartTip {...p} fmt={(v: unknown)=>Number(v).toFixed(4)} />}/>
                  <Bar dataKey="r" radius={[0,3,3,0]} label={{position:'right',fill:'rgba(245,241,230,0.55)',fontSize:10,fontFamily:'Orbitron',fontWeight:700,formatter:(v: unknown)=>Number(v).toFixed(4)}}>
                    {STABILITY.map((s,i)=><Cell key={i} fill={s.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{fontSize:'11px',color:'rgba(245,241,230,0.45)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:'12px 0 0'}}>The clean reconstruction was substantially more stable than K% in this test.</p>
            </div>

            <div style={card}>
              <div style={cardTop}/>
              <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>2024 Predictor to 2025 K% · n = 167</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',marginBottom:'12px'}}>Predictive Correlation</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Inter',sans-serif"}}>
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(212,175,55,0.15)'}}>
                    <th style={{textAlign:'left',padding:'6px 8px',fontSize:'8px',letterSpacing:'0.14em',color:'rgba(212,175,55,0.5)',textTransform:'uppercase'}}>Metric</th>
                    <th style={{textAlign:'center',padding:'6px 8px',fontSize:'8px',letterSpacing:'0.14em',color:'rgba(212,175,55,0.5)',textTransform:'uppercase'}}>Pearson r</th>
                  </tr>
                </thead>
                <tbody>
                  {PREDICTION.map((row,i)=>(
                    <tr key={row.metric} style={{borderBottom:'1px solid rgba(212,175,55,0.05)',background:i%2?'transparent':'rgba(255,255,255,0.01)'}}>
                      <td style={{padding:'10px 8px',fontSize:'12px',fontWeight:row.metric.startsWith('PSI+')?700:500,color:row.metric.startsWith('PSI+')?'var(--gold)':'rgba(245,241,230,0.65)'}}>{row.metric}</td>
                      <td style={{padding:'10px 8px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',fontWeight:row.metric.startsWith('PSI+')?700:400,color:row.metric.startsWith('PSI+')?'#3ab05a':'rgba(245,241,230,0.6)'}}>{row.r.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{fontSize:'11px',color:'rgba(245,241,230,0.45)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:'14px 0 0'}}>Prior K% had the highest point estimate. PSI+ came nearly even and was numerically above SwStr% and CSW%.</p>
            </div>
          </div>

          <div style={{...card,marginBottom:'24px'}}>
            <div style={cardTop}/>
            <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>Paired Comparisons</div>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.68)',fontFamily:"'Inter',sans-serif",lineHeight:1.8,margin:0}}>The paired comparison did not establish superiority over SwStr%. The paired advantage over CSW% was narrow. These results support describing PSI+ as nearly even with prior K%, numerically above the two pitch-level benchmarks, and more stable than K% in this cohort.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:'12px',marginBottom:'16px'}}>
            {[
              {label:'Disagreement greater than 0.5 SD', val:'66.2%', sub:'47 correct directions in 71 cases', color:'var(--gold)'},
              {label:'Disagreement greater than 1.0 SD', val:'83.3%', sub:'15 correct directions in 18 cases', color:'#3ab05a'},
            ].map(s=>(
              <div key={s.label} style={{background:'rgba(13,30,53,0.8)',border:'1px solid rgba(212,175,55,0.1)',borderRadius:'4px',padding:'18px 20px'}}>
                <div style={{fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.55)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px',lineHeight:1.5}}>{s.label}</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'24px',fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:'11px',color:'rgba(245,241,230,0.55)',fontFamily:"'Inter',sans-serif",marginTop:'7px'}}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={{background:'rgba(78,171,222,0.06)',border:'1px solid rgba(78,171,222,0.18)',borderRadius:'4px',padding:'18px 22px'}}>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.7)',fontFamily:"'Inter',sans-serif",lineHeight:1.8,margin:0}}>At the 0.5 SD threshold, the direction was above 50% in the 2024 to 2025 held-out test, but incremental lift over ordinary regression remained uncertain. The 1 SD result was stronger, but only 18 cases cleared that bar. This is one held-out outcome-season pair.</p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ FORMULA HISTORY ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Historical Development</div>
            <h2 className="sec-title">How the Formula Reached Four Components</h2>
            <p className="sec-sub">PSI+ originally began with CLW, fastball velocity ceiling, and VAA at 60%, 30%, and 10%. That construction leaned too heavily on fastball traits, so SLWR was added to give secondary-pitch swing-and-miss more representation.</p>
          </div>
          <div style={{...card,maxWidth:'760px',margin:'0 auto'}}>
            <div style={cardTop}/>
            <div style={{fontSize:'9px',letterSpacing:'0.2em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'10px'}}>Current Production PSI+</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px'}}>
              {[
                {label:'CLW', val:'55%'},
                {label:'Fastball Velocity Ceiling', val:'35%'},
                {label:'VAA', val:'5%'},
                {label:'SLWR', val:'5%'},
              ].map(row=>(
                <div key={row.label} style={{display:'flex',justifyContent:'space-between',gap:'12px',padding:'10px 12px',background:'rgba(255,255,255,0.025)',borderRadius:'3px'}}>
                  <span style={{fontSize:'11px',color:'rgba(245,241,230,0.7)',fontFamily:"'Inter',sans-serif"}}>{row.label}</span>
                  <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'12px',fontWeight:700,color:'var(--gold)'}}>{row.val}</span>
                </div>
              ))}
            </div>
            <p style={{fontSize:'11px',color:'rgba(245,241,230,0.38)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:'14px 0 0'}}>When SLWR is unavailable below 50 eligible secondary pitches, the other three production weights are rescaled proportionally.</p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ METHODOLOGY SUMMARY ══ */}
        <section style={{...sec,paddingTop:'60px'}}>
          <div className="sec-header">
            <div className="sec-eyebrow">Public Methodology</div>
            <h2 className="sec-title">Production and Validation Boundaries</h2>
            <p className="sec-sub">Production PSI+ is the season-and-role normalized 55/35/5/5 score used on the live leaderboard. The clean reconstruction exists only to evaluate the four-component idea on 2025.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'10px'}}>
            {METHOD_SPECS.map(f=>(
              <div key={f.label} style={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.1)',borderRadius:'4px',padding:'16px 18px'}}>
                <div style={{fontSize:'8px',letterSpacing:'0.18em',color:'rgba(212,175,55,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'6px'}}>{f.label}</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'12px',fontWeight:700,color:'var(--cream)',lineHeight:1.3,marginBottom:'5px'}}>{f.val}</div>
                <div style={{fontSize:'10px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif"}}>{f.sub}</div>
              </div>
            ))}
          </div>
          <div style={{background:'rgba(212,175,55,0.05)',border:'1px solid rgba(212,175,55,0.14)',borderRadius:'4px',padding:'16px 20px',marginTop:'16px'}}>
            <p style={{fontSize:'12px',color:'rgba(245,241,230,0.58)',fontFamily:"'Inter',sans-serif",lineHeight:1.8,margin:0}}>A score of 100 is the mean for the relevant season and role population. A 110 is about one standard deviation above that mean, and a 120 is about two. PSI+ points are standardized distances, not percentages above average.</p>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand">Stat<span>Packs</span></div>
        <div className="footer-tagline">Built on Data. Tracked Transparently.</div>
        <div className="footer-sub">PSI+ is a StatPacks original metric. Public 2025 results use a clean four-component reconstruction fixed from 2020–2024 information.</div>
        <div className="footer-line"/>
        <div className="footer-copy">© 2026 StatPacks · statpacks.app</div>
      </footer>
    </>
  )
}
