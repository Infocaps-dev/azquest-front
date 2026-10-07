import { Button, ClickableTile, TextArea } from '@carbon/react'
import { Send } from '@carbon/icons-react'

const suggestions = [
  'Quais empresas tiveram a maior receita no último período disponível?',
  'Como a receita por plataforma variou entre os dois últimos períodos?',
  'Quais empresas concentram a maior parte da variação do mês?',
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
            Transforme o fechamento da DRE em respostas objetivas.
          </h1>
          <hr className="chat-hero__rule" />
          <p className="chat-hero__lead">
            Consulte atividades, empresas, plataformas e centros de custo dos períodos
            disponíveis. O agente combina o contexto financeiro do Aurora com as regras de
            relevância do projeto.
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
          <Button kind="danger" renderIcon={Send} className="chat-composer__send">
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
