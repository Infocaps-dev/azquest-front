import { Tag } from '@carbon/react'
import { formatar, nivelDe } from './niveis'

// Histórico de ciclos, item 7 da seção 11: evolução das métricas e as decisões
// registradas. No Piloto são 1T26 e 2T26.

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
              <span className="mon-historico__decisao">
                {ciclo.decisao === 'pendente' ? 'Em revisão' : `Analista: ${ciclo.decisao}`}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default HistoricoCiclos
