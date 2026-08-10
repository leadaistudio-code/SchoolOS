import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, CapabilityList } from '@/components/site/page-parts'
import { Transport as TransportShowcase } from '@/components/site/home/transport'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'School transport and live bus tracking',
  description:
    'Buses, routes and stops, student assignments, driver trip console, boarding records and parent tracking — with the map drawn from your own coordinates.',
  alternates: { canonical: '/transport' },
}

export default function TransportPage() {
  return (
    <>
      <PageIntro
        eyebrow="Transport"
        title="Routes, buses and the children on them."
        lead="School transport is the part of the day parents worry about and the office has least visibility of. It is also the part most often run on a WhatsApp group and a driver's memory."
      />

      <TransportShowcase />

      <ProseSection>
        <Prose title="The fleet">
          <p>
            Each bus carries its registration, capacity, driver, attendant and the expiry dates of
            its insurance, fitness and pollution certificates. Papers about to lapse are surfaced
            on the fleet list a month before they do, because a bus with expired insurance is not
            a paperwork problem — it is a bus that must not leave.
          </p>
        </Prose>

        <Prose title="Routes and children">
          <p>
            A route is an ordered list of stops with pickup and drop times and an optional fare.
            Children are assigned to a stop, not to a bus, so changing the vehicle on a route does
            not require touching two hundred records. Capacity is enforced: a full bus refuses
            another child.
          </p>
        </Prose>

        <Prose title="The trip">
          <p>
            A driver starts the trip on a phone. Location sharing begins with the trip and ends
            with it — a bus that is not on a school run is not the school&rsquo;s to follow. The driver
            marks each child on or absent at their stop, and the family is told either way.
          </p>
          <p>
            If a bus is running but has stopped reporting, that is shown as its own state. A
            vehicle out with children aboard and no signal is the case worth catching, and hiding
            it inside &ldquo;not running&rdquo; would be the wrong answer.
          </p>
        </Prose>

        <Prose title="What parents see">
          <p>
            Only their own child&rsquo;s bus: its position, the next stop, a rough arrival estimate, and
            the driver&rsquo;s name and phone number. When the bus is close to their stop they are told,
            once.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container wide>
          <CapabilityList
            groups={[
              {
                heading: 'Fleet',
                items: ['Bus records', 'Driver and attendant', 'Capacity', 'Insurance and fitness expiry', 'Maintenance history'],
              },
              {
                heading: 'Routes',
                items: ['Ordered stops', 'Pickup and drop times', 'Stop coordinates', 'Distance', 'Per-stop fares'],
              },
              {
                heading: 'Riders',
                items: ['Student assignments', 'Pickup, drop or both', 'Capacity enforcement', 'Riders per stop'],
              },
              {
                heading: 'Trips',
                items: ['Driver console', 'GPS ingestion', 'Boarding and absence', 'Trip history'],
              },
              {
                heading: 'Live map',
                items: ['Fleet status', 'Route progress', 'Arrival estimates', 'Signal-loss alerts'],
              },
              {
                heading: 'Families',
                items: ['Own child only', 'Driver contact', 'Approach notifications', 'Boarding confirmation'],
              },
            ]}
          />
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
