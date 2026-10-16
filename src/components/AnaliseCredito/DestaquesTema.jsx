import { Tag, Tile } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import { evidenciaDe, revisaoDe, rotuloEvidencia } from './vocabulario'

// Destaques por tema, item 3.5: um cartão por seção do recorte do Piloto.
//
// Cada cartão traz duas ou três frases de highlight, o selo da revisão e o
// link para o relatório completo. As frases saem dos itens que têm evidência:
// um cartão que anuncia três frases sem fonte seria o contrário do que a aba
// existe para fazer. Os itens sem evidência entram na contagem do cartão, não
// no texto dele, e a contagem aparece escrita.

function DestaquesTema({ destaques = [], onAbrirTema, onVerNoRelatorio }) {
  if (!destaques.length) return null

  return (
    <section className="ana-temas" aria-label="Destaques por tema">
      <h2 className="ana-secao__titulo">Destaques por tema</h2>
      <div className="ana-temas__grade">
        {destaques.map(cartao => {
          const revisao = revisaoDe(cartao.revisao?.status)
          return (
            <Tile key={cartao.id} className="ana-tema">
              <header className="ana-tema__cabecalho">
                <h3 className="ana-tema__titulo">{cartao.titulo}</h3>
                <Tag type={revisao.tag} size="sm">{revisao.rotulo}</Tag>
              </header>

              {cartao.destaques?.length ? (
                <ul className="ana-tema__lista">
                  {cartao.destaques.map(destaque => {
                    const evidencia = evidenciaDe(destaque.tipo_fonte)
                    return (
                      <li key={destaque.item_id} className={`ana-tema__item ana-tema__item--${evidencia.classe}`}>
                        <button type="button" className="ana-tema__frase"
                          onClick={() => onAbrirTema?.(destaque.item_id)}>
                          {destaque.texto}
                        </button>
                        <span className="ana-fonte ana-fonte--estatica">
                          {evidencia.rotulo}: {rotuloEvidencia(destaque.evidencias?.[0])}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="ana-vazio">Nenhum item com evidência neste tema.</p>
              )}

              <footer className="ana-tema__rodape">
                <span className="ana-tema__contagem">
                  {cartao.total_itens} {cartao.total_itens === 1 ? 'item' : 'itens'}
                  {cartao.sem_evidencia > 0 && `, ${cartao.sem_evidencia} sem fonte`}
                  {cartao.imagens?.length > 0 && `, ${cartao.imagens.length} com imagem`}
                </span>
                <button type="button" className="ana-link" onClick={() => onVerNoRelatorio?.(cartao)}>
                  Ver no relatório <ArrowRight size={14} />
                </button>
              </footer>
            </Tile>
          )
        })}
      </div>
    </section>
  )
}

export default DestaquesTema
