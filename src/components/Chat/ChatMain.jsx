import { Button, ClickableTile, TextArea } from '@carbon/react'
import { Send } from '@carbon/icons-react'

const suggestions = [
  'Gerar relatório de crédito de uma nova empresa',
  'Acompanhar projeção da empresa',
]

function ChatMain() {
  return (
    <main className="chat-main">
      <div className="chat-main__connection">
        <span className="chat-main__dot" /> Conectado como vmiguel@ctiglobal.com
      </div>

      <div className="chat-main__body">
        <section className="chat-hero">
          <p className="chat-eyebrow">Assistente de análise</p>
          <h1 className="chat-hero__title">
            Da informação financeira à análise de investimento.
          </h1>
          <hr className="chat-hero__rule" />
          <p className="chat-hero__lead">
            Analise dados financeiros e informações de mercado de forma integrada. O agente
            consolida DREs, ITRs, documentos corporativos e fontes públicas para apoiar a
            construção de relatórios e análises de investimento.
          </p>
        </section>

        <div className="chat-suggestions">
          {suggestions.map((text, i) => (
            <ClickableTile key={text} className="chat-suggestions__tile">
              <span className="chat-suggestions__index">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{text}</span>
            </ClickableTile>
          ))}
        </div>
      </div>

      <div className="chat-composer">
        <div className="chat-composer__row">
          <TextArea
            id="chat-input"
            labelText="Mensagem"
            hideLabel
            rows={2}
            placeholder="Ex.: Quais atividades tiveram os maiores desvios no último fechamento?"
          />
          <Button kind="primary" renderIcon={Send} className="chat-composer__send">
            Enviar
          </Button>
        </div>
        <p className="chat-composer__hint">
          Enter envia · Shift + Enter quebra a linha. Valide as respostas antes de decisões de
          fechamento.
        </p>
      </div>
    </main>
  )
}

export default ChatMain
