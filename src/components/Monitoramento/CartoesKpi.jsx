import { Tag } from '@carbon/react'
import { formatar, nivelDe } from './niveis'

// Cartões de KPI, item 4 da seção 11: nível máximo, itens por nível, folga do
// covenant, distância ao gatilho de rating, alavancagem contra baseline e
// projeção, e tempo do ciclo contra o prazo.

function Cartao({ titulo, valor, detalhe, tom }) {
  return (
    <article className={`mon-kpi${tom ? ` mon-kpi--${tom}` : ''}`}>
      <p className="mon-kpi__titulo">{titulo}</p>
      <p className="mon-kpi__valor">{valor}</p>
      {detalhe && <p className="mon-kpi__detalhe">{detalhe}</p>}
    </article>
  )
}

function minutosDesde(iso) {
  if (!iso) return null
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return Number.isFinite(minutos) ? minutos : null
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

  const decorrido = minutosDesde(execucao?.inicio)

  return (
    <section className="mon-kpis" aria-label="Indicadores do ciclo">
      <Cartao
        titulo="Nível máximo do ciclo"
        valor={<Tag type={nivel.tag} size="md">{nivel.rotulo}</Tag>}
        detalhe={`Destino: ${comparacao.roteamento?.destino || '—'}`}
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
          detalhe={`Gatilho da Fitch em ${formatar(gatilho.baseline, 'x')}`}
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
      <Cartao
        titulo="Tempo do ciclo"
        valor={decorrido !== null ? `${decorrido} min` : '—'}
        detalhe={`Prazo: ${execucao?.prazo || 'D+1 útil'}`}
      />
    </section>
  )
}

export default CartoesKpi
