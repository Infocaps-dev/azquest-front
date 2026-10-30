import { Tag } from '@carbon/react'
import { rotuloEvidencia } from './vocabulario'

// Sumário da tese: o quadro do topo do relatório, com o que veio de onde.
//
// Campo vazio não vira traço nem some: vira "A preencher" (campo que só o
// analista informa) ou "Não localizado", em vermelho. Um traço diria "não se
// aplica", que é outra coisa. Valor informado pela casa aparece marcado como
// dado interno, não conferido com os documentos.
//
// Cada linha leva ao lugar dela: o texto abre o relatório completo na âncora,
// e a fonte abre o item no painel de revisão.

const CAMPOS = [
  ['valor_emissao', 'Valor da Emissão'],
  ['rating', 'Avaliação de rating'],
  ['rentabilidade', 'Rentabilidade (taxa de emissão)'],
]

function Ponto({ ponto, onAbrirRelatorio, onAbrirItem }) {
  return (
    <li>
      <button type="button" className="ana-sumario__texto" onClick={() => onAbrirRelatorio?.(ponto.ancora)}>
        {ponto.texto}
      </button>
      {ponto.fontes?.length ? (
        <button type="button" className="ana-fonte" title={ponto.fontes.map(rotuloEvidencia).join(' | ')}
          onClick={() => onAbrirItem?.(ponto.item_id)}>
          {rotuloEvidencia(ponto.fontes[0])}
          {ponto.fontes.length > 1 && ` +${ponto.fontes.length - 1}`}
        </button>
      ) : (
        <button type="button" className="ana-fonte ana-fonte--ausente" onClick={() => onAbrirItem?.(ponto.item_id)}>
          Não localizado
        </button>
      )}
    </li>
  )
}

function SumarioTese({ resumo, onAbrirRelatorio, onAbrirItem }) {
  if (!resumo) return null
  const sumario = resumo.sumario || {}
  const atencao = resumo.pontos_atencao || []
  const fortes = resumo.pontos_fortes || []

  return (
    <section className="ana-sumario" aria-label="Sumário da tese">
      <h2 className="ana-secao__titulo">Sumário da tese</h2>

      <dl className="ana-sumario__campos">
        {CAMPOS.map(([chave, rotulo]) => {
          const campo = sumario[chave] || {}
          return (
            <div key={chave} className="ana-sumario__campo">
              <dt>{rotulo}</dt>
              <dd>
                {campo.texto ? (
                  <>
                    <button type="button" className="ana-link" onClick={() => onAbrirRelatorio?.(campo.ancora)}>
                      {campo.texto}
                    </button>
                    {campo.proposta && <Tag type="teal" size="sm">Preenchido pelo sistema</Tag>}
                    {campo.origem === 'casa' && <Tag type="blue" size="sm">Informado pela casa</Tag>}
                    {campo.origem === 'sem fonte' && <Tag type="red" size="sm">Sem fonte</Tag>}
                  </>
                ) : (
                  <Tag type={campo.origem === 'pendente' ? 'magenta' : 'red'} size="sm">
                    {campo.origem === 'pendente' ? 'A preencher pelo analista' : 'Não localizado'}
                  </Tag>
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      {(resumo.observacoes || resumo.observacoes_quadros?.length > 0) && (
        <div className="ana-sumario__observacao">
          <span className="ana-rotulo ana-rotulo--analista">Observações</span>
          {/* Imagem ou tabela do campo: uma linha que abre o relatório nela, não a marcação de onde ela vai. */}
          {(resumo.observacoes_quadros || []).map((q, i) => (
            <button key={i} type="button" className="ana-link ana-sumario__quadro"
              onClick={() => onAbrirRelatorio?.(resumo.observacoes_ancora)}>
              No relatório: {q.titulo || 'quadro'}
              {q.herdado && q.proposta ? ' (relatório anterior e versão do período)' : q.herdado ? ' (relatório anterior)' : ''}
            </button>
          ))}
          {resumo.observacoes && (
            <button type="button" className="ana-sumario__texto"
              onClick={() => onAbrirRelatorio?.(resumo.observacoes_ancora)}>
              {resumo.observacoes}
            </button>
          )}
        </div>
      )}

      <div className="ana-sumario__colunas">
        <div>
          <h3 className="ana-sumario__coluna-titulo ana-sumario__coluna-titulo--atencao">Pontos de atenção</h3>
          {atencao.length ? (
            <ul className="ana-sumario__lista">
              {atencao.map((p, i) => (
                <Ponto key={i} ponto={p} onAbrirRelatorio={onAbrirRelatorio} onAbrirItem={onAbrirItem} />
              ))}
            </ul>
          ) : <p className="ana-vazio">Nenhum ponto de atenção no relatório.</p>}
        </div>
        <div>
          <h3 className="ana-sumario__coluna-titulo ana-sumario__coluna-titulo--fortes">Pontos fortes</h3>
          {fortes.length ? (
            <ul className="ana-sumario__lista">
              {fortes.map((p, i) => (
                <Ponto key={i} ponto={p} onAbrirRelatorio={onAbrirRelatorio} onAbrirItem={onAbrirItem} />
              ))}
            </ul>
          ) : <p className="ana-vazio">Nenhum ponto forte no relatório.</p>}
        </div>
      </div>
    </section>
  )
}

export default SumarioTese
