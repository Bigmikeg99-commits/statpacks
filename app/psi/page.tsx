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
    desc: 'Measured how similar two pitch types look at the decision point before diverging at the plate.',
    result: 'YoY r = 0.15. Too weak.',
  },
  {
    name: 'Outcome-Based Sequencing (OBAI)',
    desc: 'Whether pitch A made pitch B harder to hit in consecutive counts. Count-adjusted baseline, empirical Bayes shrinkage. 2,065,254 consecutive pairs analyzed.',
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

  useEffect(() => {
    fetch('/data/psi_leaderboard_2026.json').then(r=>r.json()).then(setLbData).catch(()=>setLbData([]))
    fetch('/data/psi_signals.json').then(r=>r.json()).then(setSignals).catch(()=>setSignals([]))
    fetch('/data/psi_weights.json').then(r=>r.json()).then(setWeights).catch(()=>setWeights([]))
  }, [])

  const loadRolling = useCallback(() => {
    if (rolling || rollingLoad) return
    setRollingLoad(true)
    fetch('/data/psi_rolling.json')
      .then(r=>r.json()).then(d=>{setRolling(d);setRollingLoad(false)})
      .catch(()=>{setRolling([]);setRollingLoad(false)})
  }, [rolling, rollingLoad])

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
          <Link href="/#picks">Picks</Link>
          <Link href="/performance">Performance</Link>
          <Link href="/psi" style={{color:'var(--gold)'}}>PSI+</Link>
          <Link href="/#method">About</Link>
        </div>
        <button className={`nav-hamburger${menuOpen?' open':''}`} aria-label="Menu" onClick={()=>setMenuOpen(o=>!o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen?' open':''}`}>
        <Link href="/"           onClick={()=>setMenuOpen(false)}>Home</Link>
        <Link href="/#picks"     onClick={()=>setMenuOpen(false)}>Picks</Link>
        <Link href="/performance"onClick={()=>setMenuOpen(false)}>Performance</Link>
        <Link href="/psi"        onClick={()=>setMenuOpen(false)} style={{color:'var(--gold)'}}>PSI+</Link>
        <Link href="/#method"    onClick={()=>setMenuOpen(false)}>About</Link>
      </div>

      <main style={{minHeight:'100vh',paddingBottom:'80px'}}>

        {/* ══ HERO ══ */}
        <section style={{background:'var(--navy)',padding:'80px 40px 60px',textAlign:'center',borderBottom:'2px solid rgba(212,175,55,0.15)',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(0deg,rgba(78,171,222,0.03) 0,rgba(78,171,222,0.03) 1px,transparent 1px,transparent 70px),repeating-linear-gradient(90deg,rgba(78,171,222,0.03) 0,rgba(78,171,222,0.03) 1px,transparent 1px,transparent 70px)',pointerEvents:'none'}}/>
          <div style={{position:'relative',zIndex:1,maxWidth:'900px',margin:'0 auto'}}>
            <div className="hero-eyebrow">Pitcher Strikeout Index · 2026</div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:'clamp(60px,10vw,110px)',fontWeight:900,color:'var(--cream)',lineHeight:.9,marginBottom:'20px',letterSpacing:'-0.01em'}}>
              PSI<span style={{color:'var(--gold)',fontStyle:'italic'}}>+</span>
            </h1>
            <p style={{fontSize:'16px',color:'rgba(245,241,230,0.65)',maxWidth:'620px',margin:'0 auto 12px',lineHeight:1.7,fontFamily:"'Inter',sans-serif",fontWeight:500}}>
              A new framework for evaluating strikeout ability in modern baseball.
            </p>
            <p style={{fontSize:'13px',color:'rgba(245,241,230,0.38)',maxWidth:'560px',margin:'0 auto 36px',lineHeight:1.8,fontFamily:"'Inter',sans-serif",fontStyle:'italic'}}>
              Measures how effectively a pitcher generates swing-and-miss when it matters most — weighted by count leverage, fastball quality, and vertical approach angle.
            </p>
            <div style={{display:'flex',gap:'12px',justifyContent:'center',flexWrap:'wrap',marginBottom:'40px'}}>
              <a href="#leaderboard" className="btn btn-primary">2026 Leaderboard</a>
              <a href="#validation"  className="btn btn-secondary">Validation Results</a>
            </div>
            <div style={{display:'flex',gap:'8px',justifyContent:'center',flexWrap:'wrap'}}>
              {[
                {label:'Data',       val:'3.6M pitches'},
                {label:'Training',   val:'2020–2024'},
                {label:'Holdout',    val:'2025 season'},
                {label:'Components', val:'CLW · Velo · VAA'},
                {label:'100',        val:'= league avg within role'},
              ].map(k=>(
                <div key={k.label} style={{background:'rgba(13,30,53,0.85)',border:'1px solid rgba(212,175,55,0.18)',borderRadius:'4px',padding:'10px 16px',textAlign:'center'}}>
                  <div style={{fontSize:'7px',letterSpacing:'0.2em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'4px'}}>{k.label}</div>
                  <div style={{fontSize:'11px',fontWeight:600,color:'var(--cream)',fontFamily:"'Inter',sans-serif"}}>{k.val}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:'20px',fontSize:'9px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.22)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>
              Last updated: June 1, 2026
            </div>
          </div>
        </section>

        {/* ══ LEADERBOARD ══ */}
        <section id="leaderboard" style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">2026 Season · Through June 1</div>
            <h2 className="sec-title">Leaderboard</h2>
            <p className="sec-sub">Minimum {minP} pitches. Scored within role. 100 = league average.</p>
          </div>

          {/* Role tabs */}
          <div style={{display:'flex',marginBottom:'20px',border:'1px solid rgba(212,175,55,0.25)',borderRadius:'4px',overflow:'hidden',width:'fit-content'}}>
            {(['starter','reliever'] as const).map(r=>(
              <button key={r} onClick={()=>setRole(r)} style={{fontFamily:"'Inter',sans-serif",fontSize:'11px',fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',padding:'10px 24px',cursor:'pointer',border:'none',background:role===r?'rgba(212,175,55,0.12)':'transparent',color:role===r?'var(--gold)':'rgba(245,241,230,0.4)',transition:'all .2s',borderRight:r==='starter'?'1px solid rgba(212,175,55,0.25)':'none'}}>
                {r==='starter'?'Starters':'Relievers'}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="filter-bar">
            <input type="text" placeholder="Search pitcher..." value={search} onChange={e=>setSearch(e.target.value)}
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
                  <tr style={{borderBottom:'1px solid rgba(212,175,55,0.2)'}}>
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
                          style={{textAlign:align as any,padding:'10px 12px',fontSize:'8px',letterSpacing:'0.18em',color:isSort?'var(--gold)':'rgba(212,175,55,0.5)',textTransform:'uppercase',cursor:clickable?'pointer':'default',whiteSpace:'nowrap',fontWeight:700,userSelect:'none'}}>
                          {label}{isSort?(sort.dir==='desc'?' ↓':' ↑'):''}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{borderBottom:'1px solid rgba(212,175,55,0.05)',transition:'background .15s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(212,175,55,0.04)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'10px 12px',textAlign:'center',fontSize:'11px',color:'rgba(245,241,230,0.28)',fontFamily:"'Inter',sans-serif"}}>{i+1}</td>
                      <td style={{padding:'10px 12px',textAlign:'left',fontSize:'13px',color:'var(--cream)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{r.name}</td>
                      <td style={{padding:'10px 12px',textAlign:'center'}}>
                        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'13px',fontWeight:700,color:psiColor(r.psi)}}>{r.psi}</span>
                      </td>
                      <td style={{padding:'10px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.65)'}}>{r.k_pct}%</td>
                      <td style={{padding:'10px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.65)'}}>{r.clw?.toFixed(3)}</td>
                      <td style={{padding:'10px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.65)'}}>{r.velo}</td>
                      <td style={{padding:'10px 12px',textAlign:'center',fontFamily:"'Orbitron',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.65)'}}>{r.vaa?.toFixed(2)}°</td>
                      <td style={{padding:'10px 12px',textAlign:'center',fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif"}}>{r.n?.toLocaleString()}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{textAlign:'center',padding:'32px',color:'rgba(245,241,230,0.3)',fontSize:'12px',fontFamily:"'Inter',sans-serif"}}>No pitchers match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
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

        {/* ══ SIGNAL DISCOVERY ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Feature Engineering · 51 Signals Ranked</div>
            <h2 className="sec-title">How We Found the Signal</h2>
            <p className="sec-sub">Year-over-year K% predictive correlation across 51 engineered features — only novel signals outperformed the existing public benchmarks.</p>
          </div>

          {/* Key callout — always visible */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px',marginBottom:'32px'}}>
            {[
              {label:'Count-Lev. Whiff (CLW)', r:'0.5818', cat:'Novel — PSI+ Component', color:'#3ab05a'},
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.05)" horizontal={false}/>
                    <XAxis type="number" domain={[0,0.68]} tickFormatter={v=>`${v.toFixed(2)}`} tick={{fill:'rgba(245,241,230,0.35)',fontSize:9,fontFamily:'Inter'}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fill:'rgba(245,241,230,0.65)',fontSize:10,fontFamily:'Inter'}} axisLine={false} tickLine={false} width={168}/>
                    <Tooltip
                      contentStyle={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.22)',borderRadius:'4px',fontFamily:'Inter',fontSize:'11px'}}
                      formatter={(v:any)=>[Number(v).toFixed(4),'YoY r']}
                      labelStyle={{color:'var(--cream)',fontWeight:600}}
                    />
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
              <div style={{fontSize:'12px',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif"}}>Full signal chart loads from psi_signals.json — run convert_psi_data.py to generate it.</div>
            </div>
          ) : null}

          <div style={{background:'rgba(58,176,90,0.07)',border:'1px solid rgba(58,176,90,0.2)',borderRadius:'4px',padding:'18px 22px',marginTop:'28px'}}>
            <div style={{fontSize:'9px',letterSpacing:'0.2em',color:'#3ab05a',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px'}}>Key Finding</div>
            <p style={{fontSize:'14px',color:'rgba(245,241,230,0.8)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,margin:0}}>
              Count-leveraged whiff rate — a novel metric not previously named in public research — outperforms CSW% as a standalone year-over-year K% predictor:{' '}
              <strong style={{color:'#3ab05a'}}>r = 0.5818 vs. 0.4892</strong>. The signal is not just that you miss bats — it's <em>when</em> you miss them.
            </p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ VALIDATION ══ */}
        <section id="validation" style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Holdout Test · 2025 Season Untouched During Development</div>
            <h2 className="sec-title">Does It Actually Work?</h2>
            <p className="sec-sub">2025 was held out entirely. Every correlation below reflects out-of-sample performance: 2024 PSI+ predicting 2025 K%.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:'20px',marginBottom:'24px'}}>

            {/* Stability chart */}
            <div style={card}>
              <div style={cardTop}/>
              <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>Year-over-Year Self-Correlation</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',marginBottom:'4px'}}>Stability Comparison</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginBottom:'20px'}}>Starters · Higher = more repeatable skill signal</div>
              <ResponsiveContainer width="100%" height={148}>
                <BarChart data={STABILITY} layout="vertical" margin={{left:36,right:56,top:4,bottom:4}}>
                  <XAxis type="number" domain={[0,0.9]} hide/>
                  <YAxis type="category" dataKey="name" tick={{fill:'rgba(245,241,230,0.65)',fontSize:12,fontFamily:'Inter'}} axisLine={false} tickLine={false} width={34}/>
                  <Tooltip contentStyle={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.2)',borderRadius:'4px',fontFamily:'Inter',fontSize:'11px'}} formatter={(v:any)=>[Number(v).toFixed(3),'r']}/>
                  <Bar dataKey="r" radius={[0,3,3,0]} label={{position:'right',fill:'rgba(245,241,230,0.55)',fontSize:11,fontFamily:'Orbitron',fontWeight:700,formatter:(v:any)=>Number(v).toFixed(3)}}>
                    {STABILITY.map((s,i)=><Cell key={i} fill={s.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Correlation table */}
            <div style={card}>
              <div style={cardTop}/>
              <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>2024 Metric → 2025 K%</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',marginBottom:'4px'}}>Predictive Correlation</div>
              <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginBottom:'18px'}}>n = 306 pitchers with paired seasons</div>
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
                SwStr% outperforms PSI+ pooled. PSI+ earns its keep in the role-adjusted starter comparison and year-over-year stability.
              </p>
            </div>
          </div>

          {/* Quartile K% chart */}
          <div style={card}>
            <div style={cardTop}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
              <div>
                <div style={{fontSize:'9px',letterSpacing:'0.22em',color:'rgba(212,175,55,0.5)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'5px'}}>Quartile Outcome Analysis</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)'}}>2025 K% by 2024 PSI+ Quartile</div>
                <div style={{fontSize:'11px',color:'rgba(245,241,230,0.35)',fontFamily:"'Inter',sans-serif",marginTop:'4px'}}>Low PSI+ → fewer Ks. High PSI+ → more Ks.</div>
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.06)" vertical={false}/>
                <XAxis dataKey="q" tick={{fill:'rgba(245,241,230,0.6)',fontSize:11,fontFamily:'Inter'}} axisLine={false} tickLine={false}/>
                <YAxis domain={[14,30]} tickFormatter={v=>`${v}%`} tick={{fill:'rgba(245,241,230,0.35)',fontSize:10,fontFamily:'Inter'}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.2)',borderRadius:'4px',fontFamily:'Inter',fontSize:'11px'}} formatter={(v:any)=>[`${v}%`,'Avg K%']}/>
                <Bar dataKey="k" radius={[3,3,0,0]} label={{position:'top',fill:'rgba(245,241,230,0.65)',fontSize:11,fontFamily:'Orbitron',fontWeight:700,formatter:(v:any)=>`${v}%`}}>
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
              {label:'Overall directional accuracy',  val:'58.8%', sub:'153 of 260 divergence cases',   color:'var(--gold)'},
              {label:'Bull accuracy (underrated flag)', val:'51.5%', sub:'PSI+ > K%, K% rose next year',  color:'#4EABDE'},
              {label:'Bear accuracy (overrated flag)',  val:'82.3%', sub:'PSI+ < K%, K% fell next year',  color:'#3ab05a'},
            ].map(s=>(
              <div key={s.label} style={{background:'rgba(13,30,53,0.8)',border:'1px solid rgba(212,175,55,0.1)',borderRadius:'4px',padding:'16px 18px'}}>
                <div style={{fontSize:'8px',letterSpacing:'0.18em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'8px'}}>{s.label}</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'24px',fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:'10px',color:'rgba(245,241,230,0.32)',fontFamily:"'Inter',sans-serif",marginTop:'6px'}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="divider"/>

        {/* ══ WEIGHT OPTIMIZATION ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Grid Search · 36 Weight Combinations Tested</div>
            <h2 className="sec-title">How the Weights Were Chosen</h2>
            <p className="sec-sub">Every combination of CLW, velocity, and VAA weights validated on the 2025 holdout — the winning set was CLW 60%, Velo 30%, VAA 10%.</p>
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
                Holdout r (starters) — rows = VAA weight, columns = CLW weight, remaining weight = velocity.
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
              Every combination where VAA exceeded 10% underperformed. VAA partially proxies velocity — higher VAA weight was double-counting the velocity signal.
            </p>
          </div>
        </section>

        <div className="divider"/>

        {/* ══ COMPONENT DEEP DIVE ══ */}
        <section style={sec}>
          <div className="sec-header">
            <div className="sec-eyebrow">Three Components · Role-Adjusted Normalization</div>
            <h2 className="sec-title">What the Components Measure</h2>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'16px'}}>
            {[
              {
                num:'01', abbr:'CLW', name:'Count-Leveraged Whiff Rate', weight:'60%', yoy:'0.5818',
                benchmark:'vs. CSW% standalone r = 0.4892', color:'#3ab05a',
                desc:'Whiff rate re-weighted by count leverage: two-strike pitches 2×, first-pitch 0.5×, all others 1×. A novel metric not previously named as a public stat.',
                insight:'"Not just whether you miss bats — when you miss them."',
              },
              {
                num:'02', abbr:'VELO P95', name:'Fastball Velocity Ceiling', weight:'30%', yoy:'0.4815',
                benchmark:'vs. mean FB velocity r = 0.4705', color:'#4EABDE',
                desc:'95th percentile fastball velocity across FF, SI, and FC pitch types. The ceiling captures the extra gear — consistent with how velocity is deployed in high-leverage counts.',
                insight:'"The 95th percentile captures the extra gear, not the average."',
              },
              {
                num:'03', abbr:'VAA', name:'Fastball Vertical Approach Angle', weight:'10%', yoy:'0.4159',
                benchmark:'', color:'var(--gold)',
                desc:'Mean vertical approach angle at the plate. More negative = flatter = better. Inverted in scoring so higher PSI+ = better approach angle. Cristopher Sánchez: −6.92°, 98th percentile.',
                insight:'"A flatter approach angle meets the bat path at the worst possible spot for the hitter."',
              },
            ].map(c=>(
              <div key={c.num} className="method-card">
                <div className="method-num">{c.num}</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:c.color,letterSpacing:'0.08em'}}>{c.abbr}</div>
                  <div style={{fontSize:'8px',letterSpacing:'0.1em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'2px',padding:'3px 7px',textTransform:'uppercase'}}>Weight: {c.weight}</div>
                </div>
                <div className="method-title">{c.name}</div>
                <p className="method-desc" style={{marginBottom:'14px'}}>{c.desc}</p>
                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'3px',padding:'10px 12px',marginBottom:'12px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:c.benchmark?'5px':'0'}}>
                    <span style={{fontSize:'8px',letterSpacing:'0.15em',color:'rgba(245,241,230,0.3)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase'}}>YoY r</span>
                    <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'15px',fontWeight:700,color:c.color}}>{c.yoy}</span>
                  </div>
                  {c.benchmark&&<div style={{fontSize:'9px',color:'rgba(245,241,230,0.28)',fontFamily:"'Inter',sans-serif"}}>{c.benchmark}</div>}
                </div>
                <div style={{fontSize:'11px',fontStyle:'italic',color:'rgba(245,241,230,0.5)',fontFamily:"'Playfair Display',serif",lineHeight:1.65}}>{c.insight}</div>
              </div>
            ))}
          </div>

          {/* Notable 2026 findings */}
          <div style={{marginTop:'40px'}}>
            <div style={{fontSize:'9px',letterSpacing:'0.25em',color:'rgba(212,175,55,0.45)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',marginBottom:'14px'}}>Notable 2026 Findings</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'12px'}}>
              {[
                {
                  name:'Cristopher Sánchez', stat:'#2 Starter by PSI+', color:'#3ab05a',
                  detail:'−6.92° VAA (98th pctile) · CLW 98th pctile · 96.6 mph velo. Sinker-baller outsmarting hitters, not overpowering them. The best example of what PSI+ identifies that K% alone misses.',
                },
                {
                  name:'Max Scherzer', stat:'PSI+ 82.6, declining trajectory', color:'#C44536',
                  detail:'Rolling PSI+ across starts: 97.7 → 97.0 → 95.8 → 93.6 → 92.2. Velocity ticking from 95.2 to 94.8 mph. The metric capturing deterioration in real time.',
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
            <div className="sec-eyebrow">Divergence Analysis · 2020–2024</div>
            <h2 className="sec-title">Where K% Missed, PSI+ Didn't</h2>
            <p className="sec-sub">Selected cases where PSI+ significantly diverged from K% — and the subsequent year proved the metric right.</p>
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
              When PSI+ significantly diverged from K% (&gt;0.5 SD), it was correct <strong style={{color:'#3ab05a'}}>58.8% overall</strong> across 260 cases.
              The bear case — where PSI+ flagged a pitcher as overrated — was accurate <strong style={{color:'#3ab05a'}}>82.3% of the time</strong> across 62 cases.
              The overrated signal is particularly strong.
            </p>
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
              <input type="text" placeholder="Search pitcher…" value={pitcherQ}
                onChange={e=>{setPitcherQ(e.target.value);setShowDrop(true);loadRolling()}}
                onFocus={()=>{setShowDrop(true);loadRolling()}}
                onBlur={()=>setTimeout(()=>setShowDrop(false),160)}
                style={{fontFamily:"'Inter',sans-serif",fontSize:'13px',padding:'10px 16px',background:'#0d1e35',border:'1px solid rgba(212,175,55,0.3)',borderRadius:'4px',color:'var(--cream)',outline:'none',width:'260px'}}
              />
              {showDrop && suggestions.length > 0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0d1e35',border:'1px solid rgba(212,175,55,0.22)',borderTop:'none',borderRadius:'0 0 4px 4px',zIndex:20,maxHeight:'240px',overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
                  {suggestions.map(p=>(
                    <div key={p.id} onMouseDown={()=>{setSelPitcher(p);setPitcherQ(p.name);setShowDrop(false)}}
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
                  <LineChart data={trajectoryData} margin={{top:8,right:24,bottom:8,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.06)"/>
                    <XAxis dataKey="date" tick={{fill:'rgba(245,241,230,0.35)',fontSize:9,fontFamily:'Inter'}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                    <YAxis domain={[70,145]} tick={{fill:'rgba(245,241,230,0.35)',fontSize:10,fontFamily:'Inter'}} axisLine={false} tickLine={false}/>
                    <Tooltip
                      contentStyle={{background:'#0d1e35',border:'1px solid rgba(212,175,55,0.2)',borderRadius:'4px',fontFamily:'Inter',fontSize:'11px'}}
                      formatter={(v:any)=>[Number(v).toFixed(1),'PSI+']}
                      labelStyle={{color:'rgba(245,241,230,0.5)',marginBottom:'4px'}}
                    />
                    <ReferenceLine y={100} stroke="rgba(245,241,230,0.18)" strokeDasharray="5 4"
                      label={{value:'League Avg (100)',fill:'rgba(245,241,230,0.28)',fontSize:9,fontFamily:'Inter',position:'insideTopLeft'}}/>
                    <Line type="monotone" dataKey="psi" stroke="#D4AF37" strokeWidth={2.5} dot={false} activeDot={{r:5,fill:'#D4AF37',stroke:'var(--navy)',strokeWidth:2}}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <div style={{background:'rgba(13,30,53,0.4)',border:'1px solid rgba(212,175,55,0.08)',borderRadius:'6px',padding:'56px',textAlign:'center'}}>
              <div style={{fontSize:'13px',color:'rgba(245,241,230,0.25)',fontFamily:"'Inter',sans-serif"}}>Search for a pitcher above to view their rolling PSI+ trajectory.</div>
            </div>
          )}
        </section>

        <div className="divider"/>

        {/* ══ WHAT DIDN'T WORK ══ */}
        <section style={{...sec,paddingTop:'60px',paddingBottom:'60px'}}>
          <div className="sec-header">
            <div className="sec-eyebrow">Failed Approaches · Two Dead Ends</div>
            <h2 className="sec-title">What Didn't Work</h2>
            <p className="sec-sub">Included here because they shaped what PSI+ is not — and because credibility requires showing the failures.</p>
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
