import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

/**
 * Session context and hook, kept apart from the provider component so that
 * AuthProvider.tsx exports only a component — otherwise Fast Refresh gives up
 * on the file and every auth edit costs a full reload.
 */

export type Role = 'admin' | 'client' | 'none'

export type Session = {
  user: User | null
  role: Role
  /** False until the first auth callback lands — do not redirect before then. */
  ready: boolean
  /** False when the VITE_FIREBASE_* values are missing from the build. */
  configured: boolean
  displayName: string | null
  signIn: (identifier: string, password: string) => Promise<void>
  signOutNow: () => Promise<void>
}

export const AuthContext = createContext<Session | null>(null)

export function useSession(): Session {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useSession must be used inside <AuthProvider>')
  return ctx
}
