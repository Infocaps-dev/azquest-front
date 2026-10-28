import { useState } from 'react'
import { InlineLoading } from '@carbon/react'
import { CheckmarkFilled, ChevronDown, ChevronRight, ErrorFilled } from '@carbon/icons-react'
import '../Relatorio/ProgressoRelatorio.scss'

// O que os agentes fizeram no turno (28/10/2026): só etapas reais, gravadas pelas próprias tools enquanto rodam
// (busca de notícias, previsão do EBITDA, gráfico comparativo). Aberto durante o turno; depois, recolhido e clicável.
// Sem atividade gravada, nada aparece: o intervalo antes de a tool começar fica com o aviso genérico do agente.

function Icone({ status }) {
  if (status === 'concluida') return <CheckmarkFilled size={16} className="progresso-rel__icone progresso-rel__icone--ok" />
  if (status === 'falhou') return <ErrorFilled size={16} className="progresso-rel__icone progresso-rel__icone--erro" />
  return <InlineLoading className="progresso-rel__carregando" />
}

function duracao(a) {
  if (!a.fim || !a.inicio) return ''
  return ` em ${(a.fim - a.inicio).toFixed(1).replace('.', ',')} s`
}

function Atividade({ atividade }) {
  const { agente, titulo, estado, etapas = [], resumo } = atividade
  return (
    <li className={`progresso-rel__atividade progresso-rel__atividade--${estado}`}>
      <p className="progresso-rel__titulo">
        {agente ? `${agente}: ` : ''}{titulo}{estado !== 'em_andamento' ? duracao(atividade) : ''}
      </p>
      <ol className="progresso-rel__etapas">
        {etapas.map((e, i) => (
          <li key={i} className={`progresso-rel__etapa progresso-rel__etapa--${e.status}`}>
            <Icone status={e.status} />
            <span>{e.rotulo}</span>
            {e.detalhe && <span className="progresso-rel__detalhe">{e.detalhe}</span>}
          </li>
        ))}
      </ol>
      {resumo && estado !== 'em_andamento' && <p className="progresso-rel__detalhe">{resumo}</p>}
    </li>
  )
}

export default function AtividadesDoTurno({ atividades, respondendo }) {
  const [aberto, setAberto] = useState(false)
  if (!atividades?.length) return null
  const mostrar = respondendo || aberto
  const Seta = mostrar ? ChevronDown : ChevronRight
  return (
    <div className="progresso-rel progresso-rel--atividades" aria-live="polite">
      {!respondendo && (
        <button type="button" className="progresso-rel__alternar" onClick={() => setAberto(!aberto)}>
          <Seta size={16} /> Etapas dos agentes ({atividades.length} {atividades.length === 1 ? 'atividade' : 'atividades'})
        </button>
      )}
      {mostrar && <ol className="progresso-rel__atividades">{atividades.map(a => <Atividade key={a.id} atividade={a} />)}</ol>}
    </div>
  )
}
