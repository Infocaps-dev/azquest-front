import { useLayoutEffect, useRef, useState } from 'react'
import { Tile } from '@carbon/react'
import { WarningAlt } from '@carbon/icons-react'
import { formatar, rotuloEvidencia } from './vocabulario'
import { FonteClicavel } from './FontesDoDocumento.jsx'

// Números-chave: os cartões do topo da aba, um número por cartão.
//
// Nenhum destes números foi escrito por um modelo: saem do resumo montado por
// código (planilha de RI, documentos do período, escritura), com a fonte. A aba
// é um resumo do relatório: o clique abre o relatório no trecho que traz o
// número, com a citação. O gerador escreve no relatório todo número de cartão
// (tools/acervo/indicadores.py) e o resumo aponta para esse trecho; nunca para
// uma seção que não contém o número. A fonte, embaixo do cartão, abre o
// documento original na página (ou na aba e linha da planilha) citada.
//
// A ressalva viaja com o número, não numa nota de rodapé: o rating da Fitch
// disponível é da Ecovias Ponte, não do consolidado, e quem lê a nota precisa
// ler isso junto.

// Cartões por assunto (29/10/2026): indicadores e ratings. A largura disponível decide o arranjo: se todos cabem numa
// linha, os grupos ficam lado a lado e os cartões com a mesma largura; senão, uma linha por grupo, dividida por igual
// (5 indicadores, 1/5 cada) e, sem espaço nem para isso, em linhas equilibradas (5 com espaço para 4: 3 + 2, nunca
// 4 + 1 com um cartão sozinho esticado).
const LARGURA_MINIMA = 208 // 13rem: abaixo disso o valor do cartão ("23.480 R$ mi") não cabe numa linha
const ESPACO = 16 // $spacing-05, o mesmo do CSS
const GRUPOS = [
  { id: 'indicadores', rotulo: 'Indicadores', pertence: n => !String(n.id || '').startsWith('rating_') },
  { id: 'ratings', rotulo: 'Ratings', pertence: n => String(n.id || '').startsWith('rating_') },
]

function NumerosChave({ numeros = [], onAbrir }) {
  const ref = useRef(null)
  const [largura, setLargura] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setLargura(el.getBoundingClientRect().width) // antes da primeira pintura: sem o arranjo "piscar"
    const observador = new ResizeObserver(([e]) => setLargura(e.contentRect.width))
    observador.observe(el)
    return () => observador.disconnect()
  }, [numeros.length])
  if (!numeros.length) return null
  const grupos = GRUPOS.map(g => ({ ...g, lista: numeros.filter(g.pertence) })).filter(g => g.lista.length)
  const cabem = Math.max(1, Math.floor((largura + ESPACO) / (LARGURA_MINIMA + ESPACO)))
  const juntos = numeros.length <= cabem
  // Linhas equilibradas: o número de cartões por linha que divide o grupo no menor número de linhas, por igual.
  const porLinha = n => (juntos ? n : Math.ceil(n / Math.ceil(n / cabem)))

  return (
    <section ref={ref} className={`ana-numeros${juntos ? ' ana-numeros--juntos' : ''}`} aria-label="Números-chave">
      {grupos.map(grupo => (
      <div key={grupo.id} className="ana-numeros__grupo" role="group" aria-label={grupo.rotulo}
        style={juntos ? { flexGrow: grupo.lista.length } : undefined}>
      <h3 className="ana-numeros__rotulo">{grupo.rotulo}</h3>
      <div className="ana-numeros__linha" style={{ '--por-linha': porLinha(grupo.lista.length) }}>
        {grupo.lista.map(numero => (
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
            </button>
            {/* Fora do botão do cartão: um botão não pode ficar dentro de outro. */}
            {numero.fonte && (
              <span className="ana-kpi__rodape">
                <FonteClicavel evidencia={numero.fonte} title={rotuloEvidencia(numero.fonte)}>
                  {rotuloEvidencia(numero.fonte)}
                </FonteClicavel>
              </span>
            )}
          </Tile>
        ))}
      </div>
      </div>
      ))}
    </section>
  )
}

export default NumerosChave
