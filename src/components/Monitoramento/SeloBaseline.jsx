import { Tag } from '@carbon/react'
import { Document } from '@carbon/icons-react'

// Qual tese o ciclo está monitorando, item 7 do plano da etapa 1.2.
//
// A aba comparava contra "o baseline" sem dizer qual: versão, data-base e
// quem assinou ficavam só no banco. Num processo cujo ponto é a rastreabilidade,
// monitorar contra uma tese anônima é meio caminho andado para comparar com a
// errada depois de uma republicação.
//
// Quando o baseline veio da aba Análise de Crédito, a observação registra a
// análise de origem e o aprovador, e o selo leva de volta até lá.

function analiseDeOrigem(observacao = '') {
  const achado = /an[áa]lise\s+(ana-[\w-]+)/i.exec(observacao)
  const aprovador = /aprovador\s+([^\s.,;]+@[^\s.,;]+)/i.exec(observacao)
  return achado || aprovador
    ? { analiseId: achado?.[1] || null, aprovador: aprovador?.[1] || null }
    : null
}

function SeloBaseline({ baseline, onTrocarAba }) {
  if (!baseline) return null

  const origem = analiseDeOrigem(baseline.observacao)

  return (
    <div className="mon-baseline">
      <Tag type="outline" size="sm">Baseline {baseline.versao}</Tag>
      <span className="mon-baseline__data">data-base {baseline.data_base}</span>
      {origem?.aprovador && (
        <span className="mon-baseline__aprovador">aprovado por {origem.aprovador}</span>
      )}
      {origem ? (
        <button type="button" className="mon-fonte" onClick={() => onTrocarAba?.('analise')}>
          <Document size={14} /> Ver a tese na Análise de Crédito
        </button>
      ) : (
        // Baseline que não veio da 1.2 não ganha link: o selo diria "ver a
        // tese" e levaria a uma análise que não o originou.
        <span className="mon-baseline__origem">origem: {baseline.origem || 'não registrada'}</span>
      )}
    </div>
  )
}

export default SeloBaseline
