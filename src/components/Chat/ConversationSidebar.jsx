import { Add, Db2Database } from '@carbon/icons-react'

function ConversationSidebar() {
  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar__top">
        <h2 className="chat-eyebrow">Análise de desvios</h2>
        <button type="button" className="chat-sidebar__new">
          <span>Nova conversa</span>
          <Add size={16} />
        </button>
      </div>

      <p className="chat-sidebar__empty">Suas conversas salvas aparecerão aqui.</p>

      <div className="chat-sidebar__footer">
        <Db2Database size={16} />
        <div>
          <strong>Base Ouro Aurora</strong>
          <span>IBM TM1 · Athena</span>
        </div>
      </div>
    </aside>
  )
}

export default ConversationSidebar
