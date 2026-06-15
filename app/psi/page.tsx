'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Cell,
} from 'recharts'

/* ───── Types ───── */
interface LBRow {
  id: string; name: string; psi: number; role: string
  k_pct: number; clw: number; velo: number; vaa: number; n: number
}
interface SignalRow { signal: string; yoy_r: number; same_r: number; cat: string }
interface WeightRow { w_clw: number; w_velo: number; w_vaa: number; hold_starter: number; hold_all: number }
interface RollingRow { id: string; date: string; psi: number; clw: number; velo: number; vaa: number; n: number }

/* ───── Hardcoded validation data ───── */
const STABILITY = [
  { name: 'PSI+',  r: 0.769, color: '#3ab05a' },
  { name: 'K%',    r: 0.669, color: '#4EABDE' },
  { name: 'CSW%',  r: 0.590, color: '#D4AF37' },
]

const CORR_TABLE = [
  { metric: 'PSI+',   all: 0.5815, starters: 0.6799, relievers: 0.5136 },
  { metric: 'CSW%',   all: 0.5416, starters: 0.5930, relievers: 0.4285 },
  { metric: 'SwStr%', all: 0.6049, starters: 0.6423, relievers: 0.5227 },
]

const QUARTILE_S = [
  { q: 'Q1 (Low)',  k: 18.1 },
  { q: 'Q2',        k: 19.5 },
  { q: 'Q3',        k: 22.4 },
  { q: 'Q4 (High)', k: 26.3 },
]

const QUARTILE_R = [
  { q: 'Q1 (Low)',  k: 21.6 },
  { q: 'Q2',        k: 22.6 },
  { q: 'Q3',        k: 24.8 },
  { q: 'Q4 (High)', k: 28.4 },
]

const CASE_STUDIES = [
  {
    type: 'UNDERRATED', name: 'Jesús Luzardo', year: 2021,
    kpct: '22.5%', psi: '114.2', next_kpct: '29.9%', change: '+7.4pp',
    quote: '"One of the first cases where I went back and double-checked the number. A 22.5% K rate doesn\'t look like a pitcher worth flagging, and 114.2 felt too high. But the two-strike whiff data was clean. It wasn\'t noise."',
  },
  {
    type: 'OVERRATED', name: 'Adam Wainwright', year: 2022,
    kpct: '17.8%', psi: '80.0', next_kpct: '11.4%', change: '−6.4pp',
    quote: '"PSI+ had been saying it was coming for a while."',
  },
  {
    type: 'UNDERRATED', name: 'Zack Wheeler', year: 2020,
    kpct: '18.5%', psi: '105.8', next_kpct: '29.1%', change: '+10.6pp',
    quote: '"A 10.6 point jump the following year is the kind of movement that makes you want to go find the next Wheeler. That\'s the whole point of building this."',
  },
]

const FAILED = [
  {
    name: 'Geometric Pitch Tunneling (AIS)',
    desc: 'Measured how similar two pitches look to a hitter before they break in different directions.',
    result: 'YoY r = 0.15. Too weak.',
  },
  {
    name: 'Outcome-Based Sequencing (OBAI)',
    desc: 'Whether throwing one type of pitch made the next pitch harder to hit. We analyzed over 2 million consecutive pitch pairs with adjusted baselines.',
    result: 'YoY r ≈ 0. Essentially zero.',
  },
]

const METHOD_SPECS = [
  { label: 'Data Source',      val: 'Baseball Savant', sub: '3.6M pitches, 2020–2026' },
  { label: 'Training Period',  val: '2020–2024',       sub: '2,060 pitcher-seasons' },
  { label: 'Holdout',          val: '2025 Season',     sub: '473 pitcher-seasons, untouched' },
  { label: 'Role Detection',   val: '≥ 45 P / app',   sub: 'avg pitches per appearance' },
  { label: 'Normalization',    val: 'p2 / p98 clip',   sub: 'within role, scaled 0–1' },
  { label: 'Scaling',          val: '100 = avg',       sub: 'SD = 10 points' },
  { label: 'Rolling Window',   val: '1,000 pitches',   sub: 'min 200, strictly pre-game' },
  { label: 'Qualifier',        val: '500 pitches',     sub: 'season min / 200 rolling' },
]

/* ───── Custom Tooltip ───── */
function ChartTip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.22)',borderRadius:'4px',padding:'8px 12px',fontFamily:'Inter',fontSize:'11px',pointerEvents:'none'}}>
      {label && <div style={{color:'#D4AF37',fontWeight:600,marginBottom:'4px'}}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{color:'#F5F1E6'}}>{p.name}: {fmt ? fmt(p.value) : p.value}</div>
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

function fmtSignal(s: string) {
  return s.replace(/_/g, ' ').replace(/\bpct\b/gi, '%').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 30)
}

type LBKey = keyof LBRow
type SortDir = 'asc' | 'desc'

/* ───── Component ───── */
export default function PSIPage() {
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [role,          setRole]          = useState<'starter'|'reliever'>('starter')
  const [lbData,        setLbData]        = useState<LBRow[]|null>(null)
  const [signals,       setSignals]       = useState<SignalRow[]|null>(null)
  const [weights,       setWeights]       = useState<WeightRow[]|null>(null)
  const [rolling,       setRolling]       = useState<RollingRow[]|null>(null)
  const [rollingLoad,   setRollingLoad]   = useState(false)
  const [sort,          setSort]          = useState<{col: LBKey; dir: SortDir}>({col:'psi',dir:'desc'})
  const [search,        setSearch]        = useState('')
  const [minP,          setMinP]          = useState(200)
  const [pitcherQ,      setPitcherQ]      = useState('')
  const [selPitcher,    setSelPitcher]    = useState<LBRow|null>(null)
  const [showDrop,      setShowDrop]      = useState(false)
  const [qTab,          setQTab]          = useState<'starters'|'relievers'>('starters')
  const [showAll,       setShowAll]       = useState(false)

  useEffect(() => {
    fetch('/data/psi_leaderboard_2026.json').then(r=>r.json()).then(data=>{
      setLbData(data)
      // Default trajectory to Dylan Cease
      const cease = data.find((p: LBRow) => p.name.toLowerCase().includes('cease'))
      if (cease) {
        setSelPitcher(cease)
        setPitcherQ(cease.name)
      }
    }).catch(()=>setLbData([]))
    fetch('/data/psi_signals.json').then(r=>r.json()).then(setSignals).catch(()=>setSignals([]))
    fetch('/data/psi_weights.json').then(r=>r.json()).then(setWeights).catch(()=>setWeights([]))
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

  /* Trajectory derived */
  const suggestions = pitcherQ.length >= 2
    ? (lbData ?? []).filter(r => r.name.toLowerCase().includes(pitcherQ.toLowerCase())).slice(0, 8)
    : []

  const trajectoryData = selPitcher && rolling
    ? rolling.filter(r => r.id === selPitcher.id).sort((a,b) => a.date.localeCompare(b.date))
    : []

  /* Heat map color */
  const wMin = weights && weights.length ? Math.min(...weights.map(w=>w.hold_starter)) : 0.55
  const wMax = weights && weights.length ? Math.max(...weights.map(w=>w.hold_starter)) : 0.72
  const heatColor = (v: number) => {
    const t = Math.max(0, Math.min(1, (v - wMin) / (wMax - wMin)))
    const r = Math.round(196 + (58-196)*t), g = Math.round(69+(176-69)*t), b = Math.round(54+(90-54)*t)
    return `rgb(${r},${g},${b})`
  }

  /* Signal chart data */
  const sigChart = (signals && signals.length > 0)
    ? signals.slice(0,20).map(s => ({ name: fmtSignal(s.signal), r: s.yoy_r, cat: s.cat }))
    : null

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
          <Link href="/#method">About</Link>
        </div>
        <button className={`nav-hamburger${menuOpen?' open':''}`} aria-label="Menu" onClick={()=>setMenuOpen(o=>!o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen?' open':''}`}>
        <Link href="/"           onClick={()=>setMenuOpen(false)}>Home</Link>
        <Link href="/psi"        onClick={()=>setMenuOpen(false)} style={{color:'var(--gold)'}}>PSI+</Link>
        <Link href="/#picks"     onClick={()=>setMenuOpen(false)}>Picks</Link>
        <Link href="/performance"onClick={()=>setMenuOpen(false)}>Performance</Link>
        <Link href="/#method"    onClick={()=>setMenuOpen(false)}>About</Link>
      </div>

      <main style={{minHeight:'100vh',paddingBottom:'80px'}}>

        {/* ══ HERO ══ */}
        <section style={{background:'var(--navy)',padding:'45px 40px 40px',textAlign:'center',borderBottom:'2px solid rgba(212,175,55,0.15)',position:'relative',overflow:'hidden'}}>
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
            <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap',marginBottom:'28px'}}>
              <a href="#leaderboard" className="btn btn-primary">2026 Leaderboard</a>
              <a href="#validation"  className="btn btn-secondary">Validation Results</a>
            </div>
            <div style={{display:'flex',gap:'10px',justifyContent:'center',flexWrap:'wrap'}}>
              {[
                'Built on 2020–2024 data',
                'Blind-tested on 2025 season',
                'Count leverage · Velocity · Pitch angle',
              ].map(k=>(
                <div key={k} style={{background:'rgba(13,30,53,0.85)',border:'1px solid rgba(212,175,55,0.18)',borderRadius:'4px',padding:'10px 20px',textAlign:'center'}}>
                  <div style={{fontSize:'12px',fontWeight:600,color:'var(--cream)',fontFamily:"'Inter',sans-serif"}}>{k}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:'14px',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.22)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>
              Last updated: June 15, 2026
            </div>
            <div style={{marginTop:'32px',paddingTop:'28px',borderTop:'1px solid rgba(212,175,55,0.12)'}}>
              <p style={{fontFamily:"'Playfair Display',serif",fontSize:'clamp(13px,1.4vw,15.5px)',color:'rgba(245,241,230,0.55)',lineHeight:2.1,margin:'0 auto',maxWidth:'780px',textAlign:'center'}}>
                PSI+ takes its name from the unit of pressure measurement. Every pitch carries a different level of consequence. It ranges from getting ahead on the first pitch to putting hitters away when they are vulnerable to avoiding the counts where leverage flips back to the hitter.{' '}
                <span style={{color:'rgba(245,241,230,0.82)',fontWeight:600}}>PSI+ weights every pitch by the pressure of the moment it was thrown in.</span>{' '}
                That is where the name comes from.
              </p>
            </div>
          </div>
        </section>

        {/* ══ LEADERBOARD ══ */}
        <section id="leaderboard" style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">2026 Season · Through June 15</div>
            <h2 className="sec-title">Leaderboard</h2>
            <p className="sec-sub">Minimum {minP} pitches. Scored within role. 100 = league average.</p>
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
              <option value={100}>Min 100 pitches</option>
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
                      {col:'n',        label:'Pitches',    align:'center'},
                    ] as const).map(({col,label,align})=>{
                      const isSort = sort.col === (col as LBKey)
                      const clickable = col !== '_rank'
                      return (
                        <th key={col} onClick={clickable ? ()=>handleSort(col as LBKey) : undefined}
                          style={{textAlign:align as any,padding:'12px 12px',fontSize:'9px',letterSpacing:'0.18em',color:isSort?'var(--gold)':'rgba(212,175,55,0.7)',textTransform:'uppercase',cursor:clickable?'pointer':'default',whiteSpace:'nowrap',fontWeight:700,userSelect:'none'}}>
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
                      <td style={{padding:'12px 12px',textAlign:'center',fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif"}}>{r.n?.toLocaleString()}</td>
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
            <div className="sec-eyebrow">1,000-Pitch Rolling Window · Updated Every Start</div>
            <h2 className="sec-title">Rolling PSI+ Over Time</h2>
            <p className="sec-sub">Track how a pitcher's strikeout ability has evolved across starts. Searches 2026 qualifying pitchers.</p>
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
                  <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginTop:'3px'}}>Rolling PSI+ · 1,000-pitch window · 2020–2026</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'28px',fontWeight:700,color:psiColor(selPitcher.psi),lineHeight:1}}>{selPitcher.psi}</div>
                  <div style={{fontSize:'9px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",marginTop:'3px',letterSpacing:'0.1em',textTransform:'uppercase'}}>2026 PSI+</div>
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
                      tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}}
                      axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}
                      interval={Math.floor(trajectoryData.length / 7)}
                      tickFormatter={(d:string)=>{
                        const dt = new Date(d)
                        return `${dt.toLocaleString('en',{month:'short'})} '${String(dt.getFullYear()).slice(2)}`
                      }}/>
                    <YAxis domain={[70,145]}
                      tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}}
                      axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}
                      tickFormatter={(v:number)=>String(v)}
                      width={32}/>
                    <Tooltip content={(p:any)=><ChartTip {...p} fmt={(v:any)=>Number(v).toFixed(1)} />}/>
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

        {/* ══ COMPONENT DEEP DIVE ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Four Components · Starters and Relievers Scored Separately</div>
            <h2 className="sec-title">What Goes Into PSI+</h2>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'16px'}}>

            {/* 01 — CLW */}
            <div className="flip-card" style={{height:'340px'}}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(58,176,90,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,#3ab05a,transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'#3ab05a',letterSpacing:'0.08em'}}>CLW</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 55%</div>
                  </div>
                  <div className="method-title">Count-Leveraged Whiff Rate</div>
                  <p className="method-desc">Measures how often a pitcher misses bats when it matters most. Two-strike whiffs count double. First-pitch misses count half. The heaviest component in PSI+.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(58,176,90,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>Hover to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(58,176,90,0.25)',borderLeft:'3px solid #3ab05a',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Count-Leveraged Whiff Rate (CLW)</div>
                  <p style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>Pitches are weighted by count leverage before calculating whiff rate.</p>
                  <div>
                    <div style={{fontSize:'8px',letterSpacing:'0.18em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px'}}>Count Weights</div>
                    {[['Two-strike','2.0×'],['First-pitch','0.5×'],['All others','1.0×']].map(([lbl,val])=>(
                      <div key={lbl} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(212,175,55,0.08)'}}>
                        <span style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif"}}>{lbl}</span>
                        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'13px',fontWeight:700,color:'#3ab05a'}}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'3px',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'auto'}}>
                    <span style={{fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>YoY correlation</span>
                    <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'16px',fontWeight:700,color:'#3ab05a'}}>r = 0.5818</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 02 — VELO P95 */}
            <div className="flip-card" style={{height:'340px'}}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(78,171,222,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,#4EABDE,transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'#4EABDE',letterSpacing:'0.08em'}}>VELO P95</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 35%</div>
                  </div>
                  <div className="method-title">Fastball Velocity Ceiling</div>
                  <p className="method-desc">Captures the top-end speed a pitcher can reach when the moment demands it. Not average velocity — the high gear they can access in big counts.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(78,171,222,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>Hover to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(78,171,222,0.25)',borderLeft:'3px solid #4EABDE',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Fastball Velocity Ceiling (Velo P95)</div>
                  <p style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>95th percentile of release speed across four-seam fastballs, sinkers, and cutters. Rewards the ability to reach back for more.</p>
                  <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'3px',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'auto'}}>
                    <span style={{fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>YoY correlation</span>
                    <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'16px',fontWeight:700,color:'#4EABDE'}}>r = 0.4815</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 03 — VAA */}
            <div className="flip-card" style={{height:'340px'}}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(212,175,55,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,var(--gold),transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'var(--gold)',letterSpacing:'0.08em'}}>VAA</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 5%</div>
                  </div>
                  <div className="method-title">Fastball Vertical Approach Angle</div>
                  <p className="method-desc">Measures how flat or steep a fastball enters the strike zone. Flatter angles are harder for hitters to square up. A smaller component, but stable year over year.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(212,175,55,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>Hover to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(212,175,55,0.25)',borderLeft:'3px solid var(--gold)',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Fastball Vertical Approach Angle (VAA)</div>
                  <p style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>Mean vertical approach angle of fastballs at the front of home plate. More negative values indicate a flatter plane into the zone.</p>
                  <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'3px',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'auto'}}>
                    <span style={{fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>YoY correlation</span>
                    <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'16px',fontWeight:700,color:'var(--gold)'}}>r = 0.4159</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 04 — SLWR */}
            <div className="flip-card" style={{height:'340px'}}>
              <div className="flip-card-inner">
                <div className="flip-card-front" style={{background:'var(--surf)',border:'1px solid rgba(224,123,84,0.25)',padding:'26px'}}>
                  <div style={{position:'absolute',top:0,left:0,bottom:0,width:'2px',background:'linear-gradient(180deg,transparent,#E07B54,transparent)'}}/>

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:'#E07B54',letterSpacing:'0.08em'}}>SLWR</div>
                    <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: 5%</div>
                  </div>
                  <div className="method-title">Secondary Leverage Whiff Rate</div>
                  <p className="method-desc">The same count-leverage logic as CLW, applied only to secondary pitches — breaking balls, changeups, and off-speed offerings. Only included when a pitcher has thrown at least 50 secondary pitches.</p>
                  <div style={{position:'absolute',bottom:'18px',left:0,right:0,textAlign:'center',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(224,123,84,0.4)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>Hover to see the formula ↺</div>
                </div>
                <div className="flip-card-back" style={{background:'#0c1b30',border:'1px solid rgba(224,123,84,0.25)',borderLeft:'3px solid #E07B54',padding:'26px',display:'flex',flexDirection:'column',gap:'14px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',lineHeight:1.4}}>Secondary Leverage Whiff Rate (SLWR)</div>
                  <p style={{fontSize:'12px',color:'rgba(245,241,230,0.6)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>Applies count-leverage multipliers to whiffs on breaking balls, changeups, and off-speed pitches. New in PSI+ v2.</p>
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
                    When SLWR is excluded, the remaining three weights are rescaled proportionally.
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Notable 2026 findings */}
          <div style={{marginTop:'40px'}}>
            <div style={{fontSize:'9px',letterSpacing:'0.25em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'14px'}}>Notable 2026 Findings</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'12px'}}>
              {[
                {
                  name:'Cristopher Sánchez', stat:'#2 Starter by PSI+', color:'#3ab05a',
                  detail:'−6.92° approach angle (98th percentile) · CLW 98th percentile · 96.6 mph velocity. A sinker-ball pitcher outsmarting hitters rather than overpowering them. The clearest example of what PSI+ finds that raw K% misses.',
                },
                {
                  name:'Max Scherzer', stat:'PSI+ 82.6, declining trajectory', color:'#C44536',
                  detail:'Rolling PSI+ across starts: 97.7 → 97.0 → 95.8 → 93.6 → 92.2. Velocity slipping from 95.2 to 94.8 mph. PSI+ picked up the slide before the K rate did.',
                },
              ].map(f=>(
                <div key={f.name} style={{background:'#0d1e35',border:`1px solid ${f.color}28`,borderLeft:`3px solid ${f.color}`,borderRadius:'4px',padding:'16px 18px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:'17px',fontWeight:700,color:'var(--cream)',marginBottom:'3px'}}>{f.name}</div>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'10px',color:f.color,letterSpacing:'0.06em',marginBottom:'10px'}}>{f.stat}</div>
                  <p style={{fontSize:'12px',color:'rgba(245,241,230,0.5)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>{f.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ CASE STUDIES ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Case Studies · 2020–2024</div>
            <h2 className="sec-title">Where K% Missed, PSI+ Didn't</h2>
            <p className="sec-sub">Pitchers where PSI+ disagreed with their raw strikeout rate. The following season showed who was right.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'16px',marginBottom:'28px'}}>
            {CASE_STUDIES.map(cs=>{
              const up = cs.type==='UNDERRATED'
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
                  <p style={{fontSize:'12px',fontStyle:'italic',color:'rgba(245,241,230,0.5)',fontFamily:"'Playfair Display',serif",lineHeight:1.7,margin:0}}>{cs.quote}</p>
                </div>
              )
            })}
          </div>

          <div style={{background:'rgba(58,176,90,0.07)',border:'1px solid rgba(58,176,90,0.2)',borderRadius:'4px',padding:'18px 22px'}}>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.75)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>
              When PSI+ disagreed sharply with a pitcher's raw K% rate, it was right <strong style={{color:'#3ab05a'}}>58.8% of the time</strong> across 260 cases.
              The overrated signal is especially reliable: when PSI+ flagged a pitcher as due for regression, it was correct <strong style={{color:'#3ab05a'}}>82.3% of the time</strong>.
            </p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ VALIDATION ══ */}
        <section id="validation" style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Blind Test · 2025 Season</div>
            <h2 className="sec-title">Does It Actually Work?</h2>
            <p className="sec-sub">PSI+ was built entirely on pre-2025 data. Then we tested it on 2025 pitchers the model had never seen. Every result below is from that blind test.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:'20px',marginBottom:'24px'}}>

            {/* Stability chart */}
            <div style={card}>
              <div style={cardTop}/>
              <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>Year-over-Year Consistency</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',marginBottom:'4px'}}>Is PSI+ Consistent Year to Year?</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginBottom:'20px'}}>Starters · Higher = more consistent from year to year</div>
              <ResponsiveContainer width="100%" height={148}>
                <BarChart data={STABILITY} layout="vertical" margin={{left:36,right:56,top:4,bottom:4}}>
                  <XAxis type="number" domain={[0,0.9]} hide/>
                  <YAxis type="category" dataKey="name" tick={{fill:'rgba(245,241,230,0.65)',fontSize:12,fontFamily:'Inter'}} axisLine={false} tickLine={false} width={34}/>
                  <Tooltip content={(p:any)=><ChartTip {...p} fmt={(v:any)=>Number(v).toFixed(3)} />}/>
                  <Bar dataKey="r" radius={[0,3,3,0]} label={{position:'right',fill:'rgba(245,241,230,0.55)',fontSize:11,fontFamily:'Orbitron',fontWeight:700,formatter:(v:any)=>Number(v).toFixed(3)}}>
                    {STABILITY.map((s,i)=><Cell key={i} fill={s.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Correlation table */}
            <div style={card}>
              <div style={cardTop}/>
              <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>2024 Metric Predicting 2025 K%</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',marginBottom:'4px'}}>Predictive Accuracy</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginBottom:'6px'}}>306 pitchers with back-to-back seasons</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.4)',fontFamily:"'Inter',sans-serif",fontStyle:'italic',marginBottom:'16px'}}>r measures predictive accuracy — closer to 1.0 means better.</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Inter',sans-serif"}}>
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(212,175,55,0.15)'}}>
                    {['Metric','All','Starters','Relievers'].map(h=>(
                      <th key={h} style={{textAlign:h==='Metric'?'left':'center',padding:'6px 8px',fontSize:'8px',letterSpacing:'0.14em',color:'rgba(212,175,55,0.5)',textTransform:'uppercase',fontWeight:700}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CORR_TABLE.map((row,i)=>(
                    <tr key={row.metric} style={{borderBottom:'1px solid rgba(212,175,55,0.05)',background:i%2?'transparent':'rgba(255,255,255,0.01)'}}>
                      <td style={{padding:'10px 8px',fontSize:'13px',fontWeight:row.metric==='PSI+'?700:500,color:row.metric==='PSI+'?'var(--gold)':'rgba(245,241,230,0.65)'}}>{row.metric}</td>
                      <td style={{padding:'10px 8px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.6)'}}>{row.all}</td>
                      <td style={{padding:'10px 8px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'12px',fontWeight:row.metric==='PSI+'?700:400,color:row.metric==='PSI+'?'#3ab05a':'rgba(245,241,230,0.6)'}}>{row.starters}</td>
                      <td style={{padding:'10px 8px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.6)'}}>{row.relievers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{fontSize:'10px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",marginTop:'14px',lineHeight:1.6,margin:'14px 0 0'}}>
                SwStr% edges PSI+ in the overall numbers. PSI+ pulls ahead when you look at starters specifically, and holds up better from year to year.
              </p>
            </div>
          </div>

          {/* Quartile K% chart */}
          <div style={card}>
            <div style={cardTop}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
              <div>
                <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>Does a High PSI+ Mean More Strikeouts?</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)'}}>2025 K% by 2024 PSI+ Quartile</div>
                <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginTop:'4px'}}>Bottom 25% vs. top 25% of PSI+ scores, grouped by role.</div>
              </div>
              <div style={{display:'flex',border:'1px solid rgba(212,175,55,0.25)',borderRadius:'4px',overflow:'hidden'}}>
                {(['starters','relievers'] as const).map(t=>(
                  <button key={t} onClick={()=>setQTab(t)} style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',padding:'8px 16px',cursor:'pointer',border:'none',background:qTab===t?'rgba(212,175,55,0.12)':'transparent',color:qTab===t?'var(--gold)':'rgba(245,241,230,0.4)',borderRight:t==='starters'?'1px solid rgba(212,175,55,0.25)':'none'}}>
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={qTab==='starters'?QUARTILE_S:QUARTILE_R} margin={{top:16,right:24,bottom:0,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" vertical={false}/>
                <XAxis dataKey="q" tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}} axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}/>
                <YAxis domain={[14,30]} tickFormatter={v=>`${v}%`} tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}} axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}/>
                <Tooltip content={(p:any)=><ChartTip {...p} fmt={(v:any)=>`${v}%`} />}/>
                <Bar dataKey="k" radius={[3,3,0,0]} activeBar={false} label={{position:'top',fill:'rgba(245,241,230,0.65)',fontSize:11,fontFamily:'Orbitron',fontWeight:700,formatter:(v:any)=>`${v}%`}}>
                  {(qTab==='starters'?QUARTILE_S:QUARTILE_R).map((_,i)=>(
                    <Cell key={i} fill={i===3?'#3ab05a':i===2?'rgba(212,175,55,0.65)':i===1?'rgba(212,175,55,0.38)':'rgba(196,69,54,0.55)'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Accuracy tiles */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px',marginTop:'16px'}}>
            {[
              {label:'Overall accuracy when PSI+ disagreed with K%', val:'58.8%', sub:'153 of 260 cases',                     color:'var(--gold)'},
              {label:'Accuracy flagging underrated pitchers',         val:'51.5%', sub:'PSI+ high, K% rose the next year',      color:'#4EABDE'},
              {label:'Accuracy flagging overrated pitchers',          val:'82.3%', sub:'PSI+ low, K% fell the next year',       color:'#3ab05a'},
            ].map(s=>(
              <div key={s.label} style={{background:'rgba(13,30,53,0.8)',border:'1px solid rgba(212,175,55,0.1)',borderRadius:'4px',padding:'16px 18px'}}>
                <div style={{fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.55)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px',lineHeight:1.5}}>{s.label}</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'24px',fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:'11px',color:'rgba(245,241,230,0.55)',fontFamily:"'Inter',sans-serif",marginTop:'6px'}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="divider"/>

        {/* ══ SIGNAL DISCOVERY ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">What We Tested · How We Chose the Components</div>
            <h2 className="sec-title">How We Found the Signal</h2>
            <p className="sec-sub">We tested 51 different pitcher stats to find which ones best predict future strikeout rate. Most well-known stats fell short. The ones that made it into PSI+ are the ones that actually held up.</p>
          </div>

          {/* Key callout — always visible */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px',marginBottom:'32px'}}>
            {[
              {label:'Count-Lev. Whiff (CLW)', r:'0.5818', cat:'Novel: PSI+ Component', color:'#3ab05a'},
              {label:'CSW%',                   r:'0.4892', cat:'Industry Benchmark',      color:'rgba(212,175,55,0.6)'},
              {label:'SwStr%',                 r:'0.4900', cat:'Known Public Signal',     color:'rgba(78,171,222,0.6)'},
            ].map(s=>(
              <div key={s.label} style={{background:'rgba(13,30,53,0.85)',border:`1px solid ${s.color}44`,borderRadius:'4px',padding:'16px 20px'}}>
                <div style={{fontSize:'8px',letterSpacing:'0.18em',color:s.color,fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'6px'}}>{s.cat}</div>
                <div style={{fontSize:'12px',color:'var(--cream)',fontFamily:"'Inter',sans-serif",fontWeight:600,marginBottom:'8px'}}>{s.label}</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'20px',fontWeight:700,color:s.color}}>r = {s.r}</div>
              </div>
            ))}
          </div>

          {sigChart && sigChart.length > 0 ? (
            <>
              <div style={{display:'flex',gap:'20px',flexWrap:'wrap',marginBottom:'16px'}}>
                {[
                  {label:'Novel (PSI+ component)', color:'#3ab05a'},
                  {label:'Benchmark (CSW%, SwStr%)', color:'rgba(212,175,55,0.6)'},
                  {label:'Known public signal', color:'rgba(78,171,222,0.6)'},
                ].map(l=>(
                  <div key={l.label} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'10px',color:'rgba(245,241,230,0.45)',fontFamily:"'Inter',sans-serif"}}>
                    <div style={{width:'10px',height:'10px',background:l.color,borderRadius:'2px',flexShrink:0}}/>
                    {l.label}
                  </div>
                ))}
              </div>
              <div style={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.12)',borderRadius:'6px',padding:'20px 20px 20px 0'}}>
                <ResponsiveContainer width="100%" height={520}>
                  <BarChart data={sigChart} layout="vertical" margin={{left:172,right:48,top:4,bottom:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" horizontal={false}/>
                    <XAxis type="number" domain={[0,0.68]} tickFormatter={v=>v.toFixed(2)} tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}} axisLine={{stroke:'rgba(245,241,230,0.1)'}} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fill:'rgba(245,241,230,0.7)',fontSize:11,fontFamily:'Inter'}} axisLine={false} tickLine={false} width={168}/>
                    <Tooltip content={(p:any)=><ChartTip {...p} fmt={(v:any)=>Number(v).toFixed(4)} />}/>
                    <Bar dataKey="r" radius={[0,3,3,0]} label={{position:'right',fill:'rgba(245,241,230,0.45)',fontSize:9,fontFamily:'Inter',formatter:(v:any)=>Number(v).toFixed(4)}}>
                      {sigChart.map((s,i)=>(
                        <Cell key={i} fill={s.cat==='NOVEL'?'#3ab05a':s.cat==='BENCHMARK'?'rgba(212,175,55,0.55)':'rgba(78,171,222,0.55)'}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : signals !== null && signals.length === 0 ? (
            <div style={{...card,textAlign:'center',padding:'32px'}}>
              <div style={{fontSize:'12px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif"}}>Full signal chart loads from psi_signals.json. Run convert_psi_data.py to generate it.</div>
            </div>
          ) : null}

          <div style={{background:'rgba(58,176,90,0.07)',border:'1px solid rgba(58,176,90,0.2)',borderRadius:'4px',padding:'18px 22px',marginTop:'28px'}}>
            <div style={{fontSize:'9px',letterSpacing:'0.2em',color:'#3ab05a',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px'}}>Key Finding</div>
            <p style={{fontSize:'14px',color:'rgba(245,241,230,0.8)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>
              Count-leveraged whiff rate outperforms every publicly available strikeout predictor we tested.{' '}
              <strong style={{color:'#3ab05a'}}>r = 0.5818 vs. 0.4892 for CSW%</strong>. Missing bats matters. Missing them in two-strike counts matters more.
            </p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ WEIGHT OPTIMIZATION ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Weight Testing · 36 Combinations</div>
            <h2 className="sec-title">How the Weights Were Chosen</h2>
            <p className="sec-sub">We tested every possible combination of CLW, velocity, and VAA weights against the 2025 data. The mix that best predicted strikeout rate: CLW 60%, Velo 30%, VAA 10%.</p>
          </div>

          {!weights || weights.length === 0 ? (
            <div style={{...card,textAlign:'center',padding:'40px'}}>
              <div style={{fontSize:'13px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginBottom:'8px'}}>Heat map loads from psi_weights.json</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.2)',fontFamily:"'Inter',sans-serif"}}>Run convert_psi_data.py after dropping in weight_optimization_results.csv</div>
            </div>
          ) : (
            <div style={{...card,overflowX:'auto'}}>
              <div style={cardTop}/>
              <div style={{fontSize:'10px',color:'rgba(245,241,230,0.4)',fontFamily:"'Inter',sans-serif",marginBottom:'20px'}}>
                Holdout r (starters). Rows = VAA weight, columns = CLW weight, remaining weight = velocity.
                White border = winning combination.
              </div>
              {(() => {
                const clwVals = [...new Set(weights.map(w=>w.w_clw))].sort((a,b)=>a-b)
                const vaaVals = [...new Set(weights.map(w=>w.w_vaa))].sort((a,b)=>a-b)
                return (
                  <table style={{borderCollapse:'separate',borderSpacing:'3px'}}>
                    <thead>
                      <tr>
                        <th style={{padding:'6px 10px',fontSize:'8px',letterSpacing:'0.15em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textAlign:'right',whiteSpace:'nowrap'}}>CLW→<br/>VAA↓</th>
                        {clwVals.map(c=>(
                          <th key={c} style={{padding:'4px 8px',fontSize:'9px',letterSpacing:'0.1em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textAlign:'center',minWidth:'56px'}}>{c}%</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vaaVals.map(v=>(
                        <tr key={v}>
                          <td style={{padding:'4px 10px',fontSize:'9px',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textAlign:'right'}}>{v}%</td>
                          {clwVals.map(c=>{
                            const cell = weights.find(w=>w.w_clw===c&&w.w_vaa===v)
                            const win = c===60&&v===10
                            return (
                              <td key={c} style={{padding:'7px 8px',textAlign:'center',borderRadius:'3px',background:cell?heatColor(cell.hold_starter):'rgba(255,255,255,0.02)',border:win?'2.5px solid rgba(255,255,255,0.85)':'2.5px solid transparent',transition:'transform .15s',cursor:'default'}}>
                                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'10px',fontWeight:700,color:'rgba(8,18,32,0.9)'}}>{cell?cell.hold_starter?.toFixed(3):'—'}</div>
                                {win&&<div style={{fontSize:'6px',color:'rgba(8,18,32,0.8)',fontFamily:"'Inter',sans-serif",marginTop:'1px',fontWeight:800,letterSpacing:'0.1em'}}>BEST</div>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          )}

          <div style={{background:'rgba(78,171,222,0.06)',border:'1px solid rgba(78,171,222,0.18)',borderRadius:'4px',padding:'18px 22px',marginTop:'20px'}}>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.75)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>
              <strong style={{color:'#4EABDE'}}>Winner: CLW = 60%, Velocity = 30%, VAA = 10%.</strong>{' '}
              Every combination that gave VAA more than 10% weight underperformed. VAA and velocity are correlated, so over-weighting VAA was essentially counting the velocity signal twice.
            </p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ WHAT DIDN'T WORK ══ */}
        <section style={{...sec,paddingTop:'60px',paddingBottom:'60px'}}>
          <div className="sec-header">
            <div className="sec-eyebrow">What We Tried · What Failed</div>
            <h2 className="sec-title">What Didn't Work</h2>
            <p className="sec-sub">Two approaches that looked promising on paper and failed in testing. Showing them here because credibility means showing what didn't work, not just what did.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'14px'}}>
            {FAILED.map(f=>(
              <div key={f.name} style={{background:'rgba(13,30,53,0.5)',border:'1px solid rgba(196,69,54,0.12)',borderLeft:'3px solid rgba(196,69,54,0.35)',borderRadius:'4px',padding:'20px 22px'}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:'16px',fontWeight:700,color:'var(--cream)',marginBottom:'8px'}}>{f.name}</div>
                <p style={{fontSize:'12px',color:'rgba(245,241,230,0.48)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,marginBottom:'12px'}}>{f.desc}</p>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'#C44536',fontWeight:700}}>{f.result}</div>
              </div>
            ))}
          </div>
          <p style={{marginTop:'18px',fontSize:'12px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",lineHeight:1.7}}>
            Both had intuitive appeal. Both failed validation. What the data consistently rewarded was simpler: count leverage + stuff quality.
          </p>
        </section>

        <div className="divider"/>

        {/* ══ METHODOLOGY SUMMARY ══ */}
        <section style={{...sec,paddingTop:'60px'}}>
          <div className="sec-header">
            <div className="sec-eyebrow">Technical Specification</div>
            <h2 className="sec-title">How It's Built</h2>
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
        </section>

      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand">Stat<span>Packs</span></div>
        <div className="footer-tagline">Built on Data. Tracked Transparently.</div>
        <div className="footer-sub">PSI+ is a StatPacks original metric. All validation performed on held-out 2025 season data.</div>
        <div className="footer-line"/>
        <div className="footer-copy">© 2026 StatPacks · statpacks.app</div>
      </footer>
    </>
  )
}
