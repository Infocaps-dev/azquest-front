import ChatMain from './ChatMain.jsx'
import ContextPanel from './ContextPanel.jsx'
import ConversationSidebar from './ConversationSidebar.jsx'
import { useConversa } from '../../hooks/useConversa'
import './ChatPage.scss'

// O estado da conversa vive aqui, não dentro do ChatMain: a barra lateral
// também o usa — para marcar qual conversa está aberta e para reabrir outra —
// e dois estados separados sairiam de sincronia na primeira troca.

function ChatPage({ onTrocarAba }) {
  const {
    mensagens, threadId, conversas, passo, enviando, erro, segundos,
    enviar, abrir, nova,
  } = useConversa()

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
        onEnviar={enviar}
        onTrocarAba={onTrocarAba}
      />
      <ContextPanel />
    </div>
  )
}

export default ChatPage
