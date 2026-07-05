"use client"

import { createFileRoute, Link } from "@tanstack/react-router"
import { Container, Eyebrow, SectionHeading, Stars } from "@/components/storefront/site/primitives"
import {
  ACME_DIRECTORY,
  ACME_PROPERTY_CONTENT,
} from "@/components/storefront/site/property-content"

/**
 * Contact — a branded static page. Central reservations plus a card per
 * property with its address and direct phone/email (placeholders from
 * the Acme content map; the seeded rows carry no contact details).
 */
export const Route = createFileRoute("/(storefront)/shop_/contact")({
  component: ContactPage,
})

function ContactPage(): React.ReactElement {
  const flagship = ACME_PROPERTY_CONTENT["acme-grand"]

  return (
    <div className="bg-[var(--acme-paper)]">
      <Container className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <Eyebrow>Get in touch</Eyebrow>
          <SectionHeading as="h1" className="mt-4">
            Contact Acme Hotels
          </SectionHeading>
          <p className="mt-4 text-[var(--acme-ink-soft)] leading-relaxed">
            Our reservations team is here seven days a week. For a specific hotel, reach the front
            desk directly using the details below — they'll know your stay best.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-ink)] p-8 text-[var(--acme-paper)] sm:grid-cols-3">
          <div>
            <p className="acme-eyebrow text-[var(--acme-accent-soft)]">Central reservations</p>
            <a
              href={`tel:${flagship.phone.replace(/\s/g, "")}`}
              className="acme-serif mt-3 block text-2xl hover:text-white"
            >
              {flagship.phone}
            </a>
          </div>
          <div>
            <p className="acme-eyebrow text-[var(--acme-accent-soft)]">Email</p>
            <a
              href="mailto:reservations@acmehotels.example"
              className="mt-3 block text-sm text-white/80 hover:text-white"
            >
              reservations@acmehotels.example
            </a>
          </div>
          <div>
            <p className="acme-eyebrow text-[var(--acme-accent-soft)]">Hours</p>
            <p className="mt-3 text-sm text-white/80">Daily, 08:00–20:00 EET</p>
          </div>
        </div>

        <div className="mt-14">
          <SectionHeading as="h2" className="text-2xl">
            By hotel
          </SectionHeading>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {ACME_DIRECTORY.map((entry) => {
              const editorial = ACME_PROPERTY_CONTENT[entry.key]
              return (
                <div
                  key={entry.key}
                  className="flex flex-col rounded-sm border border-[var(--acme-line-strong)] bg-[var(--acme-surface)] p-6"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="acme-serif text-xl">{entry.name}</h3>
                    <Stars rating={entry.stars} className="mt-1.5 shrink-0" />
                  </div>
                  <p className="mt-3 text-[var(--acme-ink-soft)] text-sm leading-relaxed">
                    {entry.address}
                  </p>
                  <dl className="mt-4 space-y-1.5 border-[var(--acme-line)] border-t pt-4 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--acme-ink-faint)]">Phone</dt>
                      <dd>
                        <a
                          href={`tel:${editorial.phone.replace(/\s/g, "")}`}
                          className="hover:text-[var(--acme-accent)]"
                        >
                          {editorial.phone}
                        </a>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--acme-ink-faint)]">Email</dt>
                      <dd className="truncate">
                        <a
                          href={`mailto:${editorial.email}`}
                          className="hover:text-[var(--acme-accent)]"
                        >
                          {editorial.email}
                        </a>
                      </dd>
                    </div>
                  </dl>
                  <Link
                    to="/shop/hotels"
                    search={{ city: entry.city }}
                    className="acme-btn acme-btn-outline mt-5 w-full"
                  >
                    View hotel
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </Container>
    </div>
  )
}
