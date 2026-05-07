export default function StatsBand() {
  return (
    <div className="stats-band">
      <div className="stats-band-inner">
        <div className="stat-item">
          <div className="stat-lbl">Model</div>
          <div className="stat-num">LightGBM</div>
          <div className="stat-detail">Binary Classification</div>
        </div>
        <div className="stat-item">
          <div className="stat-lbl">Thresholds</div>
          <div className="stat-num" style={{ color: "var(--blue)" }}>6</div>
          <div className="stat-detail">3.5K through 8.5K</div>
        </div>
        <div className="stat-item">
          <div className="stat-lbl">Breakeven</div>
          <div className="stat-num" style={{ color: "rgba(245,241,230,0.5)" }}>57.8<span style={{ fontSize: "18px" }}>%</span></div>
          <div className="stat-detail">At standard -110 juice</div>
        </div>
        <div className="stat-item">
          <div className="stat-lbl">Edge</div>
          <div className="stat-num" style={{ color: "#3ab05a" }}>+3.8<span style={{ fontSize: "18px" }}>pp</span></div>
          <div className="stat-detail">Above breakeven</div>
        </div>
        <div className="stat-item">
          <div className="stat-lbl">Best Segment</div>
          <div className="stat-num" style={{ color: "#3ab05a", fontSize: "20px" }}>77.4%</div>
          <div className="stat-detail">RHP Home ≤4.5</div>
        </div>
      </div>
    </div>
  );
}