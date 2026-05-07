import { NextRequest, NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'StatPacks/1.0 (statpacks.vercel.app)',
  'Accept': 'application/json',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date   = searchParams.get('date')   // YYYY-MM-DD
  const idsRaw = searchParams.get('ids') ?? ''
  const ids    = idsRaw.split(',').map(s => s.trim()).filter(Boolean)
  const debug  = searchParams.get('debug') === '1'

  if (!date || ids.length === 0) {
    return NextResponse.json({ _error: 'missing date or ids' })
  }

  const log: string[] = []

  try {
    // 1. Get schedule for the date → list of gamePks
    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`
    log.push(`fetching schedule: ${schedUrl}`)
    const schedRes = await fetch(schedUrl, { cache: 'no-store', headers: HEADERS })
    log.push(`schedule status: ${schedRes.status}`)
    if (!schedRes.ok) {
      return NextResponse.json({ _error: `schedule ${schedRes.status}`, _log: log })
    }
    const sched = await schedRes.json()

    const gamePks: number[] = []
    const gameStates: Record<number, string> = {}
    for (const d of sched.dates ?? []) {
      for (const g of d.games ?? []) {
        gamePks.push(g.gamePk)
        gameStates[g.gamePk] = g.status?.abstractGameState ?? 'Unknown'
      }
    }
    log.push(`gamePks: ${JSON.stringify(gamePks)}`)

    if (gamePks.length === 0) {
      return NextResponse.json(debug ? { _log: log } : {})
    }

    // 2. Fetch all boxscores in parallel, extract pitcher Ks by MLBAM ID
    const idSet = new Set(ids)
    const results: Record<string, { actual_k: number | null; game_state: string }> = {}

    await Promise.all(
      gamePks.map(async (pk) => {
        try {
          const bsRes = await fetch(
            `https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`,
            { cache: 'no-store', headers: HEADERS }
          )
          if (!bsRes.ok) { log.push(`game ${pk}: ${bsRes.status}`); return }
          const bs = await bsRes.json()

          const gameState: string = gameStates[pk] ?? 'Unknown'

          for (const side of ['home', 'away'] as const) {
            const pitchers: number[] = bs.teams?.[side]?.pitchers ?? []
            const players: Record<string, any> = bs.teams?.[side]?.players ?? {}

            for (const pid of pitchers) {
              const pidStr = String(pid)
              if (!idSet.has(pidStr)) continue
              const pitching = players[`ID${pid}`]?.stats?.pitching ?? {}
              results[pidStr] = {
                actual_k: pitching.strikeOuts ?? null,
                game_state: gameState,
              }
              log.push(`found ${pidStr}: k=${pitching.strikeOuts} state=${gameState}`)
            }
          }
        } catch (e) {
          log.push(`game ${pk} error: ${e}`)
        }
      })
    )

    const out = debug ? { ...results, _log: log } : results
    return NextResponse.json(out)
  } catch (err) {
    console.error('[/api/results]', err)
    return NextResponse.json({ _error: String(err), _log: log }, { status: 500 })
  }
}
