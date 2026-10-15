import { createContext, useContext, useEffect, useState } from 'react'
import { currentUser, login as apiLogin, logout as apiLogout } from './authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  // Recupera a sessão existente (cookie do BFF ou sessão simulada)
  useEffect(() => {
    let active = true
    currentUser().then(u => {
      if (active) {
        setUser(u)
        setChecking(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  async function login(email, password) {
    const u = await apiLogin(email, password)
    setUser(u)
    return u
  }

  async function logout() {
    await apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
