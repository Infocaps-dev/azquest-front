import { useState } from 'react'
import {
  Button,
  InlineNotification,
  Tag,
  TextArea,
} from '@carbon/react'
import { Checkmark, Close, Edit } from '@carbon/icons-react'
import { nivelDe } from './niveis'
import { registrarRevisao } from '../../services/monitorApi'

// Painel de aprovação, item 6 da seção 11. Aparece quando o fluxo chega em B6.
//
// A decisão é do analista: a IA sinaliza, nunca decide. Rejeitar exige
// justificativa e editar exige o texto revisado, as duas regras validadas aqui
// e de novo na API, que recusa com 422. A validação na tela existe para o
// analista não perder o que escreveu numa ida ao servidor.

function PainelAprovacao({ alerta, usuario, onDecidido }) {
  const [texto, setTexto] = useState(alerta?.texto || '')
  const [justificativa, setJustificativa] = useState('')
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [decidido, setDecidido] = useState(null)

  if (!alerta) return null

  const nivel = nivelDe(alerta.nivel)

  async function decidir(decisao) {
    setErro('')
    setEnviando(true)
    try {
      await registrarRevisao({
        alertaId: alerta.id,
        usuario,
        decisao,
        justificativa,
        textoEditado: decisao === 'editado' ? texto : undefined,
      })
      setDecidido(decisao)
      onDecidido?.(decisao)
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (decidido) {
    return (
      <section className="mon-aprovacao" aria-label="Decisão registrada">
        <InlineNotification
          kind={decidido === 'rejeitado' ? 'info' : 'success'}
          lowContrast
          hideCloseButton
          title={`Alerta ${decidido}`}
          subtitle={
            decidido === 'rejeitado'
              ? 'O ciclo não segue para a Gestão. A justificativa foi registrada.'
              : 'O ciclo segue para B8 e a Gestão recebe o alerta.'
          }
        />
      </section>
    )
  }

  return (
    <section className="mon-aprovacao" aria-label="Aprovação do analista">
      <div className="mon-aprovacao__cabecalho">
        <h3 className="mon-secao__titulo">Análise de impacto, aguardando sua decisão</h3>
        <Tag type={nivel.tag} size="md">{nivel.rotulo}</Tag>
      </div>

      {alerta.recomendacao && (
        <p className="mon-aprovacao__recomendacao">
          <strong>Recomendação:</strong> {alerta.recomendacao}
        </p>
      )}

      {erro && (
        <InlineNotification kind="error" lowContrast hideCloseButton title={erro}
          className="mon-aprovacao__erro" />
      )}

      {editando ? (
        <TextArea
          id="mon-texto-analise"
          labelText="Texto da análise"
          helperText="O texto editado substitui o gerado e fica registrado com seu usuário."
          rows={10}
          value={texto}
          onChange={e => setTexto(e.target.value)}
        />
      ) : (
        <p className="mon-aprovacao__texto">{alerta.texto}</p>
      )}

      <TextArea
        id="mon-justificativa"
        labelText="Justificativa"
        helperText="Obrigatória para rejeitar. Alimenta o ajuste das regras de materialidade."
        rows={3}
        value={justificativa}
        onChange={e => setJustificativa(e.target.value)}
      />

      <div className="mon-aprovacao__acoes">
        <Button kind="primary" renderIcon={Checkmark} disabled={enviando}
          onClick={() => decidir(editando ? 'editado' : 'aprovado')}>
          {editando ? 'Salvar e aprovar' : 'Aprovar'}
        </Button>
        {!editando && (
          <Button kind="tertiary" renderIcon={Edit} disabled={enviando}
            onClick={() => setEditando(true)}>
            Editar
          </Button>
        )}
        <Button kind="danger--tertiary" renderIcon={Close} disabled={enviando}
          onClick={() => decidir('rejeitado')}>
          Rejeitar
        </Button>
      </div>
    </section>
  )
}

export default PainelAprovacao
