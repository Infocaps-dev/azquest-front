import { useEffect, useMemo, useState } from 'react'
import { Button, Theme } from '@carbon/react'
import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AppHeader from './components/Chat/AppHeader.jsx'
import ChatPage from './components/Chat/ChatPage.jsx'
import AnalisePage from './components/AnaliseCredito/AnalisePage.jsx'
import MonitoramentoPage from './components/Monitoramento/MonitoramentoPage.jsx'
import DesempenhoPage from './components/Desempenho/DesempenhoPage.jsx'
import ColetaPage from './components/Coleta/ColetaPage.jsx'
import DocumentosPage from './components/Documentos/DocumentosPage.jsx'
import ConceitosPage from './components/Conceitos/ConceitosPage.jsx'
import LoginPage from './components/Login/LoginPage.jsx'
import { useNovosRelatorios } from './hooks/useNovosRelatorios'
import { CAMPOS_DA_FONTE, FonteDaUrl, fonteDaUrl } from './components/AnaliseCredito/FontesDoDocumento.jsx'
import Carregando from './components/Comum/Carregando.jsx'
import { CAMINHO_DA_ABA, TITULO_DA_ABA, abaDoCaminho, caminhoDaConversa, caminhoDoRelatorio, definirTitulo } from './rotas'

function NaoEncontrada() {
  const navigate = useNavigate()
  useEffect(() => { definirTitulo('Página não encontrada') }, [])
  return (
    <main className="ana-pagina ana-pagina--vazia nao-encontrada">
      <div>
        <h1 className="nao-encontrada__titulo">Página não encontrada</h1>
        <p className="nao-encontrada__texto">O endereço não corresponde a nenhuma tela do sistema.</p>
        <Button kind="primary" size="md" onClick={() => navigate(CAMINHO_DA_ABA.inicio)}>Ir para as conversas</Button>
      </div>
    </main>
  )
}

function Gate() {
  const { user, checking } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // A aba é a da URL (rotas.js). Sessão expirada: o login aparece no mesmo endereço e, depois de entrar, a pessoa
  // continua onde estava.
  const aba = abaDoCaminho(location.pathname)
  // Relatório novo (gerado pelo chat, pelo botão ou versão nova de ajuste): o sinal atualiza as listas das abas.
  const { sinal, ignorar } = useNovosRelatorios(Boolean(user))
  // A conversa aberta no chat: a aba Início volta para ela, não para uma conversa nova.
  const [conversaAtual, setConversaAtual] = useState(null)
  // O relatório aberto na Análise: a aba volta para ele (a tela da Análise desmonta nas outras abas).
  const [relatorioAtual, setRelatorioAtual] = useState(null)
  const caminhos = { inicio: caminhoDaConversa(conversaAtual), analise: caminhoDoRelatorio(relatorioAtual) }
  // "Conversar no chat" do relatório: conversa nova, já ligada a ele.
  const [pedidoChat, setPedidoChat] = useState(null)

  function trocarAba(destino) {
    navigate(caminhos[destino] || CAMINHO_DA_ABA[destino] || '/')
  }
  function abrirRelatorio(relatorioId) {
    navigate(caminhoDoRelatorio(relatorioId))
  }
  function conversarSobre(relatorioId) {
    setPedidoChat(atual => ({ id: relatorioId, n: (atual?.n || 0) + 1 }))
    navigate(caminhoDaConversa(null))
  }

  // Fonte do relatório clicada fora da tela (nova aba, PDF): "?fonte=1&arquivo=…" abre o documento citado em qualquer
  // tela; fechar tira só esses parâmetros do endereço.
  const fonteAberta = useMemo(() => fonteDaUrl(location.search), [location.search])
  function fecharFonte() {
    const consulta = new URLSearchParams(location.search)
    ;['fonte', ...CAMPOS_DA_FONTE].forEach(k => consulta.delete(k))
    const resto = consulta.toString()
    navigate({ pathname: location.pathname, search: resto ? `?${resto}` : '', hash: location.hash }, { replace: true })
  }

  // Título das abas sem detalhe próprio (o chat e a Análise põem o da conversa e o do relatório).
  useEffect(() => {
    if (user && aba && aba !== 'inicio' && aba !== 'analise') definirTitulo(TITULO_DA_ABA[aba])
  }, [user, aba])

  if (location.pathname === '/') {
    return <Navigate replace to={{ pathname: CAMINHO_DA_ABA.inicio, search: location.search, hash: location.hash }} />
  }
  if (checking) return <Carregando telaCheia descricao="Verificando a sessão" />
  if (!user) return <LoginPage />

  return (
    <>
      <AppHeader aba={aba} onTrocarAba={trocarAba} caminhos={caminhos} />
      {fonteAberta && <FonteDaUrl fonte={fonteAberta} onFechar={fecharFonte} />}
      {/* O chat fica montado nas outras abas: a conversa aberta, a lista de conversas e uma resposta em andamento
          sobrevivem à troca de aba, em vez de recarregar tudo na volta (e de abortar a geração de um relatório). */}
      <div hidden={aba !== 'inicio'}>
        <ChatPage ativa={aba === 'inicio'} onTrocarAba={trocarAba} onAbrirAnalise={abrirRelatorio}
          pedidoDeVinculo={pedidoChat} onConversaAtual={setConversaAtual} />
      </div>
      {aba === 'monitoramento' ? <MonitoramentoPage />
        : aba === 'analise' ? (
          <AnalisePage onTrocarAba={trocarAba} sinalIndice={sinal} onConversar={conversarSobre}
            onVersaoPropria={ignorar} onRelatorioAtual={setRelatorioAtual} />
        )
          : aba === 'desempenho' ? <DesempenhoPage sinalIndice={sinal} />
          : aba === 'coleta' ? <ColetaPage />
          : aba === 'documentos' ? <DocumentosPage />
          : aba === 'conceitos' ? <ConceitosPage />
          : aba === 'inicio' ? null
          : <NaoEncontrada />}
    </>
  )
}

function App() {
  return (
    <Theme theme="white">
      <BrowserRouter>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </BrowserRouter>
    </Theme>
  )
}

export default App
