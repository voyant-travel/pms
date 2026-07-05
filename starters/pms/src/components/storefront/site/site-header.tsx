"use client"

import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { Container } from "./primitives"

/**
 * Acme Hotels storefront header — a slim sticky bar with a serif
 * wordmark, quiet-luxury nav and a single brass "Book now" call to
 * action. Collapses to a full-height overlay menu on narrow viewports.
 */

interface NavItem {
  label: string
  to: string
}

const NAV: readonly NavItem[] = [
  { label: "Our Hotels", to: "/shop/hotels" },
  { label: "About", to: "/shop/about" },
  { label: "Contact", to: "/shop/contact" },
]

function Wordmark(): React.ReactElement {
  return (
    <Link to="/shop" className="flex items-baseline gap-2" aria-label="Acme Hotels — home">
      <span className="acme-serif text-2xl leading-none tracking-tight">Acme</span>
      <span className="text-[0.6rem] uppercase tracking-[0.42em] text-[var(--acme-ink-faint)]">
        Hotels
      </span>
    </Link>
  )
}

export function SiteHeader(): React.ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-[var(--acme-line)] border-b bg-[var(--acme-paper)]/85 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between sm:h-20">
        <Wordmark />

        <nav className="hidden items-center gap-9 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="acme-nav-link text-[var(--acme-ink-soft)] hover:text-[var(--acme-ink)]"
              activeProps={{ "data-active": "true" }}
            >
              {item.label}
            </Link>
          ))}
          <Link to="/shop/hotels" className="acme-btn acme-btn-ink">
            Book now
          </Link>
        </nav>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-3 w-6">
            <span
              className={`absolute left-0 block h-px w-6 bg-[var(--acme-ink)] transition-all duration-300 ${
                open ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 block h-px w-6 bg-[var(--acme-ink)] transition-all duration-300 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 block h-px w-6 bg-[var(--acme-ink)] transition-all duration-300 ${
                open ? "top-1.5 -rotate-45" : "top-3"
              }`}
            />
          </span>
        </button>
      </Container>

      {open ? (
        <div className="border-[var(--acme-line)] border-t bg-[var(--acme-paper)] md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="py-3 text-[var(--acme-ink)] text-lg"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/shop/hotels"
              className="acme-btn acme-btn-ink mt-3 w-full"
              onClick={() => setOpen(false)}
            >
              Book now
            </Link>
          </Container>
        </div>
      ) : null}
    </header>
  )
}
