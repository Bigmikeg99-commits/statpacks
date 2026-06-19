#!/usr/bin/env python3
"""
PSI+ CSV → JSON converter for StatPacks frontend
================================================
Run this script from Terminal after moving your CSVs into ~/Desktop/StatPacks/New Stat/

  python3 ~/Desktop/StatPacks/statpacks/convert_psi_data.py

Writes JSON files to ~/Desktop/StatPacks/statpacks/public/data/
which the /psi page fetches on load.
"""
import csv, json, os, sys, glob

SRC = os.path.expanduser("~/Desktop/StatPacks/New Stat/")
DST = os.path.expanduser("~/Desktop/StatPacks/statpacks/public/data/")
os.makedirs(DST, exist_ok=True)

def num(v, d=1):
    try: return round(float(v), d)
    except: return None

def flip_name(raw):
    """'Cease, Dylan' → 'Dylan Cease'"""
    parts = raw.strip().split(', ')
    return f"{parts[1]} {parts[0]}" if len(parts) == 2 else raw.strip()

def convert(src_file, dst_file, transform, label):
    path = os.path.join(SRC, src_file)
    if not os.path.exists(path):
        print(f"  SKIP  {src_file} — not found in {SRC}")
        return 0
    rows = []
    with open(path, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.append(transform(r))
    with open(os.path.join(DST, dst_file), 'w') as f:
        json.dump(rows, f, separators=(',', ':'))
    print(f"  OK    {dst_file}  ({len(rows)} {label})")
    return len(rows)

print(f"\nPSI+ data converter")
print(f"Source: {SRC}")
print(f"Output: {DST}\n")

# ── 1. 2026 Leaderboard ──────────────────────────────────────────
def t_lb(r):
    slwr_raw = (r.get('SLWR') or '').strip()
    return {
        'id':    r.get('pitcher', ''),
        'name':  flip_name(r.get('player_name', '')),
        'psi':   num(r.get('METRIC'), 1),
        'role':  r.get('role', ''),
        'k_pct': num(r.get('K_pct'), 4),
        'clw':   num(r.get('CLW'), 4),
        'velo':  num(r.get('fb_velo_p95'), 1),
        'vaa':   num(r.get('fb_vaa_mean'), 2),
        'n':     int(float(r.get('n_pitches', 0) or 0)),
        'slwr':  num(slwr_raw, 3) if slwr_raw not in ('', 'nan', 'None', 'NA') else None,
    }
_lb_matches = sorted(glob.glob(os.path.join(SRC, 'metric_*2026_live.csv')), key=os.path.getmtime, reverse=True)
_lb_file = os.path.basename(_lb_matches[0]) if _lb_matches else 'metric_2026_live.csv'
print(f"  Using  {_lb_file}")
convert(_lb_file, 'psi_leaderboard_2026.json', t_lb, 'pitchers')

# ── 2. Signal rankings ───────────────────────────────────────────
def t_sig(r):
    return {
        'signal': r.get('signal', ''),
        'yoy_r':  num(r.get('yoy_r'), 4),
        'same_r': num(r.get('same_year_r'), 4),
        'cat':    r.get('category', ''),
    }
# We sort by yoy_r after collecting all rows
path = os.path.join(SRC, 'path_c_signal_rankings.csv')
if os.path.exists(path):
    rows = []
    with open(path, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.append(t_sig(r))
    rows.sort(key=lambda x: x['yoy_r'] or 0, reverse=True)
    with open(os.path.join(DST, 'psi_signals.json'), 'w') as f:
        json.dump(rows, f, separators=(',', ':'))
    print(f"  OK    psi_signals.json  ({len(rows)} signals, sorted by yoy_r)")
else:
    print(f"  SKIP  path_c_signal_rankings.csv — not found")

# ── 3. Weight optimization ───────────────────────────────────────
def t_wt(r):
    w_slwr = r.get('w_slwr')
    return {
        'w_clw':        round(float(r.get('w_clw', 0)) * 100),
        'w_velo':       round(float(r.get('w_velo', 0)) * 100),
        'w_vaa':        round(float(r.get('w_vaa', 0)) * 100),
        'w_slwr':       round(float(w_slwr) * 100) if w_slwr else None,
        'hold_starter': num(r.get('hold_starter'), 4),
        'hold_all':     num(r.get('hold_all'), 4),
    }
convert('weight_optimization_v2_results.csv', 'psi_weights.json', t_wt, 'combinations')

# ── 4. Rolling features (large file — loads on-demand) ──────────
_max_date = ['']
def t_roll(r):
    def safe_num(key, d=4):
        v = (r.get(key) or '').strip()
        return num(v, d) if v not in ('', 'nan', 'None', 'NA') else None
    d = r.get('game_date', '')[:10]
    if d and d > _max_date[0]:
        _max_date[0] = d
    return {
        'id':      r.get('pitcher', ''),
        'date':    d,
        'psi':     safe_num('PSI_plus', 1),
        'clw':     safe_num('PSI_CLW', 4),
        'velo':    safe_num('PSI_velo_p95', 1),
        'vaa':     safe_num('PSI_vaa', 2),
        'n':       int(float(r.get('PSI_n_pitches', 0) or 0)),
        'slwr':    safe_num('SLWR', 4),
        'spin_ff': safe_num('spin_FF', 1),
        'spin_si': safe_num('spin_SI', 1),
        'spin_fc': safe_num('spin_FC', 1),
        'ext_fb':  safe_num('ext_FB', 3),
    }
convert('psi_rolling_features.csv', 'psi_rolling.json', t_roll, 'rows')

# ── 5. Metadata — "as of" date for the leaderboard, derived from the
#      latest game_date actually present in the rolling features file.
#      This keeps the "Through [date]" tag on /psi in sync automatically
#      — no manual editing needed after each data refresh.
if _max_date[0]:
    with open(os.path.join(DST, 'psi_meta.json'), 'w') as f:
        json.dump({'asOf': _max_date[0]}, f)
    print(f"  OK    psi_meta.json  (asOf {_max_date[0]})")
else:
    print(f"  SKIP  psi_meta.json — no game_date found in rolling features")

print("\nDone — refresh statpacks.app/psi to see your data.\n")
