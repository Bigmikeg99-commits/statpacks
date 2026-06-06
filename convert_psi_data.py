#!/usr/bin/env python3
"""
PSI+ CSV → JSON converter for StatPacks frontend
================================================
Run this script from Terminal after moving your CSVs into ~/Desktop/StatPacks/New Stat/

  python3 ~/Desktop/StatPacks/statpacks/convert_psi_data.py

Writes JSON files to ~/Desktop/StatPacks/statpacks/public/data/
which the /psi page fetches on load.
"""
import csv, json, os, sys

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
    return {
        'id':   r.get('pitcher', ''),
        'name': flip_name(r.get('player_name', '')),
        'psi':  num(r.get('METRIC'), 1),
        'role': r.get('role', ''),
        'k_pct':num(r.get('K_pct'), 1),
        'clw':  num(r.get('CLW'), 4),
        'velo': num(r.get('fb_velo_p95'), 1),
        'vaa':  num(r.get('fb_vaa_mean'), 2),
        'n':    int(float(r.get('n_pitches', 0) or 0)),
    }
convert('metric_v2_2026_live.csv', 'psi_leaderboard_2026.json', t_lb, 'pitchers')

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
    return {
        'w_clw':        round(float(r.get('w_clw', 0)) * 100),
        'w_velo':       round(float(r.get('w_velo', 0)) * 100),
        'w_vaa':        round(float(r.get('w_vaa', 0)) * 100),
        'hold_starter': num(r.get('hold_starter'), 4),
        'hold_all':     num(r.get('hold_all'), 4),
    }
convert('weight_optimization_results.csv', 'psi_weights.json', t_wt, 'combinations')

# ── 4. Rolling features (large file — loads on-demand) ──────────
def t_roll(r):
    return {
        'id':   r.get('pitcher', ''),
        'date': r.get('game_date', '')[:10],
        'psi':  num(r.get('PSI_plus'), 1),
        'clw':  num(r.get('PSI_CLW'), 4),
        'velo': num(r.get('PSI_velo_p95'), 1),
        'vaa':  num(r.get('PSI_vaa'), 2),
        'n':    int(float(r.get('PSI_n_pitches', 0) or 0)),
    }
convert('psi_rolling_features.csv', 'psi_rolling.json', t_roll, 'rows')

print("\nDone — refresh statpacks.app/psi to see your data.\n")
