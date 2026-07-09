'use client'
import Link from 'next/link'
import { useState } from 'react'

export function NavBar({ activePath }: { activePath?: string }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const links = [
    { href: '/',            label: 'Home' },
    { href: '/psi',         label: 'PSI+',        gold: true },
    { href: '/#picks',      label: 'Picks' },
    { href: '/performance', label: 'Performance' },
    { href: '/picks',       label: 'Archive',     gold: true },
  ]

  return (
    <>
      <nav className="nav">
        <div className="nav-brand">
          <Link href="/">
            <div className="nav-logo-badge"><span>StatPacks</span></div>
          </Link>
        </div>
        <div className="nav-links">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              style={l.gold ? { color: 'var(--gold)' } : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button
          className={`nav-hamburger${menuOpen ? ' open' : ''}`}
          aria-label="Menu"
          onClick={() => setMenuOpen(o => !o)}
        >
          <span /><span /><span />
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen ? ' open' : ''}`}>
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setMenuOpen(false)}
            style={l.gold ? { color: 'var(--gold)' } : undefined}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </>
  )
}
