import { Tag } from '@carbon/react'
import { CheckmarkFilled, CircleDash, InProgress, Warning } from '@carbon/icons-react'
import { rotuloFonte } from './niveis'

// Feed de atividade, item 3 da seção 11.
//
// Mostra o que cada agente fez e o resultado, com a fonte clicável. Não mostra
// raciocínio interno do modelo: a seção 11 é explícita quanto a isso, e para o
// analista o que importa é a ação e o dado, não o caminho do modelo.

const ICONE = {
  concluido: CheckmarkFilled,
  em_execucao: InProgress,
  aguardando_aprovacao: Warning,
  bloqueado: Warning,
  falhou: Warning,
  pendente: CircleDash,
}

function hora(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function FeedAtividade({ etapas, onAbrirFonte }) {
  // Só o que já aconteceu entra no feed; etapa pendente ainda não é atividade.
  const visiveis = etapas.filter(e => e.status !== 'pendente')

  return (
    <section className="mon-feed" aria-label="Atividade do ciclo">
      <h3 className="mon-secao__titulo">Atividade</h3>
      {visiveis.length === 0 ? (
        <p className="mon-vazio">O ciclo ainda não começou.</p>
      ) : (
        <ol className="mon-feed__lista">
          {visiveis.map(etapa => {
            const Icone = ICONE[etapa.status] || CircleDash
            return (
              <li key={etapa.etapa} className={`mon-feed__item mon-feed__item--${etapa.status}`}>
                <Icone size={16} className="mon-feed__icone" />
                <div className="mon-feed__corpo">
                  <div className="mon-feed__cabecalho">
                    <Tag type="outline" size="sm">{etapa.etapa}</Tag>
                    <span className="mon-feed__agente">{etapa.agente}</span>
                    <span className="mon-feed__hora">{hora(etapa.fim || etapa.inicio)}</span>
                  </div>
                  <p className="mon-feed__mensagem">{etapa.mensagem}</p>
                  {(etapa.fontes || []).length > 0 && (
                    <p className="mon-feed__fontes">
                      {etapa.fontes.map((fonte, i) => (
                        <button
                          key={i}
                          type="button"
                          className="mon-fonte"
                          onClick={() => onAbrirFonte?.(fonte)}
                        >
                          {rotuloFonte(fonte)}
                        </button>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default FeedAtividade
