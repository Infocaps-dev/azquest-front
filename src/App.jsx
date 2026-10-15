import { useState } from 'react'
import { Loading, Theme } from '@carbon/react'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AppHeader from './components/Chat/AppHeader.jsx'
import ChatPage from './components/Chat/ChatPage.jsx'
import MonitoramentoPage from './components/Monitoramento/MonitoramentoPage.jsx'
import LoginPage from './components/Login/LoginPage.jsx'

function Gate() {
  const { user, checking } = useAuth()
  // Navegação por estado, sem router: são duas telas e o Piloto não precisa de
  // URL própria por aba. Trocar por react-router quando houver link direto.
  const [aba, setAba] = useState('inicio')
  if (checking) {
    return (
      <div className="login-loading">
        <Loading withOverlay={false} description="Verificando sessão" />
      </div>
    )
  }
  if (!user) return <LoginPage />

  return (
    <>
      <AppHeader aba={aba} onTrocarAba={setAba} />
      {aba === 'monitoramento' ? <MonitoramentoPage /> : <ChatPage />}
    </>
  )
}

function App() {
  return (
    <Theme theme="white">
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </Theme>
  )
}

export default App
