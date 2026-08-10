import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container, Section } from '../container'
import { BusMap } from '@/components/transport/bus-map'

/**
 * Transport.
 *
 * The one section that gets a full-bleed dark treatment, because it is the
 * capability most schools cannot get anywhere else without buying a second
 * vendor and a tracking device subscription.
 *
 * The map is the product's actual renderer — the same component the live
 * tracking screen uses, given the same shape of data. It is drawn from the
 * school's own coordinates, which is the point of the copy beside it.
 */

const STOPS = [
  { id: '1', name: 'Green Park', latitude: 28.428, longitude: 77.002, sortOrder: 1, served: true, riders: 9, pickupTime: '07:10' },
  { id: '2', name: 'Rose Garden', latitude: 28.437, longitude: 77.009, sortOrder: 2, served: true, riders: 6, pickupTime: '07:18' },
  { id: '3', name: 'Market Square', latitude: 28.4455, longitude: 77.0155, sortOrder: 3, served: false, riders: 11, pickupTime: '07:25' },
  { id: '4', name: 'Metro Gate', latitude: 28.452, longitude: 77.021, sortOrder: 4, served: false, riders: 7, pickupTime: '07:33' },
  { id: '5', name: 'Lake View', latitude: 28.4565, longitude: 77.0245, sortOrder: 5, served: false, riders: 4, pickupTime: '07:40' },
]

const TRAIL = [
  { latitude: 28.428, longitude: 77.002 },
  { latitude: 28.4315, longitude: 77.0052 },
  { latitude: 28.437, longitude: 77.009 },
  { latitude: 28.4402, longitude: 77.0118 },
]

export function Transport() {
  return (
    <Section tone="navy">
      <Container wide>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <div>
            <p className="eyebrow">Transport</p>
            <h2 className="display mt-3 text-[clamp(2rem,4vw,2.9rem)]">
              The bus is where the school says it is.
            </h2>
            <p className="muted mt-5 text-[18px] leading-[1.55]">
              Drivers start a trip on a phone. The office sees the fleet move, and a parent sees
              only their own child&rsquo;s bus — with the driver&rsquo;s name and number, and an
              arrival estimate for their stop.
            </p>
            <p className="muted mt-4 text-[18px] leading-[1.55]">
              The map is drawn from your own coordinates rather than a tile provider, so where
              your pupils stand each morning is not sent to a third party on every pan.
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
              {[
                ['Routes and stops', 'Ordered, timed, with fares'],
                ['Boarding', 'Marked per child, per trip'],
                ['Documents', 'Insurance and fitness expiry'],
                ['Signal loss', 'Flagged, not hidden'],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="text-[15px] font-semibold text-white">{term}</dt>
                  <dd className="mt-0.5 text-[14px] text-[var(--on-dark-muted)]">{detail}</dd>
                </div>
              ))}
            </dl>

            <Link
              href="/transport"
              className="group mt-8 inline-flex items-center gap-1.5 text-[16px] font-medium text-white"
            >
              How transport works
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>

          <div className="rounded-2xl bg-white p-2">
            <BusMap
              className="h-[24rem] sm:h-[30rem]"
              label="BUS-02"
              stops={STOPS}
              trail={TRAIL}
              nextStopId="3"
              position={{
                latitude: 28.4425,
                longitude: 77.0132,
                headingDeg: 42,
                speedKph: 26,
              }}
              school={{ name: 'Campus', latitude: 28.4595, longitude: 77.0266 }}
            />
          </div>
        </div>
      </Container>
    </Section>
  )
}
