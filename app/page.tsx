'use client'
import { useEffect, useState, useRef } from 'react'
import Script from 'next/script'

/* ---- types ---- */
interface Shap { label: string; feat: string; val: number; pp: number }
interface Pick {
  name: string; mlbamid: string; opp: string; hand: string; ha: string
  rec: string; line: number; conf: string; pred_k: number
  pushers_up: Shap[]; pushers_down: Shap[]
  result: string | null; actual_k: number | null; pick_status?: string
  avg_ip?: number; k_pct?: number; barrel_pct?: number; stuff_plus?: number
  location_plus?: number; pitching_plus?: number; k_pct_l5?: number
}
interface Day { d:string;w:number;l:number;ow:number;ol:number;uw:number;ul:number;p:number }
interface Seg { l:string;w:number;lo:number;pct:number;e:number }
interface PicksData {
  updated: string
  season: { record:string;overs:string;unders:string;picks:number;date_range:string;overall_pct:string;over_pct:string;under_pct:string }
  pod: { name:string }
  daily: Day[]; backtestDaily: Day[]; overSegs: Seg[]; underSegs: Seg[]; picks: Pick[]
}

export default function Page() {
  const [data, setData] = useState<PicksData | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filter, setFilter] = useState<{hand:string;dir:string;ha:string}>({ hand:'all', dir:'all', ha:'all' })
  const [chartReady, setChartReady] = useState(false)
  const [chartMode, setChartMode] = useState<'cumulative' | 'rolling'>('cumulative')
  const chartRef     = useRef<HTMLCanvasElement>(null)
  const chartInstRef = useRef<any>(null)
  const chartSeenRef = useRef(false)

  useEffect(() => {
    fetch('/data/picks.json').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    if (!data) return
    populateHero(data.season, data.overSegs, data.underSegs)
    renderCal(data.daily)
    renderSegs(data.overSegs, 'ov-segs')
    renderSegs(data.underSegs, 'un-segs')
    setupObservers()

    // Auto-poll MLB results every hour
    const dateStr = data.updated.slice(0, 10) // YYYY-MM-DD
    pollResults(data.picks, dateStr)
    const interval = setInterval(() => pollResults(data.picks, dateStr), 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [data])

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
      chartInstRef.current = renderChart(data.daily, data.backtestDaily || [], canvas, chartMode, data.season)
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
          <a href="#">Home</a>
          <a href="#picks">Picks</a>
          <a href="/performance">Performance</a>
          <a href="#method">About</a>
        </div>
        <button className={`nav-hamburger${menuOpen?' open':''}`} aria-label="Menu" onClick={() => setMenuOpen(o=>!o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen?' open':''}`}>
        <a href="#" onClick={()=>setMenuOpen(false)}>Home</a>
        <a href="#picks" onClick={()=>setMenuOpen(false)}>Picks</a>
        <a href="/performance" onClick={()=>setMenuOpen(false)}>Performance</a>
        <a href="#method" onClick={()=>setMenuOpen(false)}>About</a>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-grid"/>
        <div className="hero-vignette"/>
        <div className="hero-content">
          <div className="hero-eyebrow">Sports Analytics · Predictive Models</div>
          <div className="hero-title">Stat<span>Packs</span></div>
          <div className="hero-sub">Built on data. Tracked honestly.</div>
          <div className="hero-record">
            <div className="hr-block"><div className="hr-lbl">Season Record</div><div className="hr-val" id="hr-record">--</div><div className="hr-pct o" id="hr-opct">--%</div></div>
            <div className="hr-block"><div className="hr-lbl">Unders</div><div className="hr-val" id="hr-unders">--</div><div className="hr-pct g" id="hr-upct">--%</div></div>
            <div className="hr-block"><div className="hr-lbl">Overs</div><div className="hr-val" id="hr-overs">--</div><div className="hr-pct r" id="hr-ovpct">--%</div></div>
            <div className="hr-block"><div className="hr-lbl">Picks</div><div className="hr-val" id="hr-picks">--</div><div className="hr-pct" style={{color:'rgba(245,241,230,0.35)'}} id="hr-range">--</div></div>
          </div>
          <div className="hero-cta">
            <a href="#picks" className="btn btn-primary">Browse Packs</a>
            <a href="#picks" className="btn btn-secondary">Today&apos;s Top Picks</a>
          </div>
        </div>
        <div className="hero-scroll"><div className="scroll-line"/><div className="scroll-txt">Scroll</div></div>
      </section>

      {/* STATS BAND */}
      <div className="stats-band"><div className="stats-band-inner">
        <div className="stat-item fade-in"><div className="stat-lbl">Model</div><div className="stat-num" style={{fontSize:'20px',fontFamily:"'Playfair Display',serif"}}>LightGBM</div><div className="stat-detail">Binary Classification</div></div>
        <div className="stat-item fade-in"><div className="stat-lbl">Thresholds</div><div className="stat-num" style={{color:'var(--blue)'}}>6</div><div className="stat-detail">3.5K through 8.5K</div></div>
        <div className="stat-item fade-in"><div className="stat-lbl">Breakeven</div><div className="stat-num" style={{color:'rgba(245,241,230,0.5)'}}>57.8<span style={{fontSize:'18px'}}>%</span></div><div className="stat-detail">At -110 juice</div></div>
        <div className="stat-item fade-in"><div className="stat-lbl">Edge</div><div className="stat-num"><span id="stat-edge">—</span><span style={{fontSize:'18px'}}>pp</span></div><div className="stat-detail" id="stat-edge-label">—</div></div>
        <div className="stat-item fade-in"><div className="stat-lbl">Best Segment</div><div className="stat-num" style={{fontSize:'20px',color:'#3ab05a'}} id="stat-best-seg-pct">—</div><div className="stat-detail" id="stat-best-seg-name">Loading…</div></div>
      </div></div>

      {/* PICKS */}
      <section className="picks-section" id="picks"><div className="picks-inner">
        <div className="sec-header fade-in">
          <div className="sec-eyebrow">Daily Picks</div>
          <div className="sec-title">Today&apos;s Recommendations</div>
          <div className="sec-sub">Picks generated from the V4 model. Tap a card to see model reasoning.</div>
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

      <div className="divider"/>

      {/* TRACKER */}
      <section className="tracker-section" id="tracker"><div className="tracker-inner">
        <div className="sec-header fade-in">
          <div className="sec-eyebrow">Season Tracker</div>
          <div className="sec-title">Full Model Performance</div>
          <div className="sec-sub">Complete season history. Every pick, every result, nothing hidden.</div>
        </div>
        <div className="trend-card fade-in">
          <div className="trend-header">
            <span className="trend-title">{chartMode === 'cumulative' ? 'Cumulative Win Rate' : 'Rolling Win Rate'}</span>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              {chartMode === 'cumulative' ? (
                <div className="legend">
                  <div className="leg"><div className="leg-line" style={{background:'#4EABDE'}}/> Live</div>
                  <div className="leg"><div className="leg-line" style={{background:'#D4AF37',opacity:0.8}}/> V2 Backtest</div>
                </div>
              ) : (
                <div className="legend">
                  <div className="leg"><div className="leg-line" style={{background:'#4EABDE'}}/> 7-Day</div>
                  <div className="leg"><div className="leg-line" style={{background:'#3ab05a'}}/> 30-Day</div>
                  <div className="leg"><div className="leg-line" style={{background:'#D4AF37',opacity:0.8}}/> V2 Backtest</div>
                </div>
              )}
              <select className="filter-select" value={chartMode}
                onChange={e => setChartMode(e.target.value as 'cumulative' | 'rolling')}
                style={{fontSize:'9px',padding:'4px 24px 4px 8px',minWidth:'unset'}}>
                <option value="cumulative">Cumulative</option>
                <option value="rolling">Rolling (7-Day)</option>
              </select>
            </div>
          </div>
          <div id="chartScroll" style={{overflowX: chartMode === 'rolling' ? 'auto' : 'hidden', overflowY:'hidden', WebkitOverflowScrolling:'touch' as any}}>
            <div style={{position:'relative',height:'160px',minWidth:'100%'}}><canvas id="trendChart" ref={chartRef}/></div>
          </div>
          {chartMode === 'rolling' && (
            <div style={{textAlign:'right',fontSize:'9px',color:'rgba(212,175,55,0.35)',marginTop:'4px',letterSpacing:'0.05em'}}>← scroll to view earlier dates</div>
          )}
        </div>
        <div className="fade-in" style={{marginBottom:'6px'}}><div className="sec-eyebrow" style={{marginBottom:'10px'}}>Daily Calendar</div></div>
        <div className="cal-grid fade-in" id="cal"/>
        <div className="segs-grid fade-in" style={{marginTop:'32px'}}>
          <div><div className="seg-col-h">Over Segments</div><div id="ov-segs"/></div>
          <div><div className="seg-col-h">Under Segments</div><div id="un-segs"/></div>
        </div>
      </div></section>

      <div className="divider"/>

      {/* METHOD */}
      <section className="method-section" id="method"><div className="method-inner">
        <div className="sec-header fade-in">
          <div className="sec-eyebrow">Methodology</div>
          <div className="sec-title">How the Model Works</div>
          <div className="sec-sub">A quantitative approach to MLB strikeout prediction.</div>
        </div>
        <div className="method-grid">
          {[
            {n:'01',title:'Feature Engineering',desc:'30+ features per start: pitcher K rate, pitch mix, velocity, movement, Savant opponent whiff rates by pitch type, opponent batting splits vs. handedness, and contextual factors.',tag:'30+ features'},
            {n:'02',title:'Binary Classifier',desc:'Six independent LightGBM classifiers — one per K threshold from 3.5 to 8.5. Each outputs a direct probability of exceeding that threshold.',tag:'LightGBM · 6 thresholds'},
            {n:'03',title:'Beta-Binomial Layer',desc:'A separate LightGBM regressor predicts raw strikeout count. A Beta-Binomial distribution converts that prediction into a calibrated probability, accounting for natural variance.',tag:'Probabilistic · overdispersion'},
            {n:'04',title:'Agreement Filter',desc:'A pick is only surfaced when both models agree on direction. Disagreements are dropped entirely.',tag:'Dual-model consensus'},
          ].map(m => (
            <div key={m.n} className="method-card fade-in">
              <div className="method-num">{m.n}</div>
              <div className="method-icon"><svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#D4AF37" strokeWidth="1.2"/></svg></div>
              <div className="method-title">{m.title}</div>
              <div className="method-desc">{m.desc}</div>
              <div className="method-tag">{m.tag}</div>
            </div>
          ))}
        </div>
      </div></section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand"><span style={{display:'inline-block',border:'2px solid var(--red)',borderRadius:'5px',padding:'5px 14px',fontFamily:"'Inter',sans-serif",fontSize:'14px',fontWeight:800,letterSpacing:'0.16em',color:'#fff'}}>StatPacks</span></div>
        <div className="footer-tagline">Collect the edge.</div>
        <div className="footer-sub">MLB K Model &nbsp;·&nbsp; 2026 Season &nbsp;·&nbsp; V4</div>
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

function populateHero(s: PicksData['season'], overSegs: Seg[], underSegs: Seg[]) {
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

    // Best segment
    const allSegs = [...(overSegs || []), ...(underSegs || [])]
    if (allSegs.length > 0) {
      const best = allSegs.reduce((a, b) => a.pct > b.pct ? a : b)
      countUp('stat-best-seg-pct', best.pct, 1300, 1, '%')
      setText('stat-best-seg-name', best.l)
    }

    // Edge — color + label driven by sign
    const livePct = parseFloat(s.overall_pct)
    if (!isNaN(livePct)) {
      const edgeVal = livePct - 57.8
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
    scene.addEventListener('click', () => scene.classList.toggle('flipped'))
    scene.innerHTML = buildCardHTML(p, podName, i)
    grid.appendChild(scene)
    scene.style.opacity = '0'
    setTimeout(() => { scene.style.opacity = ''; scene.classList.add('cascade-in') }, 120 + i * 80)
  })
}


function buildCardHTML(p: Pick, podName: string, _demoIdx = 0): string {
  const recClass = p.rec === 'OVER' ? 'over' : 'under'
  const confColor = p.rec === 'OVER' ? '#4EABDE' : '#e06050'
  const badgeColor = p.rec === 'OVER' ? '#c8a84b' : '#a04545'
  const badgeBg    = p.rec === 'OVER' ? 'rgba(200,168,75,0.12)' : 'rgba(158,64,64,0.14)'
  const badgeBorder = p.rec === 'OVER' ? 'rgba(200,168,75,0.45)' : 'rgba(158,64,64,0.5)'
  const isPod = p.name === podName
  const resultClass = p.result === 'win' ? 'win' : p.result === 'loss' ? 'loss' : ''
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

  // SHAP bars
  const allPP = [...(p.pushers_up||[]),...(p.pushers_down||[])].map(x=>x.pp)
  const maxPP = allPP.length ? Math.max(...allPP) : 1
  const shapRows = (arr: Shap[], color: string, sign: string) =>
    (arr||[]).slice(0,4).map(f => {
      const w = Math.round((f.pp/maxPP)*100)
      return `<div class="shap-row"><div class="shap-lbl">${f.label}</div><div class="shap-track"><div class="shap-fill" style="width:${w}%;background:${color}"></div></div><div class="shap-num" style="color:${color}">${sign}${f.pp.toFixed(0)}</div></div>`
    }).join('')
  const hasShap = (p.pushers_up?.length||0)+(p.pushers_down?.length||0) > 0
  const podTag = isPod ? `<div class="card-pod-tag">★ Pick of the Day</div>` : ''
  const resultOverlay = resultClass ? `<div class="card-result-overlay ${resultClass}"></div>` : ''
  const resultStamp = resultClass ? `<div class="card-result-stamp ${resultClass}">${resultClass==='win'?'W':'L'}</div>` : ''
  const imgTag = imgUrl ? `<img src="${imgUrl}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''
  const fbStyle = imgUrl ? '' : 'display:flex;'

  return `<div class="card-inner">
    <div class="card-front">
      ${podTag}
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
        <div class="card-pos-icon"><span>P</span></div>
      </div>
      <div class="card-pick-row">
        <div class="card-rec-badge" style="background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeColor}">${p.rec} ${p.line}K</div>
        <div class="card-pick-val" style="color:${badgeColor}">${p.conf}</div>
      </div>
      <div class="card-tap-hint">tap to flip</div>
      <div class="card-footer-strip">
        <span>StatPacks · V4</span><span>${p.hand}HP · ${p.ha}</span>
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
        <tr><th>Avg IP</th><th>K%</th><th>Barrel%</th><th>Stuff+</th><th>Loc+</th><th>Pitch+</th><th>K% L5</th></tr>
        <tr>
          <td>${fmt(bAvgIP as number)}</td>
          <td>${pctStr(bKPct as number)}</td>
          <td>${p.barrel_pct!=null?(p.barrel_pct*100).toFixed(1)+'%':'--'}</td>
          <td>${fmt(p.stuff_plus,0)}</td>
          <td>${fmt(p.location_plus,0)}</td>
          <td>${fmt(p.pitching_plus,0)}</td>
          <td>${pctStr(bKL5 as number)}</td>
        </tr>
      </table>
      <div class="back-divider"></div>
      <div class="pred-row">
        <div class="pred-cell"><div class="pred-lbl">Pred K</div><div class="pred-val">${fmt(p.pred_k)}</div></div>
        <div class="pred-cell"><div class="pred-lbl">Line</div><div class="pred-val">${p.line}</div></div>
        <div class="pred-cell"><div class="pred-lbl">P(line)</div><div class="pred-val" style="color:${confColor}">${p.conf}</div></div>
        <div class="pred-cell"><div class="pred-lbl">Actual K</div><div class="pred-val pred-actual-k" style="color:${p.actual_k != null ? (p.result === 'win' ? '#3ab05a' : '#C44536') : 'rgba(245,241,230,0.35)'}">${p.actual_k != null ? p.actual_k : '--'}</div></div>
      </div>
      ${hasShap
        ? `<div class="shap-block"><div class="shap-hdr">pushing over</div>${shapRows(p.pushers_up,'#3ab05a','+')}</div>
           <div class="shap-block"><div class="shap-hdr">pushing under</div>${shapRows(p.pushers_down,'#C44536','-')}</div>`
        : '<div class="no-shap">no model data</div>'
      }
      <div class="back-footer">
        <div class="back-footer-txt">StatPacks · V4</div>
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
    const good = s.pct >= 57.8
    const hue = good ? Math.min(140, 78+(s.pct-57.8)*3.2) : 0
    const lt = good ? 38 : 32+(57.8-s.pct)*0.5
    const fc = good ? `hsl(${hue},58%,${lt}%)` : 'hsl(0,60%,38%)'
    const eStr = (s.e>=0?'+':'')+s.e.toFixed(1)+'pp'
    const row = document.createElement('div')
    row.className = 'sr fade-in'
    row.innerHTML = `<div class="sl">${s.l}</div><div class="st"><div class="sf" style="width:0;background:${fc}" data-w="${s.pct.toFixed(1)}"></div><div class="sbe" style="left:57.8%"></div></div><div class="ss"><span class="${good?'g':'r'}">${eStr}</span></div>`
    c.appendChild(row)
  })
}

function renderChart(
  daily: Day[], btDaily: Day[], canvas: HTMLCanvasElement,
  mode: 'cumulative' | 'rolling', season?: any
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
  const grid = 'rgba(212,175,55,0.05)'
  const tick  = 'rgba(212,175,55,0.5)'

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

    // Reset canvas to responsive
    canvas.style.width  = ''
    canvas.style.height = '160px'
    canvas.removeAttribute('width')
    canvas.removeAttribute('height')

    return new Chart(canvas, {
      type: 'line',
      data: { labels: allDates, datasets: [
        { label: 'Live cumulative', data: liveCum, borderColor: '#4EABDE', borderWidth: 2.5, pointRadius: 2, pointBackgroundColor: '#4EABDE', fill: false, tension: 0.3, spanGaps: false },
        { label: 'V2 Backtest cumulative', data: btCum, borderColor: '#D4AF37', borderWidth: 2, borderDash: [5,3], pointRadius: 1.5, pointBackgroundColor: '#D4AF37', fill: false, tension: 0.3, spanGaps: false },
        { data: Array(n).fill(57.8), borderColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderDash: [2,4], pointRadius: 0, fill: false },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeInOutQuart' },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx:any) => ctx.dataset.label ? ctx.dataset.label + ': ' + ctx.parsed.y + '%' : '' }}},
        scales: {
          x: { ticks: { color: tick, font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { color: grid } },
          y: { min: 45, max: 82, ticks: { color: tick, font: { size: 9 }, callback: (v:number) => v + '%' }, grid: { color: grid } },
        },
      },
    })
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
    const btRoll     = roll(btDaily, 7).map((v, i) => btDates.has(allDates[i])   ? v : null)
    const liveRoll   = roll(daily,   7).map((v, i) => liveDates.has(allDates[i]) ? v : null)
    const liveRoll30 = roll(daily,  30).map((v, i) => liveDates.has(allDates[i]) ? v : null)

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

    const inst = new Chart(canvas, {
      type: 'line',
      plugins: [endLabelPlugin],
      data: { labels: allDates, datasets: [
        { label: '7-Day Live',   data: liveRoll,   borderColor: '#4EABDE', borderWidth: 2.5, pointRadius: 2,   pointBackgroundColor: '#4EABDE', fill: false, tension: 0.35, spanGaps: false },
        { label: '30-Day Live',  data: liveRoll30, borderColor: '#3ab05a', borderWidth: 2,   pointRadius: 1.5, pointBackgroundColor: '#3ab05a', fill: false, tension: 0.35, spanGaps: false },
        { label: 'V2 Backtest',  data: btRoll,     borderColor: '#D4AF37', borderWidth: 2,   pointRadius: 1.5, pointBackgroundColor: '#D4AF37', fill: false, tension: 0.35, spanGaps: false, borderDash: [5,3] },
        { data: Array(n).fill(57.8), borderColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderDash: [2,4], pointRadius: 0, fill: false },
      ]},
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeInOutQuart' },
        layout: { padding: { right: 115 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx:any) => ctx.dataset.label + ': ' + ctx.parsed.y + '%' }}},
        scales: {
          x: { ticks: { color: tick, font: { size: 9 }, maxRotation: 45 }, grid: { color: grid } },
          y: { min: 45, max: 82, ticks: { color: tick, font: { size: 9 }, callback: (v:number) => v + '%' }, grid: { color: grid } },
        },
      },
    })

    const scroll = document.getElementById('chartScroll')
    if (scroll) setTimeout(() => { scroll.scrollLeft = totalWidth }, 100)
    return inst
  }
}

async function pollResults(picks: Pick[], dateStr: string) {
  const ids = picks.map(p => p.mlbamid).filter(Boolean)
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
      const isFinal = info.game_state === 'Final'

      if (!isFinal) continue

      // Opener/DNP — pitcher didn't start
      let resultClass = ''
      let stampText   = ''
      if (!info.started) {
        resultClass = 'void'
        stampText   = 'DNP'
      } else if (k !== null) {
        if (rec === 'OVER')  resultClass = k > line ? 'win' : k < line ? 'loss' : ''
        if (rec === 'UNDER') resultClass = k < line ? 'win' : k > line ? 'loss' : ''
        stampText = resultClass === 'win' ? 'W' : 'L'
      }

      if (!resultClass) continue

      // Skip if already correctly stamped
      if (scene.classList.contains(`result-${resultClass}`)) continue

      scene.classList.remove('result-win', 'result-loss', 'result-void')
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
        actualKEl.style.color = resultClass === 'win' ? '#3ab05a' : '#C44536'
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
    String(p.line), p.conf, p.pred_k.toFixed(1),
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

