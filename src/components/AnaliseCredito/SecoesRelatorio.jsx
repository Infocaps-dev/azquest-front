import { Button, Tag, Tile } from '@carbon/react'
import { ArrowRight, TaskApproved } from '@carbon/icons-react'
import { ancoraDaSecao, corDaCategoria, evidenciaDe, rotuloEvidencia } from './vocabulario'
import { FonteClicavel } from './FontesDoDocumento.jsx'
import RotuloFixo from '../Comum/RotuloFixo.jsx'

// Seções do relatório: um cartão por seção com conteúdo, na ordem do relatório.
//
// Cada cartão diz o que falta revisar ali, por categoria, e traz até duas
// frases com fonte como destaque. As frases saem só de itens com evidência:
// um cartão que destaca frases sem fonte seria o contrário do que a aba existe
// para fazer. "Revisar" abre o painel de revisão já filtrado na seção, e
// "Ver no relatório" abre o relatório completo na âncora da seção.

function SecoesRelatorio({ itens = [], revisao, rotulos = {}, onRevisar, onVerNoRelatorio }) {
  const secoes = []
  for (const item of itens) {
    let s = secoes.find(x => x.secao === item.secao)
    if (!s) {
      s = { secao: item.secao, titulo: item.secao_titulo, itens: [] }
      secoes.push(s)
    }
    s.itens.push(item)
  }
  if (!secoes.length) return null

  const statusDe = id => revisao?.itens?.[id]?.status || 'pendente'

  return (
    <section className="ana-temas" aria-label="Seções do relatório">
      <h2 className="ana-secao__titulo">Seções do relatório</h2>
      <div className="ana-temas__grade">
        {secoes.map(s => {
          const pendentes = s.itens.filter(i => statusDe(i.id) === 'pendente')
          const porCategoria = {}
          pendentes.forEach(i => { porCategoria[i.categoria] = (porCategoria[i.categoria] || 0) + 1 })
          const destaques = s.itens
            .filter(i => ['fonte', 'atualizada'].includes(i.tipo_fonte) && ['texto', 'lista'].includes(i.tipo))
            .slice(0, 2)
          const semFonte = s.itens.filter(i => i.tipo_fonte === 'nao_localizado').length
          return (
            <Tile key={s.secao} className="ana-tema">
              <header className="ana-tema__cabecalho">
                <h3 className="ana-tema__titulo">{s.titulo}</h3>
                <Tag type={pendentes.length ? 'gray' : 'green'} size="sm">
                  {pendentes.length ? `${pendentes.length} pendente(s)` : 'Revisada'}
                </Tag>
              </header>

              {Object.keys(porCategoria).length > 0 && (
                <div className="ana-tema__categorias">
                  {Object.entries(porCategoria).map(([cat, n]) => (
                    <Tag key={cat} type={corDaCategoria(cat)} size="sm">{rotulos[cat] || cat}: {n}</Tag>
                  ))}
                </div>
              )}

              {destaques.length ? (
                <ul className="ana-tema__lista">
                  {destaques.map(item => (
                    <li key={item.id} className={`ana-tema__item ana-tema__item--${evidenciaDe(item.tipo_fonte).classe}`}>
                      <button type="button" className="ana-tema__frase" onClick={() => onVerNoRelatorio?.(item.ancora)}>
                        {item.texto.length > 220 ? `${item.texto.slice(0, 220)}…` : item.texto}
                      </button>
                      <FonteClicavel evidencia={item.evidencias?.[0]}>
                        {evidenciaDe(item.tipo_fonte).rotulo}: {rotuloEvidencia(item.evidencias?.[0])}
                      </FonteClicavel>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ana-vazio">Nenhum texto com fonte completa nesta seção.</p>
              )}

              <footer className="ana-tema__rodape">
                <span className="ana-tema__contagem">
                  {s.itens.length} {s.itens.length === 1 ? 'item' : 'itens'}
                  {semFonte > 0 && `, ${semFonte} sem fonte`}
                </span>
                <span className="ana-tema__acoes">
                  {/* Sempre um botão (29/10/2026): sem ele, o cartão revisado ficava com outro rodapé. Revisada, a
                      seção abre a revisão com todos os itens dela, não só os pendentes (que seriam nenhum). */}
                  <Button kind="ghost" size="sm" renderIcon={TaskApproved}
                    onClick={() => onRevisar?.(s.secao, pendentes.length === 0)}>
                    <RotuloFixo atual={pendentes.length ? 'Revisar' : 'Ver revisão'} opcoes={['Revisar', 'Ver revisão']} />
                  </Button>
                  <button type="button" className="ana-link" onClick={() => onVerNoRelatorio?.(ancoraDaSecao(s.secao))}>
                    Ver no relatório <ArrowRight size={14} />
                  </button>
                </span>
              </footer>
            </Tile>
          )
        })}
      </div>
    </section>
  )
}

export default SecoesRelatorio
