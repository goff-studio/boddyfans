import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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
  const { signIn, user, role, ready } = useSession()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Already signed in: go where they were headed, or to their home surface.
  if (ready && user && role !== 'none') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? (role === 'admin' ? '/admin' : '/chat')} replace />
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn(identifier, password)
      navigate('/admin', { replace: true }) // RequireRole re-routes a client to /chat
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
