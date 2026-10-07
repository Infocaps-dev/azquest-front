import { Information, Logout, UserAvatar } from '@carbon/icons-react'

const context = [
  { label: 'Fonte', value: 'DRE consolidada na Plataforma' },
  { label: 'Abrangência', value: 'Períodos carregados do TM1 na versão vigente' },
  { label: 'Recorte', value: 'Variações de fechamento Brasil e Regional' },
  { label: 'Atualização', value: 'Sob demanda no Athena' },
]

function ContextPanel() {
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
        <h2 className="chat-eyebrow">Contexto ativo</h2>

        <dl className="chat-context__list">
          {context.map(({ label, value }) => (
            <div key={label} className="chat-context__item">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="chat-context__info">
          <Information size={12} />
          <p>
            Os valores são calculados pelo agente e apresentados em formato brasileiro. Valide
            antes de decisões críticas.
          </p>
        </div>

        <button type="button" className="chat-context__logout">
          Encerrar sessão <Logout size={16} />
        </button>
      </div>
    </aside>
  )
}

export default ContextPanel
