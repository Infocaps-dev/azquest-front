import { InlineLoading, Link } from '@carbon/react'
import { CheckmarkFilled, CircleDash, ErrorFilled } from '@carbon/icons-react'
import './ProgressoRelatorio.scss'

// O relatório sendo construído (27/10/2026): só etapas reais, gravadas pela geração (status/<operacao>.json).
// Antes de a geração começar (a plataforma ainda despachando), nada de etapa: só "solicitação recebida". Depois da
// versão 1, a versão 2 (interpretação redigida pelo job) aparece como uma fase à parte, sem segurar a 1.

function detalheDa(etapa) {
  if (etapa.documentos) return `${etapa.documentos} documentos`
  return ''
}

function IconeEtapa({ status }) {
  if (status === 'concluida') return <CheckmarkFilled size={16} className="progresso-rel__icone progresso-rel__icone--ok" />
  if (status === 'em_andamento') return <InlineLoading className="progresso-rel__carregando" />
  if (status === 'falhou') return <ErrorFilled size={16} className="progresso-rel__icone progresso-rel__icone--erro" />
  return <CircleDash size={16} className="progresso-rel__icone" />
}

function Versao2({ v2 }) {
  if (!v2) return null
  if (v2.estado === 'em_preparo') {
    return <InlineLoading className="progresso-rel__v2" description="Interpretação (versão 2) sendo redigida e conferida…" />
  }
  if (v2.estado === 'pronta') {
    return (
      <p className="progresso-rel__v2">
        <CheckmarkFilled size={16} className="progresso-rel__icone progresso-rel__icone--ok" />
        Versão {v2.versao || 2} pronta, com a interpretação redigida (rascunho para a revisão do analista). O link é o mesmo.
      </p>
    )
  }
  if (v2.estado === 'sem_texto') {
    return <p className="progresso-rel__v2">A interpretação redigida não passou na conferência: fica a versão 1.</p>
  }
  return null // não se aplica (piloto) ou desconhecido: nada a mostrar
}

export default function ProgressoRelatorio({ andamento, solicitado = false, mostrarLink = true }) {
  if (!andamento) {
    if (!solicitado) return null
    return (
      <div className="progresso-rel" aria-live="polite">
        <InlineLoading description="Solicitação recebida. Aguardando a geração do relatório começar…" />
      </div>
    )
  }
  const { estado, etapas = [], versao, link_markdown: link, url, duracao_s: duracao, erro } = andamento
  const titulo = estado === 'concluida'
    ? `Relatório pronto (versão ${versao || 1})${duracao ? ` em ${String(duracao).replace('.', ',')} s` : ''}`
    : estado === 'falhou' ? 'A geração do relatório falhou' : 'Construindo o relatório'
  const endereco = url || /\((https?:[^)]+)\)/.exec(link || '')?.[1]
  return (
    <div className={`progresso-rel progresso-rel--${estado}`} aria-live="polite">
      <p className="progresso-rel__titulo">{titulo}</p>
      <ol className="progresso-rel__etapas">
        {etapas.map(e => (
          <li key={e.nome} className={`progresso-rel__etapa progresso-rel__etapa--${e.status}`}>
            <IconeEtapa status={e.status} />
            <span>{e.rotulo}</span>
            {detalheDa(e) && <span className="progresso-rel__detalhe">{detalheDa(e)}</span>}
          </li>
        ))}
      </ol>
      {estado === 'falhou' && erro && <p className="progresso-rel__erro">{erro}</p>}
      {estado === 'concluida' && mostrarLink && endereco && (
        <Link href={endereco} target="_blank" rel="noreferrer">Abrir o relatório</Link>
      )}
      {estado === 'concluida' && <Versao2 v2={andamento.versao_2} />}
    </div>
  )
}
