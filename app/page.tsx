'use client'
import React, { useEffect, useState, useRef } from 'react'
import Script from 'next/script'

/* ---- types ---- */
interface Shap { label: string; feat: string; val: number; pp: number }
interface Pick {
  name: string; mlbamid: string; team?: string; opp: string; hand: string; ha: string
  rec: string; line: number; conf: string; pred_k: number
  pushers_up: Shap[]; pushers_down: Shap[]
  result: string | null; actual_k: number | null; pick_status?: string
  avg_ip?: number; k_pct?: number; barrel_pct?: number; stuff_plus?: number
  location_plus?: number; pitching_plus?: number; k_pct_l5?: number
}

const TEAM_IDS: Record<string, number> = {
  'Arizona Diamondbacks':109,'Atlanta Braves':144,'Baltimore Orioles':110,
  'Boston Red Sox':111,'Chicago Cubs':112,'Chicago White Sox':145,
  'Cincinnati Reds':113,'Cleveland Guardians':114,'Colorado Rockies':115,
  'Detroit Tigers':116,'Houston Astros':117,'Kansas City Royals':118,
  'Los Angeles Angels':108,'Los Angeles Dodgers':119,'Miami Marlins':146,
  'Milwaukee Brewers':158,'Minnesota Twins':142,'New York Mets':121,
  'New York Yankees':147,'Oakland Athletics':133,'Athletics':133,'Philadelphia Phillies':143,
  'Pittsburgh Pirates':134,'San Diego Padres':135,'San Francisco Giants':137,
  'Seattle Mariners':136,'St. Louis Cardinals':138,'Tampa Bay Rays':139,
  'Texas Rangers':140,'Toronto Blue Jays':141,'Washington Nationals':120,
}
function teamLogoUrl(team?: string): string {
  if (!team) return ''
  const id = TEAM_IDS[team]
  return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : ''
}
interface Day { d:string;w:number;l:number;ow:number;ol:number;uw:number;ul:number;p:number }
interface Seg { l:string;w:number;lo:number;pct:number;e:number }
interface BestMonthSeg { label:string; pct:number; w:number; l:number; month:string }
interface PicksData {
  updated: string
  picks_date?: string
  season: { record:string;overs:string;unders:string;picks:number;date_range:string;overall_pct:string;over_pct:string;under_pct:string }
  pod: { name:string }
  daily: Day[]; backtestDaily: Day[]; overSegs: Seg[]; underSegs: Seg[]; picks: Pick[]
  bestMonthSeg?: BestMonthSeg | null
}

export default function Page() {
  const [data, setData] = useState<PicksData | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [heroTab, setHeroTab] = useState<'picks'|'psi'|'record'|'form'>('form')
  const [psiLb, setPsiLb] = useState<{name:string;id?:string;psi:number;team?:string}[]|null>(null)
  const [resultsMap, setResultsMap] = useState<Record<string,string>>({})
  const [filter, setFilter] = useState<{hand:string;dir:string;ha:string}>({ hand:'all', dir:'all', ha:'all' })
  const [chartReady, setChartReady] = useState(false)
  const [chartMode] = useState<'cumulative' | 'rolling'>('rolling')
  const [calMonth, setCalMonth] = useState<string>(() => String(new Date().getMonth() + 1))
  const chartRef     = useRef<HTMLCanvasElement>(null)
  const chartInstRef = useRef<any>(null)
  const chartSeenRef = useRef(false)
  const axisRef      = useRef<HTMLCanvasElement>(null)
  const axisInstRef  = useRef<any>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetch('/data/picks.json').then(r => r.json()).then(setData).catch(() => {})
    fetch('/data/psi_leaderboard_2026.json').then(r => r.json()).then(d => {
      const rows = Array.isArray(d) ? d : []
      setPsiLb(rows.filter((r:any) => r.role === 'starter').sort((a:any,b:any) => b.psi - a.psi).slice(0,10))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!data) return
    populateHero(data.season, data.overSegs, data.underSegs, data.bestMonthSeg)
    renderSegs(data.overSegs, 'ov-segs')
    renderSegs(data.underSegs, 'un-segs')
    setupObservers()

    // Auto-poll MLB results every hour — use picks_date (actual game date) not generation timestamp
    const dateStr = data.picks_date || data.updated.slice(0, 10)

    const fetchResults = async () => {
      pollResults(data.picks, dateStr)
      // Also build a resultsMap for the hero panel (pollResults only touches the DOM)
      const ids = data.picks.map(p => {
        const teamId = TEAM_IDS[p.team || '']
        return teamId ? `${p.mlbamid}:${teamId}` : p.mlbamid
      }).filter(Boolean)
      if (!ids.length) return
      try {
        const res = await fetch(`/api/results?date=${dateStr}&ids=${ids.join(',')}`)
        if (!res.ok) return
        const mlbData: Record<string, { actual_k: number | null; game_state: string; started: boolean }> = await res.json()
        const map: Record<string,string> = {}
        for (const pick of data.picks) {
          const info = mlbData[pick.mlbamid]
          if (!info) continue
          if (info.game_state === 'Postponed') { map[pick.mlbamid] = 'ppd'; continue }
          if (info.game_state !== 'Final') continue
          if (!info.started) { map[pick.mlbamid] = 'void'; continue }
          const k = info.actual_k
          if (k === null) continue
          if (k === pick.line) { map[pick.mlbamid] = 'push' }
          else if (pick.rec === 'OVER')  { map[pick.mlbamid] = k > pick.line ? 'win' : 'loss' }
          else if (pick.rec === 'UNDER') { map[pick.mlbamid] = k < pick.line ? 'win' : 'loss' }
        }
        setResultsMap(map)
      } catch {}
    }

    fetchResults()
    const interval = setInterval(fetchResults, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [data])

  // Re-render calendar whenever data or month filter changes
  useEffect(() => {
    if (!data) return
    const filtered = calMonth === 'all'
      ? data.daily
      : data.daily.filter(d => d.d.split('/')[0] === calMonth)
    renderCal(filtered)
  }, [data, calMonth])

  // Re-render cards whenever data or filters change
  useEffect(() => {
    if (!data) return
    const filtered = data.picks.filter(p =>
      (filter.hand === 'all' || p.hand === filter.hand) &&
      (filter.dir  === 'all' || p.rec  === filter.dir)  &&
      (filter.ha   === 'all' || p.ha.toLowerCase()[0] === filter.ha[0])
    )
    renderCards(filtered, data.pod.name, data.updated)
  }, [data, filter])

  useEffect(() => {
    if (!data || !chartReady || !chartRef.current) return
    const canvas = chartRef.current
    const doRender = () => {
      if (chartInstRef.current) { chartInstRef.current.destroy(); chartInstRef.current = null }
      if (axisInstRef.current)  { axisInstRef.current.destroy();  axisInstRef.current  = null }
      const result = renderChart(data.daily, data.backtestDaily || [], canvas, chartMode, data.season, axisRef.current)
      chartInstRef.current = result?.chart || null
      axisInstRef.current  = result?.axis  || null
    }
    if (!chartSeenRef.current) {
      // First render: wait until chart is visible
      const obs = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return
        obs.disconnect()
        chartSeenRef.current = true
        doRender()
      }, { threshold: 0.3 })
      obs.observe(canvas)
      return () => obs.disconnect()
    } else {
      doRender()
    }
  }, [data, chartReady, chartMode])

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" onLoad={() => setChartReady(true)} />

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo-badge"><span>StatPacks</span></div>
        </div>
        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/psi" style={{color:'var(--gold)'}}>PSI+</a>
          <a href="/#picks">Picks</a>
          <a href="/performance">Performance</a>
        </div>
        <button className={`nav-hamburger${menuOpen?' open':''}`} aria-label="Menu" onClick={() => setMenuOpen(o=>!o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen?' open':''}`}>
        <a href="/" onClick={()=>setMenuOpen(false)}>Home</a>
        <a href="/psi" onClick={()=>setMenuOpen(false)} style={{color:'var(--gold)'}}>PSI+</a>
        <a href="/#picks" onClick={()=>setMenuOpen(false)}>Picks</a>
        <a href="/performance" onClick={()=>setMenuOpen(false)}>Performance</a>
      </div>

      {/* HERO */}
      <section className="hero" style={{textAlign:'left',alignItems:'stretch',padding:isMobile?'0 20px':'0 40px',minHeight:'100vh',display:'flex',flexDirection:'column',justifyContent:'center'}}>
        <div className="hero-grid"/>
        <div className="hero-vignette"/>
        <div className="hero-split" style={{position:'relative',zIndex:2,maxWidth:'1200px',margin:'0 auto',width:'100%',display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?'24px':'80px',alignItems:'stretch',padding:isMobile?'20px 0 32px':'80px 0'}}>

          {/* LEFT — brand */}
          <div style={{textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%'}}>
            <div className="hero-eyebrow" style={{justifyContent:'center',width:'100%'}}>Sports Analytics · Predictive Models</div>
            <div className="hero-title" style={{fontSize:'clamp(42px,6vw,76px)',marginBottom:'20px'}}>Stat<span>Packs</span></div>
            <div className="hero-sub" style={{marginBottom:'36px',maxWidth:'420px'}}>Built on Data. Tracked Transparently.</div>
            <div style={{display:'flex',gap:'12px',flexWrap:'wrap',justifyContent:'center'}}>
              <a href="#picks" className="btn btn-secondary">Today&apos;s Picks</a>
            </div>
          </div>

          {/* RIGHT — tabbed hero panel */}
          {data && (() => {
            const picks = data.picks
            const season = data.season
            const tabs: {key:'picks'|'psi'|'record'|'form', label:string}[] = [
              {key:'form',  label:'Recent Form'},
              {key:'picks', label:"Today's Picks"},
              {key:'psi',   label:'PSI+ Leaders'},
              {key:'record',label:'Season Record'},
            ]
            return (
              <div style={{background:'rgba(13,30,53,0.95)',border:'1px solid rgba(212,175,55,0.2)',borderRadius:'12px',overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.05)',position:'relative'}}>
                {/* Gold top accent */}
                <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,var(--gold),transparent)',opacity:0.7}}/>
                {/* Layout: left sidebar + right content */}
                <div style={{display:'flex',minHeight:'380px'}}>

                {/* LEFT SIDEBAR */}
                <div style={{width:'48px',flexShrink:0,borderRight:'1px solid rgba(255,255,255,0.06)',display:'flex',flexDirection:'column',alignItems:'center',paddingTop:'12px',gap:'4px'}}>
                  {tabs.map(t => {
                    const active = heroTab === t.key
                    const tooltips: Record<string,string> = { picks:"Today's Picks", psi:'PSI+ Leaders', record:'Season Record', form:'Recent Form' }
                    const iconColor = active ? 'var(--gold)' : 'rgba(245,241,230,0.5)'
                    const svgIcons: Record<string, React.ReactElement> = {
                      picks: (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="2" y="3" width="12" height="2" rx="1" fill={iconColor}/>
                          <rect x="2" y="7" width="9" height="2" rx="1" fill={iconColor}/>
                          <rect x="2" y="11" width="6" height="2" rx="1" fill={iconColor}/>
                        </svg>
                      ),
                      psi: (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="2"  y="9"  width="3" height="5" rx="1" fill={iconColor}/>
                          <rect x="6.5" y="5" width="3" height="9" rx="1" fill={iconColor}/>
                          <rect x="11" y="2"  width="3" height="12" rx="1" fill={iconColor}/>
                        </svg>
                      ),
                      record: (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <polyline points="2,12 5,8 8,9 11,5 14,3" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <polyline points="11,3 14,3 14,6" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ),
                      form: (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="5.5" stroke={iconColor} strokeWidth="1.5"/>
                          <polyline points="8,5 8,8 10,10" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ),
                    }
                    return (
                      <button
                        key={t.key}
                        title={tooltips[t.key]}
                        onClick={() => setHeroTab(t.key)}
                        style={{
                          width:'36px',height:'36px',borderRadius:'8px',
                          background: active ? 'rgba(212,175,55,0.12)' : 'transparent',
                          border: active ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
                          cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          transition:'all .15s',
                        }}
                      >
                        {svgIcons[t.key]}
                      </button>
                    )
                  })}
                </div>

                {/* RIGHT CONTENT */}
                <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>

                {/* PICKS TAB */}
                {heroTab === 'picks' && (
                  <>
                    <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.2em',textTransform:'uppercase',color:'var(--gold)',fontWeight:600}}>Today&apos;s Picks</span>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.5)'}}>MLB · {picks.length} total</span>
                    </div>
                    <div style={{maxHeight:'320px',overflowY:'auto'}}>
                      {picks.map((p, i) => {
                        const edge = (p.pred_k - p.line).toFixed(1)
                        const edgeNum = parseFloat(edge)
                        const res = resultsMap[p.mlbamid]
                        const dotColor = res === 'win' ? '#3ab05a' : res === 'loss' ? '#C44536' : res === 'push' ? 'var(--gold)' : res === 'ppd' ? 'var(--blue)' : 'rgba(245,241,230,0.2)'
                        const isOver = p.rec === 'OVER'
                        const recColor = isOver ? '#c8a84b' : '#a04545'
                        return (
                          <div key={i} style={{padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',alignItems:'center',gap:'12px'}}>
                            <img
                              src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_48,q_auto:best/v1/people/${p.mlbamid}/headshot/67/current`}
                              alt={p.name}
                              style={{width:'34px',height:'34px',borderRadius:'50%',objectFit:'cover',flexShrink:0,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,175,55,0.1)'}}
                              onError={(e)=>{(e.target as HTMLImageElement).style.opacity='0'}}
                            />
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'12px',fontWeight:600,color:'var(--cream)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.55)',marginTop:'2px'}}>{p.team} {p.ha==='H'?'vs':'@'} {p.opp.replace(/^(vs |@ )/,'')}</div>
                            </div>
                            <div style={{textAlign:'right',flexShrink:0}}>
                              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',fontWeight:700,color:'var(--cream)',letterSpacing:'0.05em'}}>{p.rec} {p.line}K</div>
                              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color: edgeNum > 0 ? '#3ab05a' : 'var(--red)',marginTop:'2px'}}>
                                {edgeNum > 0 ? '+' : ''}{edge} edge
                              </div>
                            </div>
                            <div style={{width:'6px',height:'6px',borderRadius:'50%',background:dotColor,flexShrink:0}}/>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{padding:'12px 20px',borderTop:'1px solid rgba(255,255,255,0.05)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.5)'}}>
                        <span style={{display:'flex',alignItems:'center',gap:'5px'}}>
                          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#3ab05a',display:'inline-block'}}/>
                          {picks.length} picks today
                        </span>
                      </span>
                      <a href="#picks" style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.15em',color:'var(--gold)',textTransform:'uppercase',fontWeight:600}}>Full view →</a>
                    </div>
                  </>
                )}

                {/* PSI+ TAB */}
                {heroTab === 'psi' && (() => {
                  const ranked = psiLb || []
                  const maxPsi = ranked[0]?.psi || 100
                  const psiColor = (v: number) => {
                    if (v >= 120) return '#3ab05a'
                    if (v >= 110) return '#7ec85a'
                    if (v >= 90)  return 'var(--cream)'
                    if (v >= 80)  return '#e08060'
                    return '#C44536'
                  }
                  return (
                  <>
                    <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.2em',textTransform:'uppercase',color:'var(--gold)',fontWeight:600}}>PSI+ Leaders</span>
                      <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.5)'}}>Today · MLB</span>
                    </div>
                    <div style={{maxHeight:'320px',overflowY:'auto'}}>
                      {ranked.length === 0 && (
                        <div style={{padding:'32px',textAlign:'center',fontFamily:"'Inter',sans-serif",fontSize:'11px',color:'rgba(245,241,230,0.2)'}}>Loading leaderboard…</div>
                      )}
                      {ranked.map((p, i) => {
                        const psi = p.psi || 0
                        const barPct = (psi / maxPsi) * 100
                        const col = psiColor(psi)
                        return (
                          <div key={i} style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',alignItems:'center',gap:'10px'}}>
                            <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'9px',fontWeight:700,color:'rgba(245,241,230,0.3)',width:'14px',flexShrink:0,textAlign:'center'}}>{i+1}</span>
                            <div style={{flexShrink:0}}>
                              <img
                                src={p.id ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_48,q_auto:best/v1/people/${p.id}/headshot/67/current` : ''}
                                alt={p.name}
                                style={{width:'34px',height:'34px',borderRadius:'50%',objectFit:'cover',display:'block',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,175,55,0.1)'}}
                                onError={(e)=>{(e.target as HTMLImageElement).style.opacity='0'}}
                              />
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'12px',fontWeight:600,color:'rgba(245,241,230,0.9)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginBottom:'5px'}}>{p.name}</div>
                              <div style={{height:'3px',borderRadius:'2px',background:'rgba(255,255,255,0.06)',overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${barPct}%`,background:col,borderRadius:'2px'}}/>
                              </div>
                            </div>
                            <div style={{textAlign:'right',flexShrink:0,minWidth:'44px'}}>
                              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'14px',fontWeight:700,color:col,lineHeight:1}}>{psi.toFixed(0)}</div>
                              <div style={{fontFamily:"'Inter',sans-serif",fontSize:'8px',color:'rgba(245,241,230,0.5)',letterSpacing:'0.12em',textTransform:'uppercase',marginTop:'3px'}}>PSI+</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{padding:'12px 16px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                      <a href="/psi" style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.15em',color:'var(--gold)',textTransform:'uppercase',fontWeight:600}}>Full PSI+ Rankings →</a>
                    </div>
                  </>
                )})()}

                {/* RECORD TAB */}
                {heroTab === 'record' && season && (
                  <>
                    <div style={{flex:1,display:'flex',flexDirection:'column',padding:'24px 16px 20px',overflowY:'auto'}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:'8px',letterSpacing:'0.3em',color:'var(--gold)',textTransform:'uppercase',textAlign:'center',marginBottom:'20px',opacity:0.7}}>— Season Stats —</div>
                      <div style={{display:'flex',background:'rgba(245,241,230,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'8px',overflow:'hidden'}}>
                        {(() => {
                          const pctColor = (p: string) => {
                            const v = parseFloat(p)
                            return v >= 52.4 ? '#3ab05a' : v >= 50 ? 'var(--gold)' : '#C44536'
                          }
                          return [
                            {lbl:'Season Record', val:season.record,        pct:season.overall_pct, pctCol:pctColor(season.overall_pct)},
                            {lbl:'Unders',        val:season.unders,        pct:season.under_pct,   pctCol:pctColor(season.under_pct)},
                            {lbl:'Overs',         val:season.overs,         pct:season.over_pct,    pctCol:pctColor(season.over_pct)},
                            {lbl:'Picks',         val:String(season.picks), pct:season.date_range,  pctCol:'rgba(245,241,230,0.55)'},
                          ]
                        })().map((b,i) => (
                          <div key={i} style={{
                            flex:1, textAlign:'center', padding:'20px 6px',
                            borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                          }}>
                            <div style={{fontFamily:"'Inter',sans-serif",fontSize:'7px',letterSpacing:'0.2em',color:'rgba(245,241,230,0.55)',textTransform:'uppercase',marginBottom:'10px'}}>{b.lbl}</div>
                            <div style={{fontFamily:"'Playfair Display',serif",fontSize:'clamp(16px,2vw,26px)',fontWeight:700,color:'var(--cream)',lineHeight:1}}>{b.val}</div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontSize:'11px',fontWeight:600,color:b.pctCol,marginTop:'7px'}}>{b.pct}</div>
                          </div>
                        ))}
                      </div>
                      {/* Monthly bar chart */}
                      {data && data.daily && data.daily.length > 0 && (() => {
                        const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                        const now = new Date()
                        const currentMonthKey = String(now.getMonth() + 1)
                        const monthMap: Record<string,{w:number;l:number}> = {}
                        for (const day of data.daily) {
                          const monthNum = parseInt(day.d.split('/')[0])
                          const key = String(monthNum)
                          if (!monthMap[key]) monthMap[key] = {w:0,l:0}
                          monthMap[key].w += day.w
                          monthMap[key].l += day.l
                        }
                        const months = Object.keys(monthMap).sort()
                        if (months.length === 0) return null
                        const barCol = (w:number, l:number) => {
                          const pct = (w+l) === 0 ? 0 : w/(w+l)
                          return pct >= 0.524 ? '#3ab05a' : pct >= 0.5 ? '#D4AF37' : '#C44536'
                        }
                        const maxTotal = Math.max(...months.map(m => monthMap[m].w + monthMap[m].l))
                        return (
                          <div style={{marginTop:'16px',background:'rgba(245,241,230,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'8px',padding:'12px 14px 10px'}}>
                            <div style={{marginBottom:'10px'}}>
                              <span style={{fontFamily:"'Inter',sans-serif",fontSize:'8px',letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(245,241,230,0.35)'}}>Monthly Win %</span>
                            </div>
                            {(() => {
                              const CHART_H = 72
                              const BAR_AREA_H = 52 // px available for bars
                              const LABEL_H = 14   // px for month label below
                              const PCT_LABEL_H = 12 // px for % label above
                              // dynamic y scale: pad around actual range
                              const pcts = months.map(k => { const {w,l} = monthMap[k]; return (w+l)===0?0:w/(w+l) })
                              const yMin = Math.max(0, Math.min(...pcts) - 0.08)
                              const yMax = Math.min(1, Math.max(...pcts) + 0.08)
                              const toY = (p: number) => BAR_AREA_H - Math.round(((p - yMin) / (yMax - yMin)) * BAR_AREA_H)
                              const baselineY = toY(0.5)
                              return (
                                <div style={{overflowX:'auto',overflowY:'hidden',WebkitOverflowScrolling:'touch' as any}}>
                                  <div style={{minWidth:`${months.length * 52}px`,width:'100%',paddingTop:`${PCT_LABEL_H}px`,paddingRight:'6px'}}>
                                    {/* Bar chart with baseline */}
                                    <div style={{position:'relative',height:`${BAR_AREA_H}px`,display:'flex',alignItems:'flex-end',gap:'6px'}}>
                                      {/* 50% baseline */}
                                      <div style={{position:'absolute',left:0,right:0,top:`${baselineY}px`,borderTop:'1px dashed rgba(212,175,55,0.35)',zIndex:1,pointerEvents:'none'}}/>
                                      {months.map(key => {
                                        const {w, l} = monthMap[key]
                                        const total = w + l
                                        const pct = total === 0 ? 0.5 : w / total
                                        const col = barCol(w, l)
                                        const isCurrent = key === currentMonthKey
                                        const barH = Math.max(3, BAR_AREA_H - toY(pct))
                                        return (
                                          <div key={key} style={{flex:'1 0 46px',position:'relative',display:'flex',flexDirection:'column',alignItems:'center'}}>
                                            {/* % label above bar */}
                                            <span style={{
                                              position:'absolute',
                                              top: `-${PCT_LABEL_H + 2}px`,
                                              fontFamily:"'Inter',sans-serif",
                                              fontSize:'8px',fontWeight:600,
                                              color:col,lineHeight:1,
                                            }}>{total > 0 ? `${(pct*100).toFixed(0)}%` : ''}</span>
                                            {/* bar */}
                                            <div style={{
                                              width:'100%',
                                              height:`${barH}px`,
                                              background: col,
                                              opacity: isCurrent ? 0.6 : 1,
                                              borderRadius:'3px 3px 2px 2px',
                                              outline: isCurrent ? `1px solid ${col}` : 'none',
                                              outlineOffset:'2px',
                                              zIndex:2,
                                            }}/>
                                          </div>
                                        )
                                      })}
                                    </div>
                                    {/* Month labels */}
                                    <div style={{display:'flex',gap:'6px',marginTop:'5px'}}>
                                      {months.map(key => {
                                        const isCurrent = key === currentMonthKey
                                        const monthIdx = parseInt(key) - 1
                                        return (
                                          <div key={key} style={{flex:'1 0 46px',textAlign:'center'}}>
                                            <span style={{fontFamily:"'Inter',sans-serif",fontSize:'8px',color: isCurrent ? 'rgba(245,241,230,0.85)':'rgba(245,241,230,0.55)',letterSpacing:'0.03em'}}>
                                              {MONTH_NAMES[monthIdx]}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                            {months.length > 4 && <div style={{marginTop:'6px',textAlign:'right'}}>
                              <span style={{fontFamily:"'Inter',sans-serif",fontSize:'7px',color:'rgba(212,175,55,0.5)',letterSpacing:'0.05em'}}>scroll →</span>
                            </div>}
                          </div>
                        )
                      })()}
                      <div style={{textAlign:'center',marginTop:'16px'}}>
                        <a href="/performance" style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.15em',color:'rgba(212,175,55,0.6)',textTransform:'uppercase',fontWeight:600}}>Full Season Tracker →</a>
                      </div>
                    </div>
                  </>
                )}


                {/* RECENT FORM TAB */}
                {heroTab === 'form' && data && (() => {
                  const pctColor = (w:number, l:number) => {
                    const pct = (w+l) === 0 ? 0 : w/(w+l)
                    return pct >= 0.524 ? '#3ab05a' : pct >= 0.5 ? '#D4AF37' : '#C44536'
                  }
                  // build from data.daily in reverse (most recent first)
                  const days = [...data.daily].reverse()
                  const windows = [
                    { label: 'Last 7 Days',  days: 7  },
                    { label: 'Last 14 Days', days: 14 },
                    { label: 'Last 30 Days', days: 30 },
                  ]
                  const stats = windows.map(({ label, days: n }) => {
                    let w = 0, l = 0
                    for (const day of days.slice(0, n)) { w += day.w; l += day.l }
                    const total = w + l
                    const pct = total === 0 ? 0 : w / total
                    return { label, w, l, pct, col: pctColor(w, l) }
                  })
                  return (
                    <>
                      <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                        <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.2em',textTransform:'uppercase',color:'var(--gold)',fontWeight:600}}>Recent Form</span>
                        <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',color:'rgba(245,241,230,0.4)'}}>MLB</span>
                      </div>
                      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',padding:'8px 20px 20px',gap:'0'}}>
                        {stats.map((s, i) => {
                          const barPct = s.pct * 100
                          return (
                            <div key={i} style={{padding:'16px 0',borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none'}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                                <span style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(245,241,230,0.5)'}}>{s.label}</span>
                                <div style={{display:'flex',alignItems:'baseline',gap:'8px'}}>
                                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:'18px',fontWeight:700,color:'var(--cream)',lineHeight:1}}>{s.w}-{s.l}</span>
                                  <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'11px',fontWeight:700,color:s.col}}>{(s.pct*100).toFixed(1)}%</span>
                                </div>
                              </div>
                              <div style={{height:'3px',borderRadius:'2px',background:'rgba(255,255,255,0.06)',overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${barPct}%`,background:s.col,borderRadius:'2px',transition:'width 0.6s ease'}}/>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{padding:'12px 16px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                        <a href="/performance" style={{fontFamily:"'Inter',sans-serif",fontSize:'10px',letterSpacing:'0.15em',color:'var(--gold)',textTransform:'uppercase',fontWeight:600}}>Full Season Tracker →</a>
                      </div>
                    </>
                  )
                })()}

                </div>{/* end right content */}
                </div>{/* end sidebar layout */}
              </div>
            )
          })()}

          {/* Placeholder while data loads */}
          {!data && (
            <div style={{background:'rgba(13,30,53,0.6)',border:'1px solid rgba(212,175,55,0.1)',borderRadius:'12px',height:'300px',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontSize:'11px',color:'rgba(245,241,230,0.2)',letterSpacing:'0.15em',textTransform:'uppercase',fontFamily:"'Inter',sans-serif"}}>Loading…</span>
            </div>
          )}

        </div>
        <div className="hero-scroll"><div className="scroll-line"/><div className="scroll-txt">Scroll</div></div>
      </section>

      {/* PICKS */}
      <section className="picks-section" id="picks"><div className="picks-inner">
        <div className="sec-header fade-in">
          <div className="sec-eyebrow">Daily Picks</div>
          <div className="sec-title">Today&apos;s Recommendations</div>
          <div className="sec-sub">Picks generated from the PSI+ V2 model. Tap a card to see model reasoning.</div>
          <div className="updated-tag" id="updated-tag">Updated: --</div>
          {data && <button className="csv-btn" onClick={() => downloadCSV(data.picks)}>↓ Export CSV</button>}
        </div>
        {data && (
          <div className="filter-bar fade-in">
            <select className="filter-select" value={filter.hand}
              onChange={e => setFilter(f => ({...f, hand: e.target.value}))}>
              <option value="all">All Hands</option>
              <option value="L">LHP</option>
              <option value="R">RHP</option>
            </select>
            <select className="filter-select" value={filter.dir}
              onChange={e => setFilter(f => ({...f, dir: e.target.value}))}>
              <option value="all">All Picks</option>
              <option value="OVER">Over</option>
              <option value="UNDER">Under</option>
            </select>
            <select className="filter-select" value={filter.ha}
              onChange={e => setFilter(f => ({...f, ha: e.target.value}))}>
              <option value="all">All Venues</option>
              <option value="h">Home</option>
              <option value="a">Away</option>
            </select>
          </div>
        )}
        <div className="cards-grid" id="cards-grid"/>
      </div></section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand"><span style={{display:'inline-block',border:'2px solid var(--red)',borderRadius:'5px',padding:'5px 14px',fontFamily:"'Inter',sans-serif",fontSize:'14px',fontWeight:800,letterSpacing:'0.16em',color:'#fff'}}>StatPacks</span></div>
        <div className="footer-tagline">Collect the edge.</div>
        <div className="footer-sub">MLB K Model &nbsp;·&nbsp; 2026 Season &nbsp;·&nbsp; PSI+ V2</div>
        <div className="footer-line"/>
        <div className="footer-copy">For entertainment purposes. Always gamble responsibly.</div>
      </footer>
    </>
  )
}

/* ---- helpers ---- */

/* ── count-up animation ─────────────────────────────────────────────────── */
function countUp(id: string, target: number, duration = 1200, decimals = 0, suffix = '') {
  const el = document.getElementById(id)
  if (!el) return
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - t, 3)          // ease-out cubic
    el.textContent = (target * eased).toFixed(decimals) + suffix
    if (t < 1) requestAnimationFrame(tick)
    else el.textContent = target.toFixed(decimals) + suffix
  }
  requestAnimationFrame(tick)
}

function countUpRecord(id: string, record: string, duration = 1200) {
  const el = document.getElementById(id)
  if (!el) return
  const [wStr, lStr] = record.split('-')
  const w = parseInt(wStr), l = parseInt(lStr)
  if (isNaN(w) || isNaN(l)) { el.textContent = record; return }
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    el.textContent = `${Math.round(w * eased)}-${Math.round(l * eased)}`
    if (t < 1) requestAnimationFrame(tick)
    else el.textContent = record
  }
  requestAnimationFrame(tick)
}

function populateHero(s: PicksData['season'], overSegs: Seg[], underSegs: Seg[], bestMonthSeg?: BestMonthSeg | null) {
  setTimeout(() => {
    // date range doesn't animate
    setText('hr-range', s.date_range)

    // count-up all numbers
    countUpRecord('hr-record', s.record, 1400)
    countUpRecord('hr-overs',  s.overs,  1200)
    countUpRecord('hr-unders', s.unders, 1200)
    countUp('hr-picks',  s.picks,                    1300)
    countUp('hr-opct',   parseFloat(s.overall_pct),  1300, 1, '%')
    countUp('hr-ovpct',  parseFloat(s.over_pct),     1200, 1, '%')
    countUp('hr-upct',   parseFloat(s.under_pct),    1200, 1, '%')

    // Dynamic color for pct labels based on actual values
    const colorClass = (pct: number) => pct >= 52.4 ? 'g' : pct >= 50 ? 'o' : 'r'
    const setPctColor = (id: string, pct: number) => {
      const el = document.getElementById(id)
      if (el) { el.className = `hr-pct ${colorClass(pct)}` }
    }
    setPctColor('hr-opct',  parseFloat(s.overall_pct))
    setPctColor('hr-ovpct', parseFloat(s.over_pct))
    setPctColor('hr-upct',  parseFloat(s.under_pct))

    // Best segment
    if (bestMonthSeg) {
      setText('stat-best-seg-lbl', `Best Segment (${bestMonthSeg.month})`)
      setText('stat-best-seg-name', bestMonthSeg.label)
      setText('stat-best-seg-record', `${bestMonthSeg.w}-${bestMonthSeg.l} · ${bestMonthSeg.pct.toFixed(1)}%`)
    } else {
      const allSegs = [...(overSegs || []), ...(underSegs || [])]
      if (allSegs.length > 0) {
        const best = allSegs.reduce((a, b) => a.pct > b.pct ? a : b)
        countUp('stat-best-seg-pct', best.pct, 1300, 1, '%')
        setText('stat-best-seg-name', best.l)
      }
    }

    // Edge — color + label driven by sign
    const livePct = parseFloat(s.overall_pct)
    if (!isNaN(livePct)) {
      const edgeVal = livePct - 52.4
      const positive = edgeVal >= 0
      const sign = positive ? '+' : ''
      const color = positive ? '#3ab05a' : '#C44536'
      const edgeEl = document.getElementById('stat-edge')
      const edgeNum = edgeEl?.closest('.stat-num') as HTMLElement | null
      if (edgeNum) edgeNum.style.color = color
      setText('stat-edge-label', positive ? 'Above breakeven' : 'Below breakeven')
      if (edgeEl) {
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min((now - start) / 1200, 1)
          const eased = 1 - Math.pow(1 - t, 3)
          edgeEl.textContent = sign + (edgeVal * eased).toFixed(1)
          if (t < 1) requestAnimationFrame(tick)
          else edgeEl.textContent = sign + edgeVal.toFixed(1)
        }
        requestAnimationFrame(tick)
      }
    }
  }, 400)
}

function setText(id: string, val: string) {
  const el = document.getElementById(id); if (el) el.textContent = val
}

function renderCards(picks: Pick[], podName: string, updated: string) {
  const grid = document.getElementById('cards-grid')
  if (!grid) return
  grid.innerHTML = ''
  const tag = document.getElementById('updated-tag')
  if (tag) tag.textContent = 'Updated: ' + updated
  if (!picks.length) { grid.innerHTML = '<div class="no-picks">No picks available.</div>'; return }

  const sorted = [...picks].sort((a, b) => a.name === podName ? -1 : b.name === podName ? 1 : 0)
  sorted.forEach((p, i) => {
    const scene = document.createElement('div')
    scene.className = 'card-scene'
    scene.dataset.mlbamid = p.mlbamid || ''
    scene.dataset.line    = String(p.line)
    scene.dataset.rec     = p.rec
    if (p.name === podName) scene.classList.add('is-pod')
    if (p.result === 'win') scene.classList.add('result-win')
    if (p.result === 'loss') scene.classList.add('result-loss')
    if (p.result === 'push') scene.classList.add('result-push')
    if (p.pick_status === 'PPD') scene.classList.add('result-ppd')
    scene.addEventListener('click', () => scene.classList.toggle('flipped'))
    scene.innerHTML = buildCardHTML(p, podName, i + 1)
    grid.appendChild(scene)
    scene.style.opacity = '0'
    setTimeout(() => { scene.style.opacity = ''; scene.classList.add('cascade-in') }, 120 + i * 80)
  })
}


function buildCardHTML(p: Pick, podName: string, rank = 1): string {
  const recClass = p.rec === 'OVER' ? 'over' : 'under'
  const confColor = p.rec === 'OVER' ? '#4EABDE' : '#e06050'
  // For UNDER picks, display confidence in the under direction (100 - P(Line))
  const displayConf = p.rec === 'UNDER'
    ? (100 - parseFloat(p.conf)).toFixed(1) + '%'
    : p.conf
  const badgeColor = p.rec === 'OVER' ? '#c8a84b' : '#a04545'
  const badgeBg    = p.rec === 'OVER' ? 'rgba(200,168,75,0.12)' : 'rgba(158,64,64,0.14)'
  const badgeBorder = p.rec === 'OVER' ? 'rgba(200,168,75,0.45)' : 'rgba(158,64,64,0.5)'
  const isPod = p.name === podName
  const logoUrl = teamLogoUrl(p.team)
  const resultClass = p.result === 'win' ? 'win' : p.result === 'loss' ? 'loss' : p.result === 'push' ? 'push' : p.pick_status === 'PPD' ? 'ppd' : ''
  const imgUrl = p.mlbamid ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${p.mlbamid}/headshot/67/current` : ''
  const initials = p.name.split(' ').map((n:string) => n[0]).join('')
  const lastName = p.name.split(' ').slice(1).join(' ') || p.name
  const opp = p.opp.replace('vs ', '').replace('@ ', '')
  const posLetter = p.hand === 'L' ? 'LHP' : 'RHP'

  // stat helpers
  const allFeats = [...(p.pushers_up||[]), ...(p.pushers_down||[])]
  const fv = (k: string) => allFeats.find(x => x.feat === k)?.val ?? null
  const fmt = (v: number|null|undefined, dec=1) => v != null ? v.toFixed(dec) : '--'
  const bAvgIP = p.avg_ip ?? fv('avg_IP_per_start')
  const bKPct = p.k_pct ?? fv('K%')
  const bKL5 = p.k_pct_l5 ?? fv('K%_recent')
  const pctStr = (v: number|null|undefined) => v != null ? (v*100).toFixed(1)+'%' : '--'

  // SHAP bars — V2 model feature labels
  const labelMap: Record<string,string> = {
    // ── New V2 features ──
    'SLWR': 'Swing & miss rate',
    'Swinging-Strike + Whiff Rate': 'Swing & miss rate',
    'spin_FF': '4-seam spin rate',
    'Spin rate (4-seam)': '4-seam spin rate',
    'spin_SI': 'Sinker spin rate',
    'Spin rate (sinker)': 'Sinker spin rate',
    'spin_FC': 'Cutter spin rate',
    'Spin rate (cutter)': 'Cutter spin rate',
    'ext_FB': 'Fastball extension',
    'Fastball extension': 'Fastball extension',
    // ── Core features (retained from V1) ──
    'PSI+': 'PSI+ score',
    'psi_plus': 'PSI+ score',
    'Stuff+': 'Stuff+',
    'Stuff+ rating': 'Stuff+',
    'Location+': 'Location+',
    'Pitching+': 'Pitching+',
    'Fastball usage %': 'Fastball usage',
    'Changeup usage %': 'Changeup usage',
    'Zone swing-miss rate': 'Zone swing and miss',
    'in_zone_swing_miss': 'Zone swing and miss',
    'Fastball horizontal movement': 'Fastball horiz. movement',
    'Fastball vertical movement': 'Fastball vert. movement',
    'vertical_drop': 'Fastball vertical drop',
    'horizontal_break': 'Horizontal break',
    'Days since last start': 'Days rest',
    'days_rest': 'Days rest',
    'Home/Away': 'Home / Away',
    'is_home': 'Home / Away',
    // ── Opponent pitch-type splits (retained) ──
    'Opp K% vs fastball': 'Opp K% vs fastball',
    'Opp K% vs breaking ball': 'Opp K% vs breaking',
    'Opp K% vs offspeed': 'Opp K% vs offspeed',
    'Opp whiff rate vs fastball': 'Opp whiff vs fastball',
    'Opp whiff rate vs breaking': 'Opp whiff vs breaking',
    'Opp whiff rate vs offspeed': 'Opp whiff vs offspeed',
    // ── Handedness context (retained) ──
    'pitcher_hand': 'Pitcher handedness',
    'batter_hand': 'Opponent hand',
  }
  const friendlyLabel = (lbl: string) => labelMap[lbl] || lbl
  const allPP = [...(p.pushers_up||[]),...(p.pushers_down||[])].map(x=>x.pp)
  const maxPP = allPP.length ? Math.max(...allPP) : 1
  const shapRows = (arr: Shap[], color: string, sign: string) =>
    (arr||[]).slice(0,4).map(f => {
      const w = Math.round((f.pp/maxPP)*100)
      return `<div class="shap-row"><div class="shap-lbl">${friendlyLabel(f.label)}</div><div class="shap-track"><div class="shap-fill" style="width:${w}%;background:${color}"></div></div><div class="shap-num" style="color:${color}">${sign}${f.pp.toFixed(0)}</div></div>`
    }).join('')
  const hasShap = (p.pushers_up?.length||0)+(p.pushers_down?.length||0) > 0
  const podTag = isPod ? `<div class="card-pod-tag">★ Pick of the Day</div>` : ''
  const rankBadge = isPod ? '' : `<div class="card-rank-badge${rank <= 5 ? ' top' : ''}">#${rank}</div>`
  const resultOverlay = resultClass ? `<div class="card-result-overlay ${resultClass}"></div>` : ''
  const resultStamp = resultClass ? `<div class="card-result-stamp ${resultClass}">${resultClass==='win'?'W':resultClass==='loss'?'L':resultClass==='push'?'PUSH':'PPD'}</div>` : ''
  const imgTag = imgUrl ? `<img src="${imgUrl}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''
  const fbStyle = imgUrl ? '' : 'display:flex;'

  return `<div class="card-inner">
    <div class="card-front">
      ${podTag}
      ${rankBadge}
      <div class="card-photo-area">
        ${imgTag}
        <div class="card-photo-fallback" style="${fbStyle}">${initials}</div>
        ${resultOverlay}${resultStamp}
        <div class="card-pos-strip"><span>${posLetter}</span></div>
      </div>
      <div class="card-nameplate">
        <div class="card-player-name">${p.name}</div>
        <div class="card-player-sub">${opp} · ${p.hand}HP · ${p.ha}</div>
        <div class="card-slash-mark">/ /</div>
        <div class="card-pos-icon">${logoUrl ? `<img src="${logoUrl}" alt="" style="width:24px;height:24px;object-fit:contain;filter:drop-shadow(0 0 2px white) drop-shadow(0 0 2px white) drop-shadow(0 0 1px white);">` : '<span>P</span>'}</div>
      </div>
      <div class="card-pick-row">
        <div class="card-rec-badge" style="background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeColor}">${p.rec} ${p.line}K</div>
        <div class="card-pick-val" style="color:${badgeColor}">${displayConf}</div>
      </div>
      <div class="card-tap-hint">tap to flip</div>
      <div class="card-footer-strip">
        <span>StatPacks · PSI+ V2</span><span>${p.hand}HP · ${p.ha}</span>
      </div>
    </div>
    <div class="card-back">
      <div class="back-header">
        <div>
          <div class="back-name">${lastName.toUpperCase()}</div>
          <div class="back-pill ${recClass}" style="display:inline-flex;margin-top:3px">${p.rec} ${p.line} Ks</div>
        </div>
        <div class="back-rank">${isPod?'POD':''}</div>
      </div>
      <div class="back-stats-hdr">2026 Season Stats</div>
      <table class="back-stats-table">
        <tr><th>Avg IP</th><th>K%</th><th>Barrel %</th><th>Stuff+</th><th>Loc+</th><th>Pitch+</th></tr>
        <tr>
          <td>${fmt(bAvgIP as number)}</td>
          <td>${pctStr(bKPct as number)}</td>
          <td>${p.barrel_pct!=null?(p.barrel_pct*100).toFixed(1)+'%':'--'}</td>
          <td>${fmt(p.stuff_plus,0)}</td>
          <td>${fmt(p.location_plus,0)}</td>
          <td>${fmt(p.pitching_plus,0)}</td>
        </tr>
      </table>
      <div class="back-divider"></div>
      <div class="pred-row">
        <div class="pred-cell"><div class="pred-lbl">Median K</div><div class="pred-val">${fmt(p.pred_k)}</div></div>
        <div class="pred-cell"><div class="pred-lbl">Line</div><div class="pred-val">${p.line}</div></div>
        <div class="pred-cell"><div class="pred-lbl">Model Confidence</div><div class="pred-val" style="color:${confColor}">${displayConf}</div></div>
        <div class="pred-cell"><div class="pred-lbl">Actual Ks</div><div class="pred-val pred-actual-k" style="color:${p.actual_k != null ? (p.result === 'win' ? '#3ab05a' : p.result === 'push' ? '#999' : '#C44536') : p.pick_status === 'PPD' ? '#4EABDE' : 'rgba(245,241,230,0.35)'}">${p.actual_k != null ? p.actual_k : p.pick_status === 'PPD' ? 'PPD' : '--'}</div></div>
      </div>
      ${hasShap
        ? `<div class="shap-block"><div class="shap-hdr">More Strikeouts</div>${shapRows(p.pushers_up,'#3ab05a','+')}</div>
           <div class="shap-block"><div class="shap-hdr">Fewer Strikeouts</div>${shapRows(p.pushers_down,'#C44536','-')}</div>`
        : '<div class="no-shap">no model data</div>'
      }
      <div class="back-footer">
        <div class="back-footer-txt">StatPacks · PSI+ V2</div>
        <div class="back-footer-txt">${p.hand}HP · ${p.ha}</div>
      </div>
    </div>
  </div>`
}

function renderCal(daily: Day[]) {
  const cal = document.getElementById('cal')
  if (!cal) return
  cal.innerHTML = ''

  // Build cells hidden, animate when container scrolls into view
  const cells: HTMLElement[] = []
  daily.forEach(d => {
    const cls = d.p>=60?'dg':d.p>=50?'do':'dr'
    const pc  = d.p>=60?'g':d.p>=50?'o':'r'
    const el  = document.createElement('div')
    el.className = `day ${cls}`
    el.title = `${d.d} ${d.w}-${d.l} (${d.p.toFixed(1)}%)`
    el.innerHTML = `<div class="day-d">${d.d}</div><div class="day-r">${d.w}-${d.l}</div><div class="day-p ${pc}">${d.p.toFixed(0)}%</div>`
    el.style.cssText = 'opacity:0;transform:translateY(16px) scale(0.93);transition:opacity 0.45s ease,transform 0.45s ease'
    cal.appendChild(el)
    cells.push(el)
  })

  // Fire stagger when cal enters viewport
  const obs = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return
    obs.disconnect()
    cells.forEach((el, i) => {
      setTimeout(() => {
        el.style.opacity = '1'
        el.style.transform = 'translateY(0) scale(1)'
      }, i * 38)
    })
  }, { threshold: 0.1 })
  obs.observe(cal)
}

function renderSegs(segs: Seg[], id: string) {
  const c = document.getElementById(id)
  if (!c) return
  c.innerHTML = ''
  segs.forEach(s => {
    const good = s.pct >= 52.4
    const hue = good ? Math.min(140, 78+(s.pct-52.4)*3.2) : 0
    const lt = good ? 38 : 32+(52.4-s.pct)*0.5
    const fc = good ? `hsl(${hue},58%,${lt}%)` : 'hsl(0,60%,38%)'
    const eStr = (s.e>=0?'+':'')+s.e.toFixed(1)+'pp'
    const row = document.createElement('div')
    row.className = 'sr fade-in'
    row.innerHTML = `<div class="sl">${s.l}</div><div class="st"><div class="sf" style="width:0;background:${fc}" data-w="${s.pct.toFixed(1)}"></div><div class="sbe" style="left:52.4%"></div></div><div class="ss"><span class="${good?'g':'r'}">${eStr}</span></div>`
    c.appendChild(row)
  })
}

function renderChart(
  daily: Day[], btDaily: Day[], canvas: HTMLCanvasElement,
  mode: 'cumulative' | 'rolling', season?: any, axisCanvas?: HTMLCanvasElement | null
): any {
  const Chart = (window as any).Chart
  if (!Chart) return null

  const btDates   = new Set(btDaily.map(d => d.d))
  const liveDates = new Set(daily.map(d => d.d))
  const allDates  = Array.from(new Set([...btDaily.map(d=>d.d), ...daily.map(d=>d.d)]))
    .sort((a, b) => {
      const parse = (s:string) => { const [m,dd] = s.split('/'); return parseInt(m)*100+parseInt(dd) }
      return parse(a) - parse(b)
    })
  const n = allDates.length
  const grid = 'rgba(212,175,55,0.08)'
  const tick  = 'rgba(245,241,230,0.6)'

  if (mode === 'cumulative') {
    // Cumulative win % — running total from first pick date
    const cumulate = (src: Day[], filterDates: Set<string>) => {
      const map = new Map(src.map(d => [d.d, d]))
      let tw = 0, tl = 0
      return allDates.map(date => {
        const day = map.get(date)
        if (day) { tw += day.w; tl += day.l }
        if (!filterDates.has(date)) return null
        return tw + tl > 0 ? parseFloat(((tw / (tw + tl)) * 100).toFixed(1)) : null
      })
    }
    const liveCum = cumulate(daily, liveDates)
    const btCum   = cumulate(btDaily, btDates)

    const cumVals = [...liveCum, ...btCum].filter(v => v !== null) as number[]
    const cumMax  = cumVals.length > 0 ? Math.ceil((Math.max(...cumVals) + 4) / 5) * 5 : 82
    const cumMin  = cumVals.length > 0 ? Math.floor((Math.min(...cumVals) - 4) / 5) * 5 : 45

    // Reset canvas to responsive
    canvas.style.width  = ''
    canvas.style.height = '160px'
    canvas.removeAttribute('width')
    canvas.removeAttribute('height')

    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: allDates, datasets: [
        { label: 'Live cumulative', data: liveCum, borderColor: '#4EABDE', borderWidth: 2.5, pointRadius: 2, pointBackgroundColor: '#4EABDE', fill: false, tension: 0.3, spanGaps: false },
        { label: 'V2 Backtest cumulative', data: btCum, borderColor: '#D4AF37', borderWidth: 2, borderDash: [5,3], pointRadius: 1.5, pointBackgroundColor: '#D4AF37', fill: false, tension: 0.3, spanGaps: false },
        { data: Array(n).fill(52.4), borderColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderDash: [2,4], pointRadius: 0, fill: false },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeInOutQuart' },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx:any) => ctx.dataset.label ? ctx.dataset.label + ': ' + ctx.parsed.y + '%' : '' }}},
        scales: {
          x: { ticks: { color: tick, font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { color: grid } },
          y: { min: cumMin, max: cumMax, ticks: { color: tick, font: { size: 11 }, callback: (v:number) => v + '%' }, grid: { color: grid } },
        },
      },
    })
    return { chart, axis: null }
  } else {
    // Rolling mode — narrow axis + endpoint annotation
    const roll = (src: Day[], windowSize = 7) => {
      const map = new Map(src.map(d => [d.d, d]))
      return allDates.map((_date, i) => {
        const win = allDates.slice(Math.max(0, i - (windowSize - 1)), i + 1)
        const days = win.map(d => map.get(d)).filter(Boolean) as Day[]
        if (days.length < 1) return null
        const tw = days.reduce((a,x)=>a+x.w,0), tl = days.reduce((a,x)=>a+x.l,0)
        return tw+tl > 0 ? parseFloat(((tw/(tw+tl))*100).toFixed(1)) : null
      })
    }
    const liveRoll   = roll(daily,   7).map((v, i) => liveDates.has(allDates[i]) ? v : null)
    const liveRoll30 = roll(daily,  30).map((v, i) => liveDates.has(allDates[i]) ? v : null)

    const splitIdx = allDates.indexOf('6/11')
    const PSI_COLOR = '#D4AF37'
    const LIVE_COLOR = '#4EABDE'

    const rollVals = [...liveRoll, ...liveRoll30].filter(v => v !== null) as number[]
    const rollMax  = rollVals.length > 0 ? Math.ceil((Math.max(...rollVals) + 4) / 5) * 5 : 90
    const rollMin  = rollVals.length > 0 ? Math.floor((Math.min(...rollVals) - 4) / 5) * 5 : 30

    const PX_PER_DAY = 48
    const totalWidth = Math.max(n * PX_PER_DAY, 400)
    canvas.style.width  = totalWidth + 'px'
    canvas.style.height = '160px'
    canvas.width  = totalWidth * window.devicePixelRatio
    canvas.height = 160 * window.devicePixelRatio

    // Endpoint annotation plugin
    const record = season?.record || ''
    const pct    = season?.overall_pct || ''
    const endLabelPlugin = {
      id: 'endLabel',
      afterDraw(chart: any) {
        const ds0 = chart.data.datasets[0]
        let lastI = -1
        ds0.data.forEach((v: any, i: number) => { if (v != null) lastI = i })
        if (lastI < 0) return
        const meta = chart.getDatasetMeta(0)
        const pt = meta.data[lastI]
        if (!pt) return
        const ctx2 = chart.ctx
        ctx2.save()
        ctx2.font = '500 10px Inter,sans-serif'
        const lbl = `${record} · ${pct}%`
        const tw2 = ctx2.measureText(lbl).width
        const px = pt.x + 8, py = pt.y - 4
        ctx2.fillStyle = 'rgba(13,30,53,0.88)'
        ctx2.fillRect(px - 2, py - 12, tw2 + 10, 16)
        ctx2.fillStyle = '#4EABDE'
        ctx2.fillText(lbl, px + 3, py)
        ctx2.restore()
      }
    }

    // Marks the date PSI+ components were added, with a dashed vertical line + label
    const psiMarkerPlugin = {
      id: 'psiMarker',
      afterDraw(chart: any) {
        if (splitIdx < 0) return
        const meta = chart.getDatasetMeta(0)
        const pt = meta.data[splitIdx]
        if (!pt) return
        const ctx2 = chart.ctx
        const top = chart.scales.y.top, bottom = chart.scales.y.bottom
        ctx2.save()
        ctx2.strokeStyle = 'rgba(212,175,55,0.45)'
        ctx2.setLineDash([4,3])
        ctx2.lineWidth = 1
        ctx2.beginPath()
        ctx2.moveTo(pt.x, top)
        ctx2.lineTo(pt.x, bottom)
        ctx2.stroke()
        ctx2.setLineDash([])
        ctx2.font = '600 9px Inter,sans-serif'
        const lbl = 'PSI+ Added'
        const tw2 = ctx2.measureText(lbl).width
        ctx2.fillStyle = 'rgba(212,175,55,0.9)'
        ctx2.fillText(lbl, pt.x - tw2 / 2, top - 4)
        ctx2.restore()
      }
    }

    const inst = new Chart(canvas, {
      type: 'line',
      plugins: [endLabelPlugin, psiMarkerPlugin],
      data: { labels: allDates, datasets: [
        { label: '7-Day Live',   data: liveRoll,   borderColor: LIVE_COLOR, borderWidth: 2.5, pointRadius: 2,
          pointBackgroundColor: (ctx:any) => splitIdx >= 0 && ctx.dataIndex >= splitIdx ? PSI_COLOR : LIVE_COLOR,
          segment: { borderColor: (ctx:any) => splitIdx >= 0 && ctx.p0DataIndex >= splitIdx ? PSI_COLOR : LIVE_COLOR },
          fill: false, tension: 0.35, spanGaps: false },
        { label: '30-Day Live',  data: liveRoll30, borderColor: '#3ab05a', borderWidth: 2,   pointRadius: 1.5, pointBackgroundColor: '#3ab05a', fill: false, tension: 0.35, spanGaps: false },
        { data: Array(n).fill(52.4), borderColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderDash: [2,4], pointRadius: 0, fill: false },
      ]},
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeInOutQuart' },
        layout: { padding: { right: 115, top: 14 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx:any) => ctx.dataset.label + ': ' + ctx.parsed.y + '%' }}},
        scales: {
          x: { ticks: { color: tick, font: { size: 11 }, maxRotation: 45 }, grid: { color: grid } },
          y: { min: rollMin, max: rollMax, ticks: { display: false }, grid: { color: grid }, border: { display: false } },
        },
      },
    })

    const scroll = document.getElementById('chartScroll')
    if (scroll) setTimeout(() => { scroll.scrollLeft = totalWidth }, 100)

    // Sticky axis-only chart so the % scale stays visible while the main chart scrolls
    let axisInst: any = null
    if (axisCanvas) {
      const AXIS_W = 34
      axisCanvas.style.width  = AXIS_W + 'px'
      axisCanvas.style.height = '160px'
      axisCanvas.width  = AXIS_W * window.devicePixelRatio
      axisCanvas.height = 160 * window.devicePixelRatio
      axisInst = new Chart(axisCanvas, {
        type: 'line',
        data: { labels: allDates, datasets: [
          { data: Array(n).fill(null), pointRadius: 0, borderWidth: 0 },
        ]},
        options: {
          responsive: false, maintainAspectRatio: false,
          animation: false,
          layout: { padding: { top: 14 } },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { ticks: { color: 'rgba(0,0,0,0)', font: { size: 11 }, maxRotation: 45 }, grid: { display: false }, border: { display: false } },
            y: { min: rollMin, max: rollMax, ticks: { color: tick, font: { size: 11 }, callback: (v:number) => v + '%' }, grid: { display: false }, border: { display: false } },
          },
        },
      })
    }

    return { chart: inst, axis: axisInst }
  }
}

async function pollResults(picks: Pick[], dateStr: string) {
  const ids = picks.map(p => {
    const teamId = TEAM_IDS[p.team || '']
    return teamId ? `${p.mlbamid}:${teamId}` : p.mlbamid
  }).filter(Boolean)
  if (!ids.length) return
  try {
    const res = await fetch(`/api/results?date=${dateStr}&ids=${ids.join(',')}`)
    if (!res.ok) return
    const mlbData: Record<string, { actual_k: number | null; game_state: string; started: boolean }> = await res.json()

    for (const [mlbamid, info] of Object.entries(mlbData)) {
      const scene = document.querySelector(`[data-mlbamid="${mlbamid}"]`) as HTMLElement | null
      if (!scene) continue

      const line    = parseFloat(scene.dataset.line ?? '0')
      const rec     = scene.dataset.rec ?? ''
      const k       = info.actual_k
      const isFinal     = info.game_state === 'Final'
      const isPostponed = info.game_state === 'Postponed'

      if (isPostponed) {
        if (scene.classList.contains('result-ppd')) continue
        scene.classList.remove('result-win', 'result-loss', 'result-void', 'result-ppd')
        scene.classList.add('result-ppd')
        const photoArea = scene.querySelector('.card-photo-area') as HTMLElement | null
        if (photoArea) {
          photoArea.querySelectorAll('.card-result-overlay, .card-result-stamp').forEach(el => el.remove())
          const overlay = document.createElement('div'); overlay.className = 'card-result-overlay ppd'
          const stamp   = document.createElement('div'); stamp.className   = 'card-result-stamp ppd'; stamp.textContent = 'PPD'
          photoArea.appendChild(overlay); photoArea.appendChild(stamp)
        }
        const actualKEl = scene.querySelector('.pred-actual-k') as HTMLElement | null
        if (actualKEl) { actualKEl.textContent = 'PPD'; actualKEl.style.color = '#4EABDE' }
        continue
      }

      if (!isFinal) continue

      // Opener/DNP — pitcher didn't start
      let resultClass = ''
      let stampText   = ''
      if (!info.started) {
        resultClass = 'void'
        stampText   = 'DNP'
      } else if (k !== null) {
        if (k === line) {
          resultClass = 'push'
        } else if (rec === 'OVER') {
          resultClass = k > line ? 'win' : 'loss'
        } else if (rec === 'UNDER') {
          resultClass = k < line ? 'win' : 'loss'
        }
        stampText = resultClass === 'win' ? 'W' : resultClass === 'loss' ? 'L' : resultClass === 'push' ? 'PUSH' : ''
      }

      if (!resultClass) continue

      // Skip if already correctly stamped
      if (scene.classList.contains(`result-${resultClass}`)) continue

      scene.classList.remove('result-win', 'result-loss', 'result-void', 'result-push')
      scene.classList.add(`result-${resultClass}`)

      // Inject overlay + stamp into photo area
      const photoArea = scene.querySelector('.card-photo-area') as HTMLElement | null
      if (!photoArea) continue
      photoArea.querySelectorAll('.card-result-overlay, .card-result-stamp').forEach(el => el.remove())
      const overlay = document.createElement('div')
      overlay.className = `card-result-overlay ${resultClass}`
      const stamp = document.createElement('div')
      stamp.className = `card-result-stamp ${resultClass}`
      stamp.textContent = stampText
      photoArea.appendChild(overlay)
      photoArea.appendChild(stamp)

      // Update Actual K on the card back
      const actualKEl = scene.querySelector('.pred-actual-k') as HTMLElement | null
      if (actualKEl && k !== null) {
        actualKEl.textContent = String(k)
        actualKEl.style.color = resultClass === 'win' ? '#3ab05a' : resultClass === 'push' ? '#999' : '#C44536'
      }
    }
  } catch (e) {
    console.warn('[pollResults]', e)
  }
}

function downloadCSV(picks: Pick[]) {
  const headers = ['Name','Hand','Opp','H/A','Rec','Line','Conf','Pred K','Result','Actual K']
  const rows = picks.map(p => [
    p.name, p.hand + 'HP', p.opp, p.ha, p.rec,
    String(p.line), p.conf, p.pred_k != null ? p.pred_k.toFixed(1) : '--',
    p.result ?? '', p.actual_k != null ? String(p.actual_k) : ''
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `statpacks-picks-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function setupObservers() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return
      e.target.classList.add('visible')
      e.target.querySelectorAll<HTMLElement>('.sf[data-w]').forEach(b => {
        setTimeout(() => { b.style.width = (b.dataset.w||'0')+'%' }, 100)
      })
    })
  }, {threshold:0.1, rootMargin:'0px 0px -40px 0px'})
  document.querySelectorAll('.fade-in').forEach(el => obs.observe(el))
  // fire immediately for above-fold elements
  const vh = window.innerHeight
  document.querySelectorAll<HTMLElement>('.fade-in').forEach(el => {
    if (el.getBoundingClientRect().top < vh) {
      el.classList.add('visible')
      el.querySelectorAll<HTMLElement>('.sf[data-w]').forEach(b => { b.style.width=(b.dataset.w||'0')+'%' })
    }
  })
}
