"use client"

import { Link } from "@tanstack/react-router"

import { ACME_PROPERTY_CONTENT } from "./property-content"
import { Container } from "./primitives"

/**
 * Acme Hotels storefront footer — the hotel directory, company links,
 * a contact block and social placeholders on the ink ground. The hotel
 * list is derived from the static Acme content map so it renders even
 * before the live portfolio resolves; each entry deep-links into the
 * dates-aware hotels page filtered to that city.
 */

const HOTELS: ReadonlyArray<{ name: string; city: string }> = [
  { name: "Acme Grand Hotel", city: "Bucharest" },
  { name: "Acme Seaside Resort", city: "Constanța" },
  { name: "Acme City Apartments", city: "Cluj-Napoca" },
]

const GRAND = ACME_PROPERTY_CONTENT["acme-grand"]

export function SiteFooter(): React.ReactElement {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-[var(--acme-ink)] text-[var(--acme-paper)]">
      <Container className="grid grid-cols-1 gap-12 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="acme-serif text-2xl">Acme</span>
            <span className="text-[0.6rem] uppercase tracking-[0.42em] text-white/50">Hotels</span>
          </div>
          <p className="max-w-xs text-sm text-white/60 leading-relaxed">
            A small Romanian collection of independent hotels and serviced apartments — booked
            direct, always at the best rate.
          </p>
        </div>

        <div>
          <FooterHeading>Hotels</FooterHeading>
          <ul className="space-y-3">
            {HOTELS.map((h) => (
              <li key={h.name}>
                <Link
                  to="/shop/hotels"
                  search={{ city: h.city }}
                  className="text-sm text-white/70 transition-colors hover:text-white"
                >
                  {h.name}
                  <span className="block text-white/40 text-xs">{h.city}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <FooterHeading>Company</FooterHeading>
          <ul className="space-y-3 text-sm text-white/70">
            <li>
              <Link to="/shop/about" className="transition-colors hover:text-white">
                About the group
              </Link>
            </li>
            <li>
              <Link to="/shop/contact" className="transition-colors hover:text-white">
                Contact
              </Link>
            </li>
            <li>
              <Link to="/shop/hotels" className="transition-colors hover:text-white">
                Book a stay
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <FooterHeading>Reservations</FooterHeading>
          <ul className="space-y-3 text-sm text-white/70">
            <li>
              <a href={`tel:${GRAND.phone.replace(/\s/g, "")}`} className="hover:text-white">
                {GRAND.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${GRAND.email}`} className="hover:text-white">
                {GRAND.email}
              </a>
            </li>
            <li className="text-white/50">Daily, 08:00–20:00 EET</li>
          </ul>
          <div className="mt-5 flex gap-3">
            {["Instagram", "Facebook", "LinkedIn"].map((s) => (
              <span
                key={s}
                title={s}
                aria-label={s}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-[0.6rem] text-white/60 uppercase tracking-wide"
              >
                {s.slice(0, 2)}
              </span>
            ))}
          </div>
        </div>
      </Container>

      <div className="border-white/10 border-t">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 text-white/45 text-xs sm:flex-row">
          <p>
            © {year} Acme Hotels. All rights reserved. Rates in EUR, taxes included where
            applicable.
          </p>
          <div className="flex gap-6">
            <span className="transition-colors hover:text-white/70">Privacy</span>
            <span className="transition-colors hover:text-white/70">Terms</span>
            <span className="transition-colors hover:text-white/70">Cookies</span>
          </div>
        </Container>
      </div>
    </footer>
  )
}

function FooterHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <h3 className="mb-4 text-[0.65rem] text-white/40 uppercase tracking-[0.2em]">{children}</h3>
  )
}
