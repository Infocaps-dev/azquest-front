import { Tag } from '@carbon/react'
import { rotuloEvidencia } from './vocabulario'

// Sumário da tese, item 3.3. O bloco de maior destaque da aba.
//
// Os campos da emissão (valor, rating, taxa) estão vazios no relatório de
// mar/2026. Vazio não vira traço nem some: vira "Não localizado" em vermelho,
// com a fonte prevista escrita ao lado -- que é o que o analista precisa saber
// para ir buscar. Um traço diria "não se aplica", que é outra coisa.
//
// A observação do analista é texto sem fonte, e aparece em verde rotulada como
// comentário do analista, não como achado do agente.

function SumarioTese({ sumario, onAbrirItem }) {
  if (!sumario) return null

  const { campos_da_emissao: campos = [], observacao_do_analista: observacao } = sumario
  const atencao = sumario.pontos_de_atencao || []
  const fortes = sumario.pontos_fortes || []

  return (
    <section className="ana-sumario" aria-label="Sumário da tese">
      <h2 className="ana-secao__titulo">Sumário da tese</h2>

      <dl className="ana-sumario__campos">
        {campos.map(campo => (
          <div key={campo.id} className="ana-sumario__campo">
            <dt>{campo.rotulo}</dt>
            <dd>
              {campo.valor ? (
                <button type="button" className="ana-link" onClick={() => onAbrirItem?.(campo.id)}>
                  {campo.valor}
                </button>
              ) : (
                <>
                  <Tag type="red" size="sm">Não localizado</Tag>
                  {campo.fonte_prevista && (
                    <span className="ana-sumario__previsto">{campo.fonte_prevista}</span>
                  )}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {observacao && (
        <div className="ana-sumario__observacao">
          <span className="ana-rotulo ana-rotulo--analista">Comentário do analista</span>
          <p>{observacao}</p>
        </div>
      )}

      <div className="ana-sumario__colunas">
        <div>
          <h3 className="ana-sumario__coluna-titulo ana-sumario__coluna-titulo--atencao">
            Pontos de atenção
          </h3>
          {atencao.length ? (
            <ul className="ana-sumario__lista">
              {atencao.map((ponto, i) => (
                <li key={i}>
                  {ponto.texto}
                  {ponto.evidencias?.length ? (
                    <button type="button" className="ana-fonte"
                      onClick={() => onAbrirItem?.(ponto.item_id)}>
                      {rotuloEvidencia(ponto.evidencias[0])}
                    </button>
                  ) : (
                    <Tag type="red" size="sm">Não localizado</Tag>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            // O roteiro do Piloto não traz os pontos separados em atenção e
            // fortes: eles estão no corpo do relatório, item a item. Dizer
            // isso é melhor do que mostrar uma coluna vazia, que parece falha
            // de carregamento.
            <p className="ana-vazio">
              O roteiro do Piloto não separa os pontos; eles estão nos destaques por tema.
            </p>
          )}
        </div>

        <div>
          <h3 className="ana-sumario__coluna-titulo ana-sumario__coluna-titulo--fortes">
            Pontos fortes
          </h3>
          {fortes.length ? (
            <ul className="ana-sumario__lista">
              {fortes.map((ponto, i) => (
                <li key={i}>
                  {ponto.texto}
                  {ponto.evidencias?.length ? (
                    <button type="button" className="ana-fonte"
                      onClick={() => onAbrirItem?.(ponto.item_id)}>
                      {rotuloEvidencia(ponto.evidencias[0])}
                    </button>
                  ) : (
                    <Tag type="red" size="sm">Não localizado</Tag>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ana-vazio">
              O roteiro do Piloto não separa os pontos; eles estão nos destaques por tema.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default SumarioTese
