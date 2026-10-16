import { useState } from 'react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
} from '@carbon/react'
import { executarCiclo } from '../../services/monitorApi'
import { nivelDe, nomeDaEtapa } from './niveis'

// Aviso de desvio no fluxo.
//
// O ciclo B1 a B8 não é uma fila: em B4 ele se divide. Quando nada é material
// segue para B5, "Registrar sem impacto"; quando há item relevante ou acima,
// pula B5 e vai para B6, a análise de impacto. O roteamento fica gravado na
// comparação, decidido pelo motor de regras, não aqui.
//
// Sem este aviso o analista via o ciclo parado numa etapa que nunca vai rodar,
// sem explicação e sem saída. O modal diz qual regra desviou o fluxo e oferece
// a ação de seguir.
//
// O botão não executa a análise: isso é trabalho do agente. Ele registra que a
// etapa de destino começou, que é a transição de estado que uma pessoa pode
// legitimamente assinar.

function ModalDesvio({ emissor, periodo, comparacao, etapaApontada, destino, aberto, onFechar, onSeguiu }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  if (!destino || !etapaApontada) return null

  const nivel = nivelDe(comparacao?.nivel_maximo)
  const nomeDestino = nomeDaEtapa(destino)
  const nomePulada = nomeDaEtapa(etapaApontada)

  async function seguir() {
    setErro('')
    setEnviando(true)
    try {
      // Roda o ciclo, em vez de marcar a etapa de destino na mao.
      //
      // A primeira versao gravava a etapa como "em execucao" para faze-la
      // aparecer como corrente. Era estado falso: nada estava executando, e o
      // ciclo ficou preso -- a propria trava contra ciclos simultaneos passou
      // a impedir que ele fosse reiniciado. Estado de processo so se grava
      // quando ha processo por tras.
      await executarCiclo(emissor, periodo)
      onSeguiu?.(destino)
      onFechar?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ComposedModal open={aberto} onClose={onFechar} size="sm" className="mon-desvio-modal">
      <ModalHeader label="Fluxo do ciclo" title="O ciclo segue por outro caminho"
        closeModal={onFechar} iconDescription="Fechar" />
      <ModalBody>
        <p className="mon-desvio-modal__linha">
          A comparação classificou este ciclo como{' '}
          <Tag type={nivel.tag} size="sm">{nivel.rotulo}</Tag>.
        </p>

        <p className="mon-desvio-modal__linha">
          Por isso a etapa <strong>{nomePulada}</strong> não se aplica: ela é o
          caminho dos ciclos sem impacto material. O fluxo vai para{' '}
          <strong>{nomeDestino}</strong>, onde a análise é redigida e passa pela
          sua aprovação.
        </p>

        {comparacao?.roteamento?.destaque_no_resumo && (
          <p className="mon-desvio-modal__nota">
            O motor de regras marcou este ciclo para destaque no resumo da Gestão.
          </p>
        )}

        <p className="mon-desvio-modal__nota">
          Seguir roda o ciclo deste período de novo, do início, e ele vai parar
          em {nomeDestino} aguardando a sua decisão. A análise em si é redigida
          pelo agente; o que entra agora é o resumo montado a partir dos números
          e das fontes.
        </p>

        {erro && (
          <InlineNotification kind="error" lowContrast hideCloseButton title={erro}
            className="mon-desvio-modal__erro" />
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onFechar} disabled={enviando}>
          Agora não
        </Button>
        <Button kind="primary" onClick={seguir} disabled={enviando}>
          {enviando ? 'Seguindo…' : `Seguir para ${nomeDestino}`}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}

export default ModalDesvio
