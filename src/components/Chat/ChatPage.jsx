import { useEffect, useState } from 'react'
import ChatMain from './ChatMain.jsx'
import ContextPanel from './ContextPanel.jsx'
import ConversationSidebar from './ConversationSidebar.jsx'
import RelatorioDaConversa from './RelatorioDaConversa.jsx'
import VincularRelatorio from './VincularRelatorio.jsx'
import { useConversa } from '../../hooks/useConversa'
import './ChatPage.scss'

// O estado da conversa vive aqui, não dentro do ChatMain: a barra lateral
// também o usa — para marcar qual conversa está aberta e para reabrir outra —
// e dois estados separados sairiam de sincronia na primeira troca.
//
// `pedidoDeVinculo` ({id, n}) vem do "Conversar no chat" do relatório: abre uma conversa nova já ligada a ele. `n`
// muda a cada clique, para o mesmo relatório poder abrir outra conversa.

function ChatPage({ onTrocarAba, onAbrirAnalise, pedidoDeVinculo }) {
  const {
    mensagens, threadId, conversas, passo, enviando, erro, segundos, vinculo,
    enviar, abrir, nova, vincular, atualizarVinculo,
  } = useConversa()
  const [escolhendo, setEscolhendo] = useState(false)

  useEffect(() => {
    if (pedidoDeVinculo?.id) nova(pedidoDeVinculo.id)
  }, [pedidoDeVinculo]) // eslint-disable-line react-hooks/exhaustive-deps -- só a cada pedido

  return (
    <div className="chat-layout">
      <ConversationSidebar
        conversas={conversas}
        threadId={threadId}
        onAbrir={abrir}
        onNova={nova}
      />
      <ChatMain
        mensagens={mensagens}
        passo={passo}
        enviando={enviando}
        erro={erro}
        segundos={segundos}
        vinculo={vinculo}
        onEscolherRelatorio={() => setEscolhendo(true)}
        onEnviar={enviar}
        onTrocarAba={onTrocarAba}
      />
      <ContextPanel topo={vinculo && (
        <RelatorioDaConversa vinculo={vinculo} enviando={enviando} onAtualizar={atualizarVinculo}
          onTrocar={() => setEscolhendo(true)} onDesvincular={() => vincular(null)} onAbrirAnalise={onAbrirAnalise} />
      )} />
      <VincularRelatorio aberto={escolhendo} atual={vinculo?.relatorio_id} onFechar={() => setEscolhendo(false)}
        onEscolher={id => vincular(id)} />
    </div>
  )
}

export default ChatPage
