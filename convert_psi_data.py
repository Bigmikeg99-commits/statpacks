#!/usr/bin/env python3
"""
PSI+ CSV → JSON converter for StatPacks frontend
================================================
Run this script from Terminal after moving your CSVs into ~/Desktop/StatPacks/New Stat/

  python3 ~/Desktop/StatPacks/statpacks/convert_psi_data.py

Writes only the minimized JSON files that the /psi page fetches.
Internal signal rankings, optimization grids, and the bulk rolling source
remain outside the public website directory.
"""
import csv, glob, json, math, os, tempfile

SRC = os.path.expanduser("~/Desktop/StatPacks/New Stat/")
DST = os.path.expanduser("~/Desktop/StatPacks/statpacks/public/data/")
os.makedirs(DST, exist_ok=True)

def num(v, d=1):
    try:
        value = float(v)
        return round(value, d) if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None

def write_json(path, data):
    """Write strict JSON atomically so an invalid/partial file is never published."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix='.psi-', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, separators=(',', ':'), allow_nan=False)
        os.replace(temp_path, path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise

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
    write_json(os.path.join(DST, dst_file), rows)
    print(f"  OK    {dst_file}  ({len(rows)} {label})")
    return len(rows)

print(f"\nPSI+ data converter")
print(f"Source: {SRC}")
print(f"Output: {DST}\n")

# ── 1. 2026 Leaderboard ──────────────────────────────────────────
public_player_ids = set()

def t_lb(r):
    player_id = (r.get('pitcher') or '').strip()
    if not player_id.isdigit():
        raise ValueError(f"Invalid MLB player ID in leaderboard: {player_id!r}")
    public_player_ids.add(player_id)
    slwr_raw = (r.get('SLWR') or '').strip()
    return {
        'id':    player_id,
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
leaderboard_count = convert(_lb_file, 'psi_leaderboard_2026.json', t_lb, 'pitchers')

# ── 2. Public rolling trajectories ───────────────────────────────
# The page fetches one shard per selected current leaderboard pitcher. Keep
# only the fields rendered by the public chart; do not publish the bulk source
# or unrelated research columns.
_max_date = ['']
rolling_source = os.path.join(SRC, 'psi_rolling_features.csv')
rolling_dir = os.path.join(DST, 'psi_rolling')

if leaderboard_count and os.path.exists(rolling_source):
    shards = {player_id: [] for player_id in public_player_ids}
    with open(rolling_source, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            player_id = (row.get('pitcher') or '').strip()
            if player_id not in shards:
                continue
            game_date = (row.get('game_date') or '')[:10]
            if not game_date:
                continue
            if game_date > _max_date[0]:
                _max_date[0] = game_date
            shards[player_id].append({
                'id': player_id,
                'date': game_date,
                'psi': num(row.get('PSI_plus'), 1),
            })

    generated = set()
    for player_id, rows in shards.items():
        rows.sort(key=lambda row: row['date'])
        filename = f'{player_id}.json'
        write_json(os.path.join(rolling_dir, filename), rows)
        generated.add(filename)

    for old_path in glob.glob(os.path.join(rolling_dir, '*.json')):
        if os.path.basename(old_path) not in generated:
            os.unlink(old_path)

    print(f"  OK    psi_rolling/  ({len(generated)} current-player trajectories)")
else:
    print("  SKIP  psi_rolling/ — leaderboard or rolling source unavailable")

# ── 3. Metadata — "as of" date for the leaderboard, derived from the
#      latest game_date actually present in the rolling features file.
#      This keeps the "Through [date]" tag on /psi in sync automatically
#      — no manual editing needed after each data refresh.
if _max_date[0]:
    write_json(os.path.join(DST, 'psi_meta.json'), {'asOf': _max_date[0]})
    print(f"  OK    psi_meta.json  (asOf {_max_date[0]})")
else:
    print(f"  SKIP  psi_meta.json — no game_date found in rolling features")

# Remove legacy public research/bulk exports. Their source CSVs remain in the
# model handoff directory; these copies are not consumed by the visible site.
for legacy_name in ('psi_signals.json', 'psi_weights.json', 'psi_rolling.json'):
    legacy_path = os.path.join(DST, legacy_name)
    if os.path.exists(legacy_path):
        os.unlink(legacy_path)
        print(f"  REMOVE {legacy_name} — not used by the public page")

print("\nDone — refresh statpacks.app/psi to see your data.\n")
