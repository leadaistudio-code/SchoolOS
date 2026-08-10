'use client'

import * as React from 'react'
import { Widget } from './widget'

/**
 * Keeps one failing widget from taking the page with it.
 *
 * A dashboard reads from a dozen places; a library table that will not load is
 * no reason to deny an administrator the attendance figure beside it.
 *
 * This has to be a client component: catching a render error still requires a
 * class component, and React's server build has no Component to extend. The
 * widget it wraps is rendered on the server and handed in as children, so
 * nothing about the panel itself moves to the browser.
 */
export class WidgetBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { title: string; children: React.ReactNode }) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (!this.state.failed) return this.props.children

    return (
      <Widget title={this.props.title}>
        <div className="grid place-items-center px-4 py-10 text-center" role="alert">
          <div>
            <p className="text-sm font-medium text-ink">This did not load</p>
            <p className="mt-1 max-w-xs text-xs text-ink-muted">
              The rest of the dashboard is unaffected. Reload the page to try again.
            </p>
          </div>
        </div>
      </Widget>
    )
  }
}
