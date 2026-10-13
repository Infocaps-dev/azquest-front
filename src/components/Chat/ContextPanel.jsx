import { useEffect, useState } from 'react'
import { Button, InlineLoading } from '@carbon/react'
import { Add, ChevronLeft, ChevronRight, Close, Help, Information, Logout, Renew, TrashCan, UserAvatar } from '@carbon/icons-react'
import { useQuotes } from '../../hooks/useQuotes'

// Eventos por dia: chave = "YYYY-MM-DD"
const EVENTS = {
  '2026-10-01': [{ time: '10:00', duration: '1h', title: 'Kick-off Q4', subtitle: 'Google Meet' }],
  '2026-10-03': [{ time: '14:00', duration: '2h', title: 'Revisão de Portfólio', subtitle: 'Sala de reuniões A' }],
  '2026-10-08': [
    { time: '09:00', duration: '1h', title: 'Análise de crédito', subtitle: 'Microsoft Teams' },
    { time: '14:00', duration: '1h30', title: 'Revisão de portfólio', subtitle: 'Sala de reuniões A' },
  ],
  '2026-10-09': [{ time: '10:00', duration: '1h', title: 'Apresentação de resultados', subtitle: 'Google Meet' }],
  '2026-10-13': [{ time: '11:00', duration: '30min', title: 'Análise ECOR3', subtitle: 'Bloomberg Terminal' }],
  '2026-10-15': [
    { time: '09:30', duration: '1h', title: 'Comitê de Risco', subtitle: 'Sala 4B' },
    { time: '16:00', duration: '1h', title: 'Fechamento Mensal', subtitle: 'Power BI · DRE' },
  ],
  '2026-10-20': [{ time: '10:00', duration: '2h', title: 'Apresentação ITR Q3', subtitle: 'Auditório Principal' }],
  '2026-10-22': [{ time: '15:00', duration: '1h', title: 'Revisão VALE3', subtitle: 'Microsoft Teams' }],
  '2026-10-27': [{ time: '08:30', duration: '1h30', title: 'Planejamento Novembro', subtitle: 'Sala de reuniões B' }],
  '2026-10-29': [{ time: '13:00', duration: '1h', title: 'Relatório de Mercado', subtitle: 'Refinitiv Eikon' }],
  '2026-11-05': [{ time: '09:00', duration: '1h', title: 'Abertura de Novembro', subtitle: 'Google Meet' }],
  '2026-11-10': [{ time: '14:00', duration: '2h', title: 'Análise PETR4', subtitle: 'Bloomberg Terminal' }],
  '2026-11-18': [{ time: '10:00', duration: '1h30', title: 'Comitê de Compliance', subtitle: 'Sala 2A' }],
  '2026-11-25': [{ time: '15:30', duration: '1h', title: 'Revisão de Carteiras', subtitle: 'Microsoft Teams' }],
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function pad(n) { return String(n).padStart(2, '0') }

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

// Versão do schema — incrementar força reset do localStorage
const SCHEMA_VERSION = '2'

function loadFromStorage(key, fallback) {
  try {
    // Se o schema mudou, descarta dados antigos
    if (localStorage.getItem('azquest_schema') !== SCHEMA_VERSION) {
      localStorage.removeItem('azquest_events')
      localStorage.removeItem('azquest_rsvp')
      localStorage.setItem('azquest_schema', SCHEMA_VERSION)
      return fallback
    }
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function ContextPanel() {
  const realToday = new Date()
  const [cursor, setCursor] = useState({ year: realToday.getFullYear(), month: realToday.getMonth() })
  const [selectedDay, setSelectedDay] = useState(realToday.getDate())
  const [activeTab, setActiveTab] = useState('cotacoes')
  const { quotes, additional, loading: quotesLoading, error: quotesError, refetch } = useQuotes()
  const [events, setEvents] = useState(() => loadFromStorage('azquest_events', EVENTS))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ time: '', duration: '', title: '', subtitle: '' })
  const [rsvp, setRsvp] = useState(() => loadFromStorage('azquest_rsvp', {}))

  // Persiste eventos e rsvp no localStorage sempre que mudarem
  useEffect(() => {
    localStorage.setItem('azquest_events', JSON.stringify(events))
  }, [events])

  useEffect(() => {
    localStorage.setItem('azquest_rsvp', JSON.stringify(rsvp))
  }, [rsvp])

  function toggleRsvp(key, i, status) {
    setRsvp(prev => {
      const id = `${key}-${i}`
      return { ...prev, [id]: prev[id] === status ? undefined : status }
    })
  }

  const { year, month } = cursor
  const isCurrentMonth = year === realToday.getFullYear() && month === realToday.getMonth()

  const monthLabel = new Date(year, month, 1).toLocaleString('pt-BR', { month: 'long' })
  const calDays = getCalendarDays(year, month)

  const selectedKey = `${year}-${pad(month + 1)}-${pad(selectedDay)}`
  const selectedEvents = events[selectedKey] || []

  function handleAddEvent(e) {
    e.preventDefault()
    if (!form.title || !form.time) return
    setEvents(prev => ({
      ...prev,
      [selectedKey]: [...(prev[selectedKey] || []), { ...form, _custom: true }],
    }))
    setForm({ time: '', duration: '', title: '', subtitle: '' })
    setShowForm(false)
  }

  function handleRemoveEvent(key, index) {
    setEvents(prev => {
      const updated = (prev[key] || []).filter((_, i) => i !== index)
      const next = { ...prev }
      if (updated.length === 0) delete next[key]
      else next[key] = updated
      return next
    })
  }

  const selectedWeekday = selectedDay
    ? new Date(year, month, selectedDay).toLocaleString('pt-BR', { weekday: 'long' })
    : ''

  function prevMonth() {
    setCursor(c => {
      const d = new Date(c.year, c.month - 1, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
    setSelectedDay(1)
  }

  function nextMonth() {
    setCursor(c => {
      const d = new Date(c.year, c.month + 1, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
    setSelectedDay(1)
  }

  return (
    <aside className="chat-context">
      <div className="chat-context__user">
        <UserAvatar size={20} />
        <div>
          <strong>vmiguel</strong>
          <span>admin</span>
        </div>
      </div>

      <div className="chat-context__body">

        {/* Calendário */}
        <div className="ctx-calendar">
          <div className="ctx-calendar__header">
            <span className="ctx-calendar__month">{monthLabel} {year}</span>
            <div className="ctx-calendar__nav">
              <button onClick={() => setShowForm(f => !f)} aria-label="Novo evento" title="Novo evento">
                <Add size={16} />
              </button>
              <button onClick={prevMonth} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
              <button onClick={nextMonth} aria-label="Próximo mês"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className="ctx-calendar__grid">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="ctx-calendar__weekday">{d}</span>
            ))}
            {calDays.map((d, i) => {
              const key = d ? `${year}-${pad(month + 1)}-${pad(d)}` : null
              const hasEvent = key && !!EVENTS[key]
              const isToday = isCurrentMonth && d === realToday.getDate()
              const isSelected = d === selectedDay
              return (
                <span
                  key={i}
                  onClick={() => d && setSelectedDay(d)}
                  className={[
                    'ctx-calendar__day',
                    !d ? 'ctx-calendar__day--empty' : '',
                    isToday ? 'ctx-calendar__day--today' : '',
                    isSelected && !isToday ? 'ctx-calendar__day--selected' : '',
                    hasEvent ? 'ctx-calendar__day--event' : '',
                  ].join(' ').trim()}
                >
                  {d || ''}
                  {hasEvent && <span className="ctx-calendar__dot" />}
                </span>
              )
            })}
          </div>

          <div className="ctx-calendar__today-label">
            {isCurrentMonth && selectedDay === realToday.getDate() ? 'Hoje' : selectedWeekday}
            &nbsp;·&nbsp; {selectedDay} de {monthLabel}
          </div>
        </div>

        {/* Formulário novo evento */}
        {showForm && (
          <form className="ctx-event-form" onSubmit={handleAddEvent}>
            <p className="ctx-event-form__title">Novo evento — {selectedDay} de {monthLabel}</p>
            <input
              className="ctx-event-form__input"
              placeholder="Título *"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <div className="ctx-event-form__row">
              <input
                className="ctx-event-form__input"
                placeholder="Horário (ex: 09:00)"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              />
              <input
                className="ctx-event-form__input"
                placeholder="Duração (ex: 1h)"
                value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
              />
            </div>
            <input
              className="ctx-event-form__input"
              placeholder="Local / Link"
              value={form.subtitle}
              onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
            />
            <div className="ctx-event-form__actions">
              <button type="button" className="ctx-event-form__cancel" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="ctx-event-form__submit">Adicionar</button>
            </div>
          </form>
        )}

        {/* Eventos do dia selecionado */}
        <div className="ctx-activities">
          {selectedEvents.length === 0 ? (
            <p className="ctx-activities__empty">Nenhum evento neste dia.</p>
          ) : (
            selectedEvents.map((a, i) => {
              const id = `${selectedKey}-${i}`
              const status = rsvp[id]
              return (
                <div key={i} className={`ctx-activities__item${status ? ` ctx-activities__item--${status}` : ''}`}>
                  <div className="ctx-activities__time">
                    <span>{a.time}</span>
                    <span>{a.duration}</span>
                  </div>
                  <div className="ctx-activities__bar" />
                  <div className="ctx-activities__info">
                    <strong>{a.title}</strong>
                    <span>{a.subtitle}</span>
                  </div>
                  <div className="ctx-activities__rsvp">
                    {a._custom && (
                      <Button
                        kind="ghost"
                        size="sm"
                        iconDescription="Remover evento"
                        renderIcon={TrashCan}
                        hasIconOnly
                        onClick={() => handleRemoveEvent(selectedKey, i)}
                        className="ctx-activities__rsvp-btn ctx-activities__rsvp-btn--remove"
                      />
                    )}
                    <Button
                      kind={status === 'declined' ? 'primary' : 'ghost'}
                      size="sm"
                      iconDescription="Não vou participar"
                      renderIcon={Close}
                      hasIconOnly
                      onClick={() => toggleRsvp(selectedKey, i, 'declined')}
                      className="ctx-activities__rsvp-btn"
                    />
                    <Button
                      kind={status === 'maybe' ? 'primary' : 'ghost'}
                      size="sm"
                      iconDescription="Talvez"
                      renderIcon={Help}
                      hasIconOnly
                      onClick={() => toggleRsvp(selectedKey, i, 'maybe')}
                      className="ctx-activities__rsvp-btn"
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Grade de cotações */}
        <div className="ctx-quotes">
          <div className="ctx-quotes__header">
            <h3 className="ctx-quotes__title">Grade de Cotações</h3>
            <button className="ctx-quotes__refresh" onClick={refetch} title="Atualizar cotações">
              <Renew size={14} />
            </button>
          </div>
          <div className="ctx-quotes__tabs">
            <span
              className={`ctx-quotes__tab${activeTab === 'cotacoes' ? ' ctx-quotes__tab--active' : ''}`}
              onClick={() => setActiveTab('cotacoes')}
            >Cotações</span>
            <span
              className={`ctx-quotes__tab${activeTab === 'adicional' ? ' ctx-quotes__tab--active' : ''}`}
              onClick={() => setActiveTab('adicional')}
            >Adicional</span>
          </div>

          {quotesLoading ? (
            <div style={{ padding: '1rem' }}>
              <InlineLoading description="Carregando cotações..." />
            </div>
          ) : quotesError ? (
            <p className="ctx-quotes__error">Erro ao carregar: {quotesError}</p>
          ) : activeTab === 'cotacoes' ? (
            <table className="ctx-quotes__table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Último</th>
                  <th>Hora</th>
                  <th>Variação</th>
                  <th>Fechamento</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.ticker}>
                    <td>
                      <span className="ctx-quotes__dot" style={{ background: q.color }} />
                      <span className="ctx-quotes__ticker">{q.ticker}</span>
                    </td>
                    <td>{q.last}</td>
                    <td>{q.time}</td>
                    <td className={q.positive ? 'ctx-quotes__positive' : 'ctx-quotes__negative'}>{q.change}</td>
                    <td>{q.close}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="ctx-quotes__table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>P/L</th>
                  <th>P/VP</th>
                  <th>ROE</th>
                  <th>Div.Yield</th>
                  <th>Mkt Cap</th>
                </tr>
              </thead>
              <tbody>
                {additional.map((q) => (
                  <tr key={q.ticker}>
                    <td><span className="ctx-quotes__ticker">{q.ticker}</span></td>
                    <td>{q.pl}</td>
                    <td>{q.pvp}</td>
                    <td>{q.roe}</td>
                    <td>{q.divYield}</td>
                    <td>{q.mktCap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="chat-context__info">
          <Information size={12} />
          <p>Valores calculados pelo agente. Valide antes de decisões críticas.</p>
        </div>

        <button type="button" className="chat-context__logout">
          Encerrar sessão <Logout size={16} />
        </button>
      </div>
    </aside>
  )
}

export default ContextPanel
