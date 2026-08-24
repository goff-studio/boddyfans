import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Stops a failure in the Firebase-backed routes from blanking the whole site.
 *
 * Without this, one throw anywhere under the provider unmounts everything —
 * which is exactly what a missing `VITE_FIREBASE_*` value did: the marketing
 * pages, which need no Firebase at all, went down with it.
 *
 * A class component because error boundaries have no hook equivalent.
 */
export class PanelBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the real stack reachable; the message below is deliberately vague.
    console.error('panel crashed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const misconfigured = /not configured/i.test(error.message)

    return (
      <div className="panelState">
        <h1 className="panelState__title">
          {misconfigured ? 'Not configured' : 'Something broke'}
        </h1>
        <p className="panelState__text">
          {misconfigured
            ? 'This build is missing its Firebase configuration, so sign-in and chat are unavailable. The rest of the site works.'
            : 'This page hit an error. The rest of the site is unaffected.'}
        </p>
        <a className="ghostbtn" href="/">
          <span className="ghostbtn__arrow" aria-hidden="true">
            ←
          </span>
          <span>BACK TO THE SITE</span>
        </a>
      </div>
    )
  }
}
