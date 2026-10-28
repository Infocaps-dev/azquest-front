import { useEffect, useRef, useState } from 'react'
import { Button, ClickableTile, InlineLoading, TextArea } from '@carbon/react'
import { Link as IconeVinculo, Send, WarningAlt } from '@carbon/icons-react'
import RespostaDoAgente from './RespostaDoAgente.jsx'
import AtividadesDoTurno from './AtividadesDoTurno.jsx'
import FeedbackDaResposta from './FeedbackDaResposta.jsx'
import ProgressoRelatorio from '../Relatorio/ProgressoRelatorio.jsx'
import useAndamentoRelatorio from '../../hooks/useAndamentoRelatorio'
import { MODO_SIMULADO } from '../../services/chatApi'
import { RelatorioDaConversa } from './contextoChat'

// Relatório gerado no turno: as etapas vêm pelo stream enquanto o agente responde; depois, a tela acompanha a
// versão 2 (interpretação redigida) pela operação do turno. O link fica na resposta do agente.
function RelatorioDoTurno({ mensagem, respondendo }) {
  const acompanhar = !respondendo && mensagem.andamento?.estado === 'concluida' ? mensagem.pedidoId : null
  const andamento = useAndamentoRelatorio(acompanhar, mensagem.andamento)
  return <ProgressoRelatorio andamento={andamento} mostrarLink={false} />
}

const suggestions = [
  'Gerar relatório de crédito de uma nova empresa',
  'Acompanhar projeção da empresa',
]

// O tempo decorrido ao lado do andamento. O Orchestrate fica ~39s sem mandar
// nada (medido), então sem o relógio a tela parece travada justamente no
// pedido mais importante, que é o de gerar relatório.
function decorrido(segundos) {
  if (segundos < 60) return `${segundos}s`
  return `${Math.floor(segundos / 60)}min ${String(segundos % 60).padStart(2, '0')}s`
}

function ChatMain({
  mensagens = [],
  passo = '',
  enviando = false,
  erro = '',
  segundos = 0,
  vinculo = null,
  threadId = null,
  onEscolherRelatorio,
  onEnviar,
  onTrocarAba,
}) {
  const [texto, setTexto] = useState('')
  const fim = useRef(null)
  const conversando = mensagens.length > 0

  // Rola para o fim quando a conversa cresce. `block: 'end'` em vez de
  // `scrollIntoView()` puro: o padrão rola a página inteira e tira o cabeçalho
  // da tela.
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens, passo])

  function enviar() {
    const limpo = texto.trim()
    if (!limpo || enviando) return
    setTexto('')
    onEnviar?.(limpo)
  }

  // O rodapé promete "Enter envia, Shift + Enter quebra a linha" desde a
  // primeira versão da tela. Agora é verdade.
  function aoTeclar(evento) {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault()
      enviar()
    }
  }

  return (
    <main className="chat-main">
      <div className="chat-main__body">
        {!conversando && (
          <>
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
                <ClickableTile
                  key={text}
                  className="chat-suggestions__tile"
                  onClick={() => onEnviar?.(text)}
                >
                  <span className="chat-suggestions__index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{text}</span>
                </ClickableTile>
              ))}
            </div>
          </>
        )}

        {conversando && (
          <RelatorioDaConversa.Provider value={vinculo?.relatorio_id || null}>
          <div className="chat-conversa">
            {mensagens.map((m, i) => (
              <article
                key={m.id}
                className={`chat-msg chat-msg--${m.papel}`}
              >
                <p className="chat-msg__quem">
                  {m.papel === 'usuario' ? 'Você' : 'Analista de Crédito AZ Quest'}
                </p>
                <div className="chat-msg__corpo">
                  {m.papel !== 'usuario' && m.andamento && (
                    <RelatorioDoTurno mensagem={m} respondendo={enviando && i === mensagens.length - 1} />
                  )}
                  {m.papel !== 'usuario' && m.atividades?.length > 0 && (
                    <AtividadesDoTurno atividades={m.atividades} respondendo={enviando && i === mensagens.length - 1} />
                  )}
                  {m.papel === 'usuario'
                    ? <p>{m.texto}</p>
                    : <RespostaDoAgente texto={m.texto} fontes={m.fontes} retida={m.retida} ratings={m.ratings}
                                        escolha={m.escolha} graficos={m.graficos}
                                        onEscolher={!enviando && i === mensagens.length - 1 ? onEnviar : null}
                                        onTrocarAba={onTrocarAba} onEnviar={onEnviar} />}
                  {m.papel !== 'usuario' && !(enviando && i === mensagens.length - 1) && (m.texto || m.retida) && (
                    <FeedbackDaResposta pedidoId={m.pedidoId || m.pedido_id} threadId={threadId} inicial={m.feedback} />
                  )}
                </div>
              </article>
            ))}

            {/* O andamento fica fora da lista: é substituível e não faz
                parte da conversa. O relógio vem da tela, não do agente —
                durante os primeiros ~39s o Orchestrate não manda nada. */}
            {(passo || enviando) && (
              <div className="chat-msg chat-msg--andamento">
                <InlineLoading
                  description={`${passo || 'Aguardando o agente'} · ${decorrido(segundos)}`}
                />
                {segundos >= 20 && (
                  <p className="chat-msg__demora">
                    Pedidos de relatório levam cerca de 40 segundos.
                  </p>
                )}
              </div>
            )}

            {erro && (
              <div className="chat-msg chat-msg--erro" role="alert">
                <WarningAlt size={16} />
                <span>{erro}</span>
              </div>
            )}

            <div ref={fim} />
          </div>
          </RelatorioDaConversa.Provider>
        )}
      </div>

      <div className="chat-composer">
        {/* Relatório desta conversa: os pedidos de alteração viram versões novas dele. */}
        <div className="chat-composer__vinculo">
          {vinculo ? (
            <span>
              Alterações pedidas aqui vão para{' '}
              <strong>{[vinculo.empresa, vinculo.referencia].filter(Boolean).join(' · ') || vinculo.relatorio_id}</strong>
              {vinculo.versao ? ` (versão ${vinculo.versao})` : ''}.
            </span>
          ) : (
            <span>Nenhum relatório ligado a esta conversa.</span>
          )}
          <Button kind="ghost" size="sm" renderIcon={IconeVinculo} onClick={onEscolherRelatorio} disabled={enviando}>
            {vinculo ? 'Trocar' : 'Usar um relatório pronto'}
          </Button>
        </div>
        <div className="chat-composer__row">
          <TextArea
            id="chat-input"
            labelText="Mensagem"
            hideLabel
            rows={2}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            disabled={enviando}
            placeholder="Ex.: Qual a folga do covenant de alavancagem da Ecorodovias no 2T26?"
          />
          <Button
            kind="primary"
            renderIcon={Send}
            className="chat-composer__send"
            onClick={enviar}
            disabled={enviando || !texto.trim()}
          >
            {enviando ? 'Enviando' : 'Enviar'}
          </Button>
        </div>
        <p className="chat-composer__hint">
          Enter envia, Shift + Enter quebra a linha. Valide as respostas antes de decisões de
          crédito.
          {MODO_SIMULADO && ' Modo simulado: o agente não está sendo acionado.'}
        </p>
      </div>
    </main>
  )
}

export default ChatMain
