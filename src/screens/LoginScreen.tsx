import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wordmark } from '../components/Chrome'
import { Pressable } from '../motion/primitives'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { useSession } from '../auth/session'

/**
 * One sign-in form for both roles. Anna uses her email address, clients use the
 * username she issued them — `toLoginEmail` decides which by looking for an "@",
 * so neither has to know the synthetic-email trick underneath.
 */
export function LoginScreen() {
  const { signIn, user, role, ready, signOutNow } = useSession()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const location = useLocation()

  // Already signed in: go where they were headed, or to their home surface.
  if (ready && user && role !== 'none') {
    const from = (location.state as { from?: string } | null)?.from
    const home = role === 'admin' ? '/admin' : '/chat'
    // Only honour `from` if this role can actually open it, or a client bounced
    // off /admin would be sent straight back to it.
    const allowed = role === 'admin' || from === '/chat'
    return <Navigate to={allowed && from ? from : home} replace />
  }

  // Signed in but never provisioned. Say so here rather than letting the form
  // sit there looking like the submit silently failed.
  if (ready && user && role === 'none') {
    return (
      <div className="panelState">
        <h1 className="panelState__title">No access yet</h1>
        <p className="panelState__text">
          This account exists but has not been given access. Anna needs to
          approve a booking for it.
        </p>
        <button type="button" className="ghostbtn" onClick={() => void signOutNow()}>
          <span>SIGN OUT</span>
        </button>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn(identifier, password)
      // Deliberately no navigate() here. The role is resolved asynchronously by
      // AuthProvider, so there is nothing to route on yet — the redirect below
      // fires on the next render once it lands. Navigating to /admin eagerly is
      // what sent every client to a "No access" screen.
    } catch (e) {
      // "No such user" and "wrong password" stay indistinguishable — that
      // difference tells an attacker which usernames exist. A missing build
      // config is a different thing entirely and worth saying out loud.
      setError(
        e instanceof Error && e.message === 'NOT_CONFIGURED'
          ? 'Sign-in is unavailable: this build is missing its Firebase configuration.'
          : 'That username or password is not right.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <header className="topbar">
        <Wordmark />
      </header>

      <motion.div
        className="auth__body"
        initial={{ opacity: 0, transform: 'translateY(10px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: DURATION.short, ease: EASE_OUT }}
      >
        <form className="auth__form form" onSubmit={submit}>
          <p className="booking__eyebrow">ATELIER ACCESS</p>
          <h1 className="booking__title">Sign in</h1>
          <p className="booking__lede">
            Use the username and password Anna gave you.
          </p>

          <label className="field">
            <span className="field__label">Username or email</span>
            <input
              className="field__input"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="field__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="booking__actions">
            <Pressable
              className="cta"
              type="submit"
              disabled={busy || !identifier || !password}
            >
              <span>{busy ? 'SIGNING IN…' : 'SIGN IN'}</span>
              <span className="cta__arrow" aria-hidden="true">
                →
              </span>
            </Pressable>
          </div>

          <p className="auth__note">
            No sign-up here — Anna issues every account. Lost your password? She
            can reissue it.
          </p>
        </form>
      </motion.div>
    </div>
  )
}
