import { useState } from 'react'
import { Loading, Theme } from '@carbon/react'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AppHeader from './components/Chat/AppHeader.jsx'
import ChatPage from './components/Chat/ChatPage.jsx'
import AnalisePage from './components/AnaliseCredito/AnalisePage.jsx'
import MonitoramentoPage from './components/Monitoramento/MonitoramentoPage.jsx'
import DesempenhoPage from './components/Desempenho/DesempenhoPage.jsx'
import ColetaPage from './components/Coleta/ColetaPage.jsx'
import DocumentosPage from './components/Documentos/DocumentosPage.jsx'
import LoginPage from './components/Login/LoginPage.jsx'
import { useNovosRelatorios } from './hooks/useNovosRelatorios'

function Gate() {
  const { user, checking } = useAuth()
  // Navegação por estado, sem router: são duas telas e o Piloto não precisa de
  // URL própria por aba. Trocar por react-router quando houver link direto.
  const [aba, setAba] = useState('inicio')
  // Relatório novo (gerado pelo chat, pelo botão ou versão nova de ajuste): o sinal atualiza as listas das abas.
  // Sem aviso flutuante desde 27/10/2026: o chat e a Análise de Crédito já mostram o relatório sendo construído e
  // o abrem ao lado. `alvo.n` muda a cada clique, para reabrir o mesmo id.
  const { sinal, ignorar } = useNovosRelatorios(Boolean(user))
  const [alvo, setAlvo] = useState(null)
  function abrirRelatorio(relatorioId) {
    setAlvo(atual => ({ id: relatorioId, n: (atual?.n || 0) + 1 }))
    setAba('analise')
  }
  // "Conversar no chat" do relatório: conversa nova, já ligada a ele.
  const [pedidoChat, setPedidoChat] = useState(null)
  function conversarSobre(relatorioId) {
    setPedidoChat(atual => ({ id: relatorioId, n: (atual?.n || 0) + 1 }))
    setAba('inicio')
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
      {/* O chat fica montado nas outras abas: a conversa aberta, a lista de conversas e uma resposta em andamento
          sobrevivem à troca de aba, em vez de recarregar tudo na volta (e de abortar a geração de um relatório). */}
      <div hidden={aba !== 'inicio'}>
        <ChatPage onTrocarAba={setAba} onAbrirAnalise={abrirRelatorio} pedidoDeVinculo={pedidoChat} />
      </div>
      {aba === 'monitoramento' ? <MonitoramentoPage />
        : aba === 'analise' ? (
          <AnalisePage onTrocarAba={setAba} relatorioAlvo={alvo} sinalIndice={sinal} onConversar={conversarSobre}
            onAlvoConsumido={() => setAlvo(null)} onVersaoPropria={ignorar} />
        )
          : aba === 'desempenho' ? <DesempenhoPage sinalIndice={sinal} />
          : aba === 'coleta' ? <ColetaPage />
          : aba === 'documentos' ? <DocumentosPage />
          : null}
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
