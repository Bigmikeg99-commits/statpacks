"use client";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-grid"></div>
      <div className="hero-vignette"></div>
      <div className="hero-content">
        <div className="hero-eyebrow">Sports Analytics · Predictive Models</div>
        <div className="hero-title">Stat<span>Packs</span></div>
        <div className="hero-sub">Built on data. Tracked honestly.</div>

        {/* Hero Record Panel */}
        <div className="hero-record">
          <div className="hr-block">
            <div className="hr-lbl">Season Record</div>
            <div className="hr-val">194-108</div>
            <div className="hr-pct o">61.6%</div>
          </div>
          <div className="hr-block">
            <div className="hr-lbl">Unders</div>
            <div className="hr-val">194-108</div>
            <div className="hr-pct g">64.2%</div>
          </div>
          <div className="hr-block">
            <div className="hr-lbl">Overs</div>
            <div className="hr-val">104-78</div>
            <div className="hr-pct r">57.1%</div>
          </div>
          <div className="hr-block">
            <div className="hr-lbl">Picks</div>
            <div className="hr-val">484</div>
            <div className="hr-pct" style={{ color: "rgba(245,241,230,0.35)" }}>3/26–4/21</div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="hero-cta">
          <a href="#picks" className="btn btn-primary">Browse Packs</a>
          <a href="#picks" className="btn btn-secondary">Today&apos;s Top Picks</a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="hero-scroll">
        <div className="scroll-line"></div>
        <div className="scroll-txt">Scroll</div>
      </div>
    </section>
  );
}