import { readFileSync } from 'fs'
import { join } from 'path'

/* ---- types ---- */
export interface ArchivePick {
  name: string
  team: string
  opp: string
  hand: string
  ha: string
  rec: string
  line: number
  pred_k: number
  edge: number
  actual_k: number | null
  result: string | null
  mlbamid?: string
}

export interface ArchiveDay {
  date: string
  picks: ArchivePick[]
}

export interface DayRecord {
  w: number
  l: number
  p: number
}

/* ---- model version config ---- */
// Single source of truth for model version ranges.
// Update this when a new model version ships.
export const MODEL_VERSIONS = [
  { from: '2026-03-26', to: '2026-06-10', label: 'V1 Model' },
  { from: '2026-06-11', to: null as string | null, label: 'PSI+ V2' },
]

export function getModelLabel(date: string): string {
  for (const v of MODEL_VERSIONS) {
    if (date >= v.from && (v.to === null || date <= v.to)) return v.label
  }
  return 'V1 Model'
}

/* ---- helpers ---- */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${MONTHS[+m - 1]} ${+d}, ${y}`
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function computeRecord(picks: ArchivePick[]): DayRecord {
  return picks.reduce(
    (a, p) => {
      if (p.result === 'W') a.w++
      else if (p.result === 'L') a.l++
      else if (p.result === 'push' || p.result === 'P') a.p++
      return a
    },
    { w: 0, l: 0, p: 0 }
  )
}

export function dotColor(r: string | null): string {
  if (r === 'W') return '#3ab05a'
  if (r === 'L') return '#C44536'
  if (r === 'push' || r === 'P') return '#D4AF37'
  if (r === 'PPD') return '#4EABDE'
  return 'transparent'
}

export function resultLabel(r: string | null): string {
  if (r === 'W') return 'Win'
  if (r === 'L') return 'Loss'
  if (r === 'push' || r === 'P') return 'Push'
  if (r === 'PPD') return 'PPD'
  return 'Pending'
}

export function recordColor(w: number, l: number): string {
  const pct = (w + l) > 0 ? w / (w + l) : 0
  if (pct >= 0.524) return '#3ab05a'
  if (pct >= 0.5) return '#D4AF37'
  return '#C44536'
}

/* ---- data loading ---- */
export function loadArchive(): ArchiveDay[] {
  const filePath = join(process.cwd(), 'public', 'data', 'picks_archive.json')
  return JSON.parse(readFileSync(filePath, 'utf-8')) as ArchiveDay[]
}
