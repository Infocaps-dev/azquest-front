import { useEffect, useRef, useState } from 'react'
import { Dropdown, IconButton, Modal, TextArea } from '@carbon/react'
import { ThumbsDown, ThumbsDownFilled, ThumbsUp, ThumbsUpFilled } from '@carbon/icons-react'
import { avaliarResposta, motivosDeFeedback } from '../../services/chatApi'

// A avaliação de cada resposta do agente (28/10/2026). O polegar grava na hora; no negativo, um modal oferece (sem
// obrigar) o motivo e uma observação. Fechar ou pular mantém o voto negativo sem detalhe. Trocar para positivo enquanto
// o modal está aberto não deixa um envio antigo do modal voltar o voto para negativo.

const LIMITE = 2000

export default function FeedbackDaResposta({ pedidoId, threadId, inicial }) {
  const [voto, setVoto] = useState(inicial?.avaliacao || null)
  const [aberto, setAberto] = useState(false)
  const [motivos, setMotivos] = useState([])
  const [motivo, setMotivo] = useState(null)
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const votoAtual = useRef(voto)
  votoAtual.current = voto

  useEffect(() => {
    if (aberto && !motivos.length) motivosDeFeedback().then(setMotivos).catch(() => setMotivos([]))
  }, [aberto, motivos.length])

  if (!pedidoId || !threadId) return null

  const votar = async (avaliacao) => {
    const anterior = voto
    setVoto(avaliacao)
    setErro('')
    try {
      await avaliarResposta({ pedidoId, threadId, avaliacao })
      if (avaliacao === 'negativo') {
        setMotivo(null)
        setComentario('')
        setAberto(true)
      }
    } catch (e) {
      setVoto(anterior)
      setErro(e.message || 'Não foi possível registrar a avaliação.')
    }
  }

  const detalhar = async () => {
    if (votoAtual.current !== 'negativo') { setAberto(false); return }
    setEnviando(true)
    try {
      await avaliarResposta({ pedidoId, threadId, avaliacao: 'negativo', motivo: motivo?.codigo || null,
                              comentario: comentario.trim() || null })
      setAberto(false)
    } catch (e) {
      setErro(e.message || 'Não foi possível enviar o detalhe.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="chat-feedback">
      <span className="chat-feedback__pergunta">
        {voto ? 'Obrigado pelo retorno' : 'Esta resposta foi útil?'}
      </span>
      <IconButton kind="ghost" size="sm" align="top" label="Útil" aria-pressed={voto === 'positivo'}
                  onClick={() => voto !== 'positivo' && votar('positivo')}>
        {voto === 'positivo' ? <ThumbsUpFilled /> : <ThumbsUp />}
      </IconButton>
      <IconButton kind="ghost" size="sm" align="top" label="Não foi útil" aria-pressed={voto === 'negativo'}
                  onClick={() => (voto === 'negativo' ? setAberto(true) : votar('negativo'))}>
        {voto === 'negativo' ? <ThumbsDownFilled /> : <ThumbsDown />}
      </IconButton>
      {erro && <span className="chat-feedback__erro">{erro}</span>}

      <Modal
        open={aberto}
        size="sm"
        modalLabel="Avaliação da resposta"
        modalHeading="O que não funcionou?"
        primaryButtonText={enviando ? 'Enviando…' : 'Enviar'}
        secondaryButtonText="Pular"
        primaryButtonDisabled={enviando}
        onRequestSubmit={detalhar}
        onSecondarySubmit={() => setAberto(false)}
        onRequestClose={() => setAberto(false)}
      >
        <p className="chat-feedback__ajuda">
          Seu voto já foi registrado. Se quiser, conte o motivo: ajuda a corrigir o que falhou.
        </p>
        <Dropdown
          id={`motivo-${pedidoId}`}
          titleText="Motivo (opcional)"
          label="Selecione um motivo"
          items={motivos}
          itemToString={item => item?.rotulo || ''}
          selectedItem={motivo}
          onChange={({ selectedItem }) => setMotivo(selectedItem)}
        />
        <TextArea
          id={`observacoes-${pedidoId}`}
          className="chat-feedback__observacoes"
          labelText="Observações (opcional)"
          placeholder="O que estava errado ou faltou?"
          rows={3}
          enableCounter
          maxCount={LIMITE}
          value={comentario}
          onChange={e => setComentario(e.target.value.slice(0, LIMITE))}
        />
      </Modal>
    </div>
  )
}
