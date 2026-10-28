import { Add } from '@carbon/icons-react'
import '../Comum/Carregando.scss' // .barra-indeterminada do item sendo aberto
// A lista vem da analise-api, que guarda de quem é cada conversa. O
// Orchestrate guarda a thread e as mensagens, mas todas as threads nascem sob
// a identidade da chave de API — uma só para todos os usuários do Piloto.
// Listar as threads do tenant mostraria a conversa de um analista para outro.

function quando(iso) {
  if (!iso) return ''
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  const hoje = new Date()
  const mesmoDia = data.toDateString() === hoje.toDateString()
  return mesmoDia
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function ConversationSidebar({ conversas = [], threadId, abrindo = null, onAbrir, onNova }) {
  const atual = abrindo || threadId  // a clicada fica marcada na hora, antes de a conversa chegar
  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar__top">
        <h2 className="chat-eyebrow">Análise de investimentos</h2>
        <button type="button" className="chat-sidebar__new" onClick={onNova}>
          <span>Nova conversa</span>
          <Add size={16} />
        </button>
      </div>

      {conversas.length === 0 ? (
        <p className="chat-sidebar__empty">Suas conversas salvas aparecerão aqui.</p>
      ) : (
        <ul className="chat-sidebar__lista">
          {conversas.map(c => (
            <li key={c.thread_id}>
              <button
                type="button"
                className={`chat-sidebar__item${
                  c.thread_id === atual ? ' chat-sidebar__item--atual' : ''}`}
                aria-busy={c.thread_id === abrindo || undefined}
                onClick={() => onAbrir?.(c.thread_id)}
              >
                <span className="chat-sidebar__titulo">{c.titulo || 'Conversa'}</span>
                <span className="chat-sidebar__meta">
                  {quando(c.ultima_em)}{c.turnos > 1 && ` · ${c.turnos} turnos`}
                </span>
                {c.thread_id === abrindo && <span className="barra-indeterminada" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export default ConversationSidebar
