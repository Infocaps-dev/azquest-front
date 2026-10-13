import { Add } from '@carbon/icons-react'

function ConversationSidebar() {
  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar__top">
        <h2 className="chat-eyebrow">Análise de investimentos</h2>
        <button type="button" className="chat-sidebar__new">
          <span>Nova conversa</span>
          <Add size={16} />
        </button>
      </div>

      <p className="chat-sidebar__empty">Suas conversas salvas aparecerão aqui.</p>
    </aside>
  )
}

export default ConversationSidebar
