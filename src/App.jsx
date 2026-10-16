import { useState } from 'react'
import { Loading, Theme } from '@carbon/react'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AppHeader from './components/Chat/AppHeader.jsx'
import ChatPage from './components/Chat/ChatPage.jsx'
import AnalisePage from './components/AnaliseCredito/AnalisePage.jsx'
import MonitoramentoPage from './components/Monitoramento/MonitoramentoPage.jsx'
import DesempenhoPage from './components/Desempenho/DesempenhoPage.jsx'
import LoginPage from './components/Login/LoginPage.jsx'
import AvisosRelatorios from './components/Avisos/AvisosRelatorios.jsx'
import { useNovosRelatorios } from './hooks/useNovosRelatorios'

function Gate() {
  const { user, checking } = useAuth()
  // Navegação por estado, sem router: são duas telas e o Piloto não precisa de
  // URL própria por aba. Trocar por react-router quando houver link direto.
  const [aba, setAba] = useState('inicio')
  // Relatório novo (gerado pelo chat, pelo "Reprocessar" ou versão nova de
  // ajuste): aviso em qualquer aba, e o "Abrir" leva à Análise de Crédito com
  // ele selecionado. `alvo.n` muda a cada clique, para reabrir o mesmo id.
  const { avisos, dispensar, sinal } = useNovosRelatorios(Boolean(user))
  const [alvo, setAlvo] = useState(null)
  function abrirRelatorio(relatorioId) {
    setAlvo(atual => ({ id: relatorioId, n: (atual?.n || 0) + 1 }))
    setAba('analise')
  }
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
      {aba === 'monitoramento' ? <MonitoramentoPage />
        : aba === 'analise' ? <AnalisePage onTrocarAba={setAba} relatorioAlvo={alvo} sinalIndice={sinal} />
          : aba === 'desempenho' ? <DesempenhoPage sinalIndice={sinal} />
          : <ChatPage onTrocarAba={setAba} />}
      <AvisosRelatorios avisos={avisos} onAbrir={abrirRelatorio} onDispensar={dispensar} />
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
