import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import ChatMain from './ChatMain.jsx'
import ContextPanel from './ContextPanel.jsx'
import ConversationSidebar from './ConversationSidebar.jsx'
import RelatorioDaConversa from './RelatorioDaConversa.jsx'
import VincularRelatorio from './VincularRelatorio.jsx'
import { useConversa } from '../../hooks/useConversa'
import { caminhoDaConversa, conversaDoCaminho, definirTitulo } from '../../rotas'
import './ChatPage.scss'

// O estado da conversa vive aqui, não dentro do ChatMain: a barra lateral
// também o usa — para marcar qual conversa está aberta e para reabrir outra —
// e dois estados separados sairiam de sincronia na primeira troca.
//
// `pedidoDeVinculo` ({id, n}) vem do "Conversar no chat" do relatório: abre uma conversa nova já ligada a ele. `n`
// muda a cada clique, para o mesmo relatório poder abrir outra conversa.

// Endereço (28/10/2026): /conversas/<id> é a conversa aberta; /conversas, uma nova. A URL manda: escolher uma conversa
// na lista navega para o endereço dela e é a mudança de endereço (clique, voltar/avançar, link colado) que abre a
// conversa. O id só nasce no primeiro envio: aí o endereço passa de /conversas para /conversas/<id> sem criar um passo
// a mais no histórico. Nas outras abas o chat continua montado (escondido) e não mexe no endereço.
function ChatPage({ ativa = true, onTrocarAba, onAbrirAnalise, pedidoDeVinculo, onConversaAtual }) {
  const {
    mensagens, threadId, conversas, passo, enviando, erro, segundos, vinculo, abrindo,
    enviar, abrir, nova, vincular, atualizarVinculo,
  } = useConversa()
  const [escolhendo, setEscolhendo] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const tipoDeNavegacao = useNavigationType()
  const conversaDaUrl = ativa ? conversaDoCaminho(location.pathname) : null

  useEffect(() => {
    if (pedidoDeVinculo?.id) nova(pedidoDeVinculo.id)
  }, [pedidoDeVinculo]) // eslint-disable-line react-hooks/exhaustive-deps -- só a cada pedido

  // Endereço -> conversa, a cada navegação (location.key; o React Router aplica a navegação como transição, e reagir
  // só ao id deixava passar um "voltar" rápido): abre a conversa do endereço (a aberta ou abrindo não reabre); em
  // /conversas, a conversa nova, quando a navegação pediu (botão "Nova conversa") ou foi o voltar/avançar.
  useEffect(() => {
    if (!ativa) return
    if (conversaDaUrl) {
      if (conversaDaUrl !== threadId && conversaDaUrl !== abrindo) abrir(conversaDaUrl)
    } else if (threadId && (tipoDeNavegacao === 'POP' || location.state?.novaConversa)) {
      nova()
    }
  }, [location.key, ativa]) // eslint-disable-line react-hooks/exhaustive-deps -- reage à navegação

  // Conversa -> endereço: o id que nasceu no primeiro envio entra no endereço (replace: é a mesma conversa).
  const anterior = useRef(threadId)
  useEffect(() => {
    if (threadId === anterior.current) return
    anterior.current = threadId
    onConversaAtual?.(threadId)
    if (ativa && threadId && threadId !== conversaDaUrl) {
      navigate(caminhoDaConversa(threadId), { replace: !conversaDaUrl })
    }
  }, [threadId]) // eslint-disable-line react-hooks/exhaustive-deps -- só quando a conversa muda

  const titulo = conversas.find(c => c.thread_id === threadId)?.titulo
  useEffect(() => {
    if (ativa) definirTitulo(threadId ? `Conversa: ${titulo || 'sem título'}` : 'Nova conversa')
  }, [ativa, threadId, titulo])

  function abrirConversa(id) {
    if (id !== threadId) navigate(caminhoDaConversa(id))
  }
  // A conversa nova acontece junto com a troca de endereço (no efeito acima), nunca antes dela.
  function novaConversa() {
    if (conversaDaUrl || threadId) navigate(caminhoDaConversa(null), { state: { novaConversa: true } })
  }

  return (
    <div className="chat-layout">
      <ConversationSidebar
        conversas={conversas}
        threadId={threadId}
        onAbrir={abrirConversa}
        abrindo={abrindo}
        onNova={novaConversa}
      />
      <ChatMain
        mensagens={mensagens}
        passo={passo}
        enviando={enviando}
        erro={erro}
        segundos={segundos}
        vinculo={vinculo}
        threadId={threadId}
        abrindo={abrindo}
        onEscolherRelatorio={() => setEscolhendo(true)}
        onEnviar={enviar}
        onTrocarAba={onTrocarAba}
      />
      <ContextPanel empresa={vinculo?.empresa || ''} topo={vinculo && (
        <RelatorioDaConversa vinculo={vinculo} enviando={enviando} onAtualizar={atualizarVinculo}
          onTrocar={() => setEscolhendo(true)} onDesvincular={() => vincular(null)} onAbrirAnalise={onAbrirAnalise} />
      )} />
      <VincularRelatorio aberto={escolhendo} atual={vinculo?.relatorio_id} onFechar={() => setEscolhendo(false)}
        onEscolher={id => vincular(id)} />
    </div>
  )
}

export default ChatPage
