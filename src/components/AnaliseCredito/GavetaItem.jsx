import { useEffect, useState } from 'react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
  TextArea,
} from '@carbon/react'
import { Checkmark, Close, Edit } from '@carbon/icons-react'
import { evidenciaDe, revisaoDe, rotuloEvidencia, tipoDeEvidencia } from './vocabulario'

// Gaveta de detalhe e revisão, itens 3.7 e 3.8.
//
// Abre ao clicar num cartão: texto completo, todas as evidências e as três
// ações de revisão. Rejeitar exige motivo e ajustar exige o texto, validados
// aqui e de novo na API, que recusa com 422. A validação na tela existe para o
// analista não perder o que escreveu numa ida ao servidor.
//
// A fila ("Revisar pendentes") usa a mesma gaveta, um item por vez: `proximo`
// avança sem fechar, para quem está revisando 54 itens não precisar reabrir a
// gaveta 54 vezes.

function GavetaItem({ item, aberta, onFechar, onRevisar, onProximo, restantes = 0 }) {
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // Trocar de item na fila zera o formulário. Sem isto, o motivo digitado num
  // item apareceria preenchido no seguinte, e seria gravado como se fosse dele.
  useEffect(() => {
    setTexto(item?.conteudo || '')
    setMotivo('')
    setEditando(false)
    setErro('')
  }, [item?.id, item?.conteudo])

  if (!item) return null

  const evidencia = evidenciaDe(tipoDeEvidencia(item))
  const revisao = revisaoDe(item.revisao?.status)
  const evidencias = item.evidencias || []

  async function decidir(decisao) {
    setErro('')
    setEnviando(true)
    try {
      await onRevisar?.(item.id, {
        decisao,
        motivo,
        textoAjustado: decisao === 'ajustado' ? texto : undefined,
      })
      if (onProximo && restantes > 0) onProximo()
      else onFechar?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ComposedModal open={aberta} onClose={onFechar} size="lg" className="ana-gaveta">
      <ModalHeader
        label={[item.secao, item.subsecao].filter(Boolean).join(' > ')}
        title={item.titulo_no_relatorio || item.titulo}
        closeModal={onFechar}
        iconDescription="Fechar"
      />
      <ModalBody hasScrollingContent>
        <div className="ana-gaveta__selos">
          <Tag type={evidencia.tag} size="md">{evidencia.rotulo}</Tag>
          <Tag type={revisao.tag} size="md">{revisao.rotulo}</Tag>
          {item.origem_texto === 'analista' && (
            <Tag type="green" size="md">Comentário do analista</Tag>
          )}
          {item.secao_numero && (
            <span className="ana-gaveta__secao">Seção {item.secao_numero} do relatório</span>
          )}
        </div>

        {editando ? (
          <TextArea
            id="ana-texto-item"
            labelText="Texto do item"
            helperText="O texto ajustado substitui o gerado e fica registrado com seu usuário."
            rows={8}
            value={texto}
            onChange={e => setTexto(e.target.value)}
          />
        ) : (
          <p className="ana-gaveta__conteudo">{item.conteudo || '—'}</p>
        )}

        <h4 className="ana-gaveta__titulo">
          Evidências {evidencias.length > 0 && `(${evidencias.length})`}
        </h4>
        {evidencias.length ? (
          <ul className="ana-gaveta__evidencias">
            {evidencias.map((e, i) => (
              <li key={i}>
                <span className={`ana-rotulo ana-rotulo--${evidenciaDe(e.tipo_fonte).classe}`}>
                  {evidenciaDe(e.tipo_fonte).rotulo}
                </span>
                <span className="ana-gaveta__ref">{rotuloEvidencia(e)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Não localizado"
            subtitle={
              item.observacao
              || 'Sem fonte na amostra do Piloto. Aprovar mantém o rótulo no relatório.'
            }
          />
        )}

        {item.observacao && evidencias.length > 0 && (
          <p className="ana-gaveta__observacao">{item.observacao}</p>
        )}

        {erro && (
          <InlineNotification kind="error" lowContrast hideCloseButton title={erro} />
        )}

        <TextArea
          id="ana-motivo"
          labelText="Motivo"
          helperText="Obrigatório para rejeitar. Alimenta o ajuste do roteiro."
          rows={2}
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
        />
      </ModalBody>
      <ModalFooter>
        {restantes > 0 && (
          <span className="ana-gaveta__restantes">{restantes} na fila</span>
        )}
        <Button kind="danger--tertiary" renderIcon={Close} disabled={enviando}
          onClick={() => decidir('rejeitado')}>
          Rejeitar
        </Button>
        {!editando && (
          <Button kind="tertiary" renderIcon={Edit} disabled={enviando}
            onClick={() => setEditando(true)}>
            Ajustar
          </Button>
        )}
        <Button kind="primary" renderIcon={Checkmark} disabled={enviando}
          onClick={() => decidir(editando ? 'ajustado' : 'aprovado')}>
          {editando ? 'Salvar e aprovar' : 'Aprovar'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}

export default GavetaItem
