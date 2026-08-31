'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { auth, onAuthStateChanged, type User } from '@/lib/auth'

type AuthState = { user: User | null; loading: boolean }

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setState({ user, loading: false })
    })
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
