"use client"

import { AvailabilityBar } from "./availability-bar"
import { picsum } from "./property-content"
import { Container } from "./primitives"
import type { PropertyPortfolioItem } from "./use-property-portfolio"

/**
 * Full-bleed home hero: a single large image, a restrained serif
 * headline, and the availability bar floating over the lower edge.
 */
export function Hero({
  items,
}: {
  items: ReadonlyArray<PropertyPortfolioItem>
}): React.ReactElement {
  return (
    <section className="relative isolate flex min-h-[88vh] flex-col justify-end overflow-hidden">
      <img
        src={picsum("acme-hero-romania", 2400, 1500)}
        alt="An Acme hotel interior"
        className="-z-10 absolute inset-0 h-full w-full object-cover"
      />
      <div className="-z-10 absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/55" />

      <Container className="pt-28 pb-10">
        <div className="max-w-2xl acme-rise text-white">
          <p className="text-[0.7rem] uppercase tracking-[0.32em] text-white/75">
            Romania · Independent hotels since 1924
          </p>
          <h1 className="acme-serif mt-5 text-balance text-5xl leading-[1.05] sm:text-6xl">
            Stay somewhere with a story
          </h1>
          <p className="mt-5 max-w-lg text-lg text-white/85 leading-relaxed">
            Three distinct addresses — a Belle Époque landmark in Bucharest, a beachfront resort
            on the Black Sea, and serviced apartments in Cluj-Napoca. Book direct for our best rate.
          </p>
        </div>

        <div className="mt-10">
          <AvailabilityBar items={items} variant="hero" />
        </div>
      </Container>
    </section>
  )
}
