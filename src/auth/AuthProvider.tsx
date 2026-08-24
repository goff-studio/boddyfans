import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { getAuthClient, getDb, toLoginEmail } from '../firebase'
import { AuthContext, type Role, type Session } from './session'

/**
 * Session and role.
 *
 * Role is read from Firestore, not from the token: the Spark plan has no Admin
 * SDK, so there are no custom claims to put it in. `admins/{uid}` and
 * `users/{uid}` are both admin-writable only, which is what makes them
 * trustworthy — and it means a signed-in account with neither is `none`, i.e.
 * exactly as powerless as an anonymous visitor.
 *
 * This mirrors firestore.rules deliberately. The rules are the enforcement; the
 * role here only decides what UI to render.
 */



export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>('none')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    const stop = onAuthStateChanged(getAuthClient(), async (next) => {
      if (!active) return
      setUser(next)

      if (!next) {
        setRole('none')
        setDisplayName(null)
        setReady(true)
        return
      }

      // Two reads rather than one: admins/ is the only path that grants the
      // panel, and it must not be inferrable from a users/ document.
      //
      // Each read is caught separately. A rejected read is not the same as an
      // absent document, and a shared Promise.all would let one denial
      // collapse the whole role to 'none' — which is exactly how every client
      // ended up locked out of their own chat.
      const db = getDb()
      const quiet = <T,>(p: Promise<T>) => p.catch(() => null)
      try {
        const [adminSnap, userSnap] = await Promise.all([
          quiet(getDoc(doc(db, 'admins', next.uid))),
          quiet(getDoc(doc(db, 'users', next.uid))),
        ])
        if (!active) return
        if (adminSnap?.exists()) {
          setRole('admin')
          setDisplayName('Anna')
        } else if (userSnap?.exists()) {
          setRole('client')
          setDisplayName((userSnap.data().displayName as string) ?? null)
        } else {
          // Authenticated but not provisioned. Nothing is readable, so say so
          // rather than showing an empty panel.
          setRole('none')
          setDisplayName(null)
        }
      } catch {
        if (active) {
          setRole('none')
          setDisplayName(null)
        }
      } finally {
        if (active) setReady(true)
      }
    })

    return () => {
      active = false
      stop()
    }
  }, [])

  const value = useMemo<Session>(
    () => ({
      user,
      role,
      ready,
      displayName,
      signIn: async (identifier, password) => {
        await signInWithEmailAndPassword(getAuthClient(), toLoginEmail(identifier), password)
      },
      signOutNow: async () => {
        await signOut(getAuthClient())
      },
    }),
    [user, role, ready, displayName],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
