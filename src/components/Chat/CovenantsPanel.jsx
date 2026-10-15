import { useState } from 'react'
import { ATIVOS, COVENANTS, EMISSOR, FONTES_ATIVOS, GATILHOS } from '../../data/ecorodovias'

const fx = v => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`

// Folga até o limite: >= 1,0x confortável; de 0,3x a 1,0x atenção; abaixo de 0,3x crítico.
function avaliar(item) {
  if (item.tipo === 'min') {
    const d = item.apurado - item.limite
    return d <= 0
      ? { status: 'Atingido', nivel: 'ok', texto: 'no gatilho' }
      : { status: 'Distante', nivel: 'neutro', texto: `a ${fx(d)} do gatilho` }
  }
  const folga = item.limite - item.apurado
  if (folga < 0) return { status: 'Rompido', nivel: 'critico', texto: `${fx(-folga)} acima` }
  if (folga < 0.3) return { status: 'Crítico', nivel: 'critico', texto: `folga de ${fx(folga)}` }
  if (folga < 1) return { status: 'Atenção', nivel: 'atencao', texto: `folga de ${fx(folga)}` }
  return { status: 'Confortável', nivel: 'ok', texto: `folga de ${fx(folga)}` }
}

function Indicador({ item }) {
  const a = avaliar(item)
  const pct = Math.min(100, (item.apurado / Math.max(item.limite, item.apurado)) * 100)
  return (
    <li className="ctx-cov__item">
      <div className="ctx-cov__row">
        <span className="ctx-cov__label">{item.titulo}</span>
        <span className={`ctx-cov__status ctx-cov__status--${a.nivel}`}>{a.status}</span>
      </div>
      <div className="ctx-cov__values">
        <strong>{fx(item.apurado)}</strong>
        <span>{item.regra}, {a.texto}</span>
      </div>
      <div className="ctx-cov__bar" aria-hidden="true">
        <span className={`ctx-cov__fill ctx-cov__fill--${a.nivel}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="ctx-cov__source" title={item.nota}>
        {item.referencia}. Fonte: {item.fonte}
      </p>
    </li>
  )
}

function CovenantsPanel() {
  const [tab, setTab] = useState('covenants')
  const tabs = [
    { id: 'covenants', label: 'Covenants e gatilhos' },
    { id: 'ativos', label: 'Ativos' },
  ]
  return (
    <section className="ctx-quotes ctx-cov" aria-label="Covenants e gatilhos da Ecorodovias">
      <div className="ctx-quotes__header">
        <h3 className="ctx-quotes__title">Ecorodovias, piloto Rodovias</h3>
      </div>
      <p className="ctx-cov__subtitle">
        {EMISSOR.nome}. Baseline: {EMISSOR.baseline}
      </p>
      <div className="ctx-quotes__tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ctx-quotes__tab${tab === t.id ? ' ctx-quotes__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'covenants' ? (
        <div className="ctx-cov__body" role="tabpanel">
          <p className="ctx-cov__group">Covenants de alavancagem (DL/EBITDA ajustado)</p>
          <ul className="ctx-cov__list">
            {COVENANTS.map(c => <Indicador key={c.id} item={c} />)}
          </ul>
          <p className="ctx-cov__group">Gatilhos de rating</p>
          <ul className="ctx-cov__list">
            {GATILHOS.map(g => <Indicador key={g.id} item={g} />)}
          </ul>
        </div>
      ) : (
        <div className="ctx-cov__body" role="tabpanel">
          <table className="ctx-quotes__table ctx-cov__assets">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Emissão</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {ATIVOS.map(a => (
                <tr key={a.ticker}>
                  <td><span className="ctx-quotes__ticker">{a.ticker}</span></td>
                  <td>
                    <span className="ctx-cov__asset-name">{a.emissao}</span>
                    <span className="ctx-cov__asset-terms">{a.condicoes}</span>
                  </td>
                  <td>{a.rating || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ctx-cov__source">
            Fontes: {FONTES_ATIVOS}. Preços e spreads do Secundário entram na Fase 1, por exportação D-1.
          </p>
        </div>
      )}
    </section>
  )
}

export default CovenantsPanel
