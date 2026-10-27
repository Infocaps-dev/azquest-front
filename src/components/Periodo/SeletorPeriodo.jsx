import { ContentSwitcher, Select, SelectItem, Switch } from '@carbon/react'
import { periodoValido, trimestres } from './periodos'
import './SeletorPeriodo.scss'

// Um trimestre ou um intervalo de trimestres, para dizer de que período são os documentos: o que a Coleta baixa das
// fontes públicas e o que o analista envia na Coleta manual. Valor: {de, ate}; `ate` null é um trimestre só.

function SeletorPeriodo({ id, valor, onChange, padrao = '', disabled = false, helperText = '' }) {
  const intervalo = Boolean(valor?.ate)
  const opcoes = trimestres([padrao, valor?.de, valor?.ate])
  const item = p => <SelectItem key={p} value={p} text={p === padrao ? `${p} (padrão do emissor)` : p} />
  const invertido = intervalo && !periodoValido(valor)

  function trocarModo({ index }) {
    if (index === 1 && !intervalo) {
      // De um trimestre para intervalo: começa no ano anterior ao escolhido, até ele.
      const i = opcoes.indexOf(valor?.de)
      onChange({ de: opcoes[Math.min(opcoes.length - 1, i + 3)] || valor?.de, ate: valor?.de })
    } else if (index === 0 && intervalo) {
      onChange({ de: valor.ate, ate: null })
    }
  }

  return (
    <fieldset className="seletor-periodo">
      <legend className="cds--label">Período</legend>
      <ContentSwitcher size="sm" selectedIndex={intervalo ? 1 : 0} onChange={trocarModo}
        className="seletor-periodo__modo" disabled={disabled}>
        <Switch name="trimestre" text="Um trimestre" disabled={disabled} />
        <Switch name="intervalo" text="Intervalo" disabled={disabled} />
      </ContentSwitcher>
      {intervalo ? (
        <div className="seletor-periodo__intervalo">
          <Select id={`${id}-de`} labelText="De" size="sm" value={valor.de} disabled={disabled}
            onChange={e => onChange({ ...valor, de: e.target.value })}>
            {opcoes.map(item)}
          </Select>
          <Select id={`${id}-ate`} labelText="Até" size="sm" value={valor.ate} disabled={disabled}
            invalid={invertido} invalidText="O fim do intervalo vem antes do início."
            onChange={e => onChange({ ...valor, ate: e.target.value })}>
            {opcoes.map(item)}
          </Select>
        </div>
      ) : (
        <Select id={id} labelText="Trimestre" hideLabel size="sm" value={valor?.de || ''} disabled={disabled}
          onChange={e => onChange({ de: e.target.value, ate: null })}>
          {opcoes.map(item)}
        </Select>
      )}
      {helperText && <p className="cds--form__helper-text">{helperText}</p>}
    </fieldset>
  )
}

export default SeletorPeriodo
