import { Tile } from '@carbon/react'
import { WarningAlt } from '@carbon/icons-react'
import { formatar, rotuloEvidencia } from './vocabulario'

// Números-chave: os cartões do topo da aba, um número por cartão.
//
// Nenhum destes números foi escrito por um modelo: saem do resumo montado por
// código (planilha de RI, documentos do período, escritura), com a fonte. A aba
// é um resumo do relatório: o clique abre o relatório no trecho que traz o
// número, com a citação. O gerador escreve no relatório todo número de cartão
// (tools/acervo/indicadores.py) e o resumo aponta para esse trecho; nunca para
// uma seção que não contém o número, nem para o arquivo de origem (os
// documentos se abrem nas Referências).
//
// A ressalva viaja com o número, não numa nota de rodapé: o rating da Fitch
// disponível é da Ecovias Ponte, não do consolidado, e quem lê a nota precisa
// ler isso junto.

function NumerosChave({ numeros = [], onAbrir }) {
  if (!numeros.length) return null

  return (
    <section className="ana-numeros" aria-label="Números-chave">
      <div className="ana-numeros__grade">
        {numeros.map(numero => (
          <Tile
            key={numero.id}
            className={[
              'ana-kpi',
              numero.ressalva ? 'ana-kpi--ressalva' : '',
              numero.fonte ? '' : 'ana-kpi--sem-fonte',
            ].join(' ').trim()}
          >
            {/* Sem trecho apontado (resumo antigo), abre o relatório do começo. */}
            <button type="button" className="ana-kpi__gatilho" onClick={() => onAbrir?.(numero.ancora || null)}
              title="Ver no relatório">
              <span className="ana-kpi__titulo">{numero.titulo}</span>
              <span className="ana-kpi__valor">{formatar(numero.valor, numero.unidade)}</span>
              {numero.periodo && <span className="ana-kpi__periodo">{numero.periodo}</span>}
              {numero.contexto && <span className="ana-kpi__contexto">{numero.contexto}</span>}
              {numero.valor_na_origem != null && (
                // O cartão mostra R$ mi; a planilha traz R$ mil. O valor de
                // origem fica à vista, para a conferência bater com o papel.
                <span className="ana-kpi__origem">
                  no documento: {formatar(numero.valor_na_origem, numero.unidade_na_origem, 0)}
                </span>
              )}
              {numero.ressalva && (
                <span className="ana-kpi__ressalva">
                  <WarningAlt size={14} /> {numero.ressalva}
                </span>
              )}
              {numero.fonte && (
                <span className="ana-kpi__rodape">
                  <span className="ana-fonte ana-fonte--estatica" title={rotuloEvidencia(numero.fonte)}>
                    {rotuloEvidencia(numero.fonte)}
                  </span>
                </span>
              )}
            </button>
          </Tile>
        ))}
      </div>
    </section>
  )
}

export default NumerosChave
