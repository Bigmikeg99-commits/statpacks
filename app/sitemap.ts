import type { MetadataRoute } from 'next'
import { readFileSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'https://statpacks.app'

interface ArchiveDay {
  date: string
}

export default function sitemap(): MetadataRoute.Sitemap {
  const archivePath = join(process.cwd(), 'public', 'data', 'picks_archive.json')
  const archive: ArchiveDay[] = JSON.parse(readFileSync(archivePath, 'utf-8'))

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/performance`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/psi`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/picks`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  const dayRoutes: MetadataRoute.Sitemap = archive.map(day => ({
    url: `${BASE_URL}/picks/${day.date}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
    lastModified: new Date(day.date),
  }))

  return [...staticRoutes, ...dayRoutes]
}
