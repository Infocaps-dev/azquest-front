import { Tag } from '@carbon/react'
import { formatar, nivelDe, nomeDaEtapa } from './niveis'

// Cartões de KPI, item 4 da seção 11: nível máximo, itens por nível, folga do
// covenant, distância ao gatilho de rating e alavancagem contra baseline e
// projeção. O início do ciclo vai no pé do primeiro cartão; o cartão de tempo
// decorrido saiu, porque contava desde a criação do ciclo e virava milhares
// de minutos sem dizer nada útil.

function Cartao({ titulo, valor, detalhe, rodape, tom }) {
  // O valor e um `div`, nao um `p`: em alguns cartoes ele e uma Tag do Carbon,
  // que renderiza `div`, e `div` dentro de `p` e HTML invalido. O navegador
  // fecha o `p` sozinho e o layout sai diferente do escrito.
  return (
    <article className={`mon-kpi${tom ? ` mon-kpi--${tom}` : ''}`}>
      <p className="mon-kpi__titulo">{titulo}</p>
      <div className="mon-kpi__valor">{valor}</div>
      {detalhe && <p className="mon-kpi__detalhe">{detalhe}</p>}
      {rodape && <p className="mon-kpi__rodape">{rodape}</p>}
    </article>
  )
}

function CartoesKpi({ comparacao, execucao }) {
  if (!comparacao) return null

  const linhas = comparacao.linhas || []
  const porNivel = comparacao.contagem_por_nivel || {}
  const nivel = nivelDe(comparacao.nivel_maximo)

  const gatilho = linhas.find(l => l.regra === 'distancia_gatilho_rating')
  const proxy = linhas.find(l => l.metrica?.endsWith('_proxy'))
  const alavancagem = linhas.find(l => l.metrica === 'dl_ebitda_consolidado')
  const projecao = linhas.find(l => l.metrica === 'dl_ebitda_consolidado_projecao')

  return (
    <section className="mon-kpis" aria-label="Indicadores do ciclo">
      <Cartao
        titulo="Nível máximo do ciclo"
        valor={<Tag type={nivel.tag} size="md">{nivel.rotulo}</Tag>}
        detalhe={`Destino: ${nomeDaEtapa(comparacao.roteamento?.destino) || '—'}`}
        rodape={execucao?.inicio
          ? `Início ${new Date(execucao.inicio).toLocaleString('pt-BR')}`
          : null}
        tom={comparacao.nivel_maximo}
      />
      <Cartao
        titulo="Itens por nível"
        valor={`${porNivel.relevante || 0} relevante, ${porNivel.atencao || 0} atenção`}
        detalhe={`${porNivel.informativo || 0} informativos`}
      />
      {gatilho && (
        <Cartao
          titulo="Distância ao gatilho de rating"
          valor={formatar(gatilho.detalhes?.distancia, 'x')}
          // A agencia vem do baseline de cada emissor: Fitch na Ecorodovias,
          // S&P na Motiva. Antes o nome estava fixo e a Motiva aparecia com o
          // gatilho "da Fitch".
          detalhe={`Gatilho ${gatilho.detalhes?.agencia ? `da ${gatilho.detalhes.agencia}` : 'da agência'} em ${formatar(gatilho.baseline, 'x')}`}
          tom={gatilho.nivel}
        />
      )}
      {proxy && (
        <Cartao
          titulo="Folga do covenant"
          valor={formatar(proxy.detalhes?.folga, 'x')}
          detalhe="Indicador antecedente trimestral"
          tom={proxy.nivel}
        />
      )}
      {alavancagem && (
        <Cartao
          titulo="Alavancagem"
          valor={formatar(alavancagem.realizado, 'x')}
          detalhe={
            `Baseline ${formatar(alavancagem.baseline, 'x')}` +
            (projecao ? `, projeção ${formatar(projecao.projecao, 'x')}` : '')
          }
          tom={alavancagem.nivel}
        />
      )}
    </section>
  )
}

export default CartoesKpi
