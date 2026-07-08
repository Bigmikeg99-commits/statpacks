import { NextRequest, NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'StatPacks/1.0 (statpacks.vercel.app)',
  'Accept': 'application/json',
}

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date   = searchParams.get('date')   // YYYY-MM-DD
  const idsRaw = searchParams.get('ids') ?? ''

  // ids format: "mlbamid:teamId,mlbamid:teamId,..." — teamId is optional for back-compat
  const idEntries = idsRaw.split(',').map(s => s.trim()).filter(Boolean)
  const ids: string[] = []
  const mlbamToTeam: Record<string, number> = {}
  for (const entry of idEntries) {
    const [mlbamid, teamIdStr] = entry.split(':')
    if (mlbamid) {
      ids.push(mlbamid)
      if (teamIdStr) mlbamToTeam[mlbamid] = parseInt(teamIdStr)
    }
  }

  if (!date || ids.length === 0) return NextResponse.json({})

  try {
    // 1. Get schedule with linescore hydration → gamePks + game states + live inning
    const schedRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore`,
      { cache: 'no-store', headers: HEADERS }
    )
    if (!schedRes.ok) return NextResponse.json({})
    const sched = await schedRes.json()

    const gamePks: number[] = []
    const gameStates: Record<number, string> = {}
    const gameSituations: Record<number, string | null> = {}  // "Top 5th", "Bot 7th", etc.
    const gameTeams: Record<number, number[]> = {}            // gamePk → [homeId, awayId]
    const postponedTeamIds = new Set<number>()
    const teamGameState: Record<number, string> = {}
    const teamGamePk: Record<number, number> = {}

    for (const d of sched.dates ?? []) {
      for (const g of d.games ?? []) {
        gamePks.push(g.gamePk)
        const state = g.status?.abstractGameState ?? 'Unknown'
        gameStates[g.gamePk] = state
        const detailed: string = g.status?.detailedState ?? ''

        // Live inning situation
        if (state === 'Live') {
          const inning: number = g.linescore?.currentInning ?? 0
          const half: string   = g.linescore?.inningHalf ?? ''   // "Top" or "Bottom"
          const halfAbbr = half.toLowerCase().startsWith('bot') ? 'Bot' : 'Top'
          gameSituations[g.gamePk] = inning > 0 ? `${halfAbbr} ${ordinal(inning)}` : null
        } else {
          gameSituations[g.gamePk] = null
        }

        if (detailed.toLowerCase().includes('postponed')) {
          const homeId: number = g.teams?.home?.team?.id
          const awayId: number = g.teams?.away?.team?.id
          if (homeId) postponedTeamIds.add(homeId)
          if (awayId) postponedTeamIds.add(awayId)
        }
        const homeId: number = g.teams?.home?.team?.id
        const awayId: number = g.teams?.away?.team?.id
        if (homeId) { teamGameState[homeId] = state; teamGamePk[homeId] = g.gamePk }
        if (awayId) { teamGameState[awayId] = state; teamGamePk[awayId] = g.gamePk }
        gameTeams[g.gamePk] = [homeId, awayId].filter(Boolean)
      }
    }

    if (gamePks.length === 0) return NextResponse.json({})

    // 2. Fetch boxscores in parallel, extract pitcher Ks by MLBAM ID
    const idSet = new Set(ids)
    const results: Record<string, { actual_k: number | null; game_state: string; started: boolean; innings_pitched: string | null; game_situation: string | null }> = {}
    const pitcherGame: Record<string, number> = {}  // mlbamid → gamePk

    await Promise.all(
      gamePks.map(async (pk) => {
        try {
          const bsRes = await fetch(
            `https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`,
            { cache: 'no-store', headers: HEADERS }
          )
          if (!bsRes.ok) return
          const bs = await bsRes.json()
          const gameState = gameStates[pk] ?? 'Unknown'

          for (const side of ['home', 'away'] as const) {
            const pitchers: number[] = bs.teams?.[side]?.pitchers ?? []
            const players: Record<string, any> = bs.teams?.[side]?.players ?? {}
            const starterId = pitchers.length > 0 ? String(pitchers[0]) : null
            for (const pid of pitchers) {
              const pidStr = String(pid)
              if (!idSet.has(pidStr)) continue
              const pitching = players[`ID${pid}`]?.stats?.pitching ?? {}
              pitcherGame[pidStr] = pk
              results[pidStr] = {
                actual_k: pitching.strikeOuts ?? null,
                game_state: gameState,
                started: pidStr === starterId,
                innings_pitched: pitching.inningsPitched ?? null,
                game_situation: gameSituations[pk] ?? null,
              }
            }
          }
        } catch { /* skip failed game */ }
      })
    )

    // 3. Resolve PPD / DNP
    for (const mlbamid of ids) {
      if (results[mlbamid]) continue
      const teamId = mlbamToTeam[mlbamid]
      if (!teamId) continue
      if (postponedTeamIds.has(teamId)) {
        results[mlbamid] = { actual_k: null, game_state: 'Postponed', started: false, innings_pitched: null, game_situation: null }
      } else if (teamGameState[teamId] === 'Final') {
        results[mlbamid] = { actual_k: null, game_state: 'Final', started: false, innings_pitched: null, game_situation: null }
      }
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('[/api/results]', err)
    return NextResponse.json({})
  }
}
