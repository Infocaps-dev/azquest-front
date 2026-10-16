import { Tag } from '@carbon/react'
import { formatar, nivelDe } from './niveis'

// Histórico de ciclos, item 7 da seção 11: evolução das métricas e as decisões
// registradas. No Piloto são 1T26 e 2T26.

// Ciclo sem decisão não é ciclo pendente: pode ter terminado em B5, sem
// impacto material, e aí nunca houve alerta para alguém aprovar. Dizer
// "Analista: undefined" seria pior do que não dizer nada.
function decisaoDe(ciclo) {
  if (ciclo.decisao === 'pendente') return 'Em revisão'
  if (ciclo.decisao) return `Analista: ${ciclo.decisao}`
  if (ciclo.destino === 'B5') return 'Sem impacto material'
  return 'Sem alerta'
}

function HistoricoCiclos({ ciclos }) {
  if (!ciclos?.length) return null

  return (
    <section className="mon-historico" aria-label="Histórico de ciclos">
      <h3 className="mon-secao__titulo">Histórico de ciclos</h3>
      <ol className="mon-historico__lista">
        {ciclos.map(ciclo => {
          const nivel = nivelDe(ciclo.nivel)
          return (
            <li key={ciclo.periodo} className="mon-historico__item">
              <span className="mon-historico__periodo">{ciclo.periodo}</span>
              <span className="mon-historico__metrica">
                Alavancagem {formatar(ciclo.alavancagem, 'x')}
              </span>
              <Tag type={nivel.tag} size="sm">{nivel.rotulo}</Tag>
              <span className="mon-historico__decisao">{decisaoDe(ciclo)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default HistoricoCiclos
