import { useState } from 'react'
import { Button, InlineNotification, Modal, TextInput } from '@carbon/react'
import { TrashCan } from '@carbon/icons-react'
import { removerEmissor } from '../../services/coletaApi'
import './NovoEmissor.scss'

// Remover emissor: só os cadastrados pela tela (origem "cadastro"); Ecorodovias e Motiva vêm de configuração fixa.
// A remoção é lógica: o emissor some das listas, da coleta, do chat e do extrator, mas os documentos ficam guardados e
// cadastrar o mesmo CNPJ de novo o reativa. Para não remover por engano, o botão só libera com o nome digitado.

const normalizar = texto => (texto || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function RemoverEmissor({ emissor, onRemovido }) {
  const [aberto, setAberto] = useState(false)
  const [digitado, setDigitado] = useState('')
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState('')

  if (emissor?.origem !== 'cadastro') return null
  const nome = emissor.nome_curto || emissor.razao_social
  const confere = normalizar(digitado) === normalizar(nome)

  function fechar() {
    setAberto(false)
    setDigitado('')
    setErro('')
  }

  async function remover() {
    if (!confere || removendo) return
    setRemovendo(true)
    setErro('')
    try {
      await removerEmissor(emissor.emissor)
      fechar()
      onRemovido?.(emissor)
    } catch (e) {
      setErro(e.message || 'Não foi possível remover o emissor.')
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <>
      <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} onClick={() => setAberto(true)}>
        Remover emissor
      </Button>
      <Modal
        open={aberto}
        danger
        modalHeading={`Remover ${nome}?`}
        primaryButtonText={removendo ? 'Removendo…' : 'Remover emissor'}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={!confere || removendo}
        onRequestSubmit={remover}
        onRequestClose={fechar}
        size="sm"
        className="novo-emissor"
      >
        <p className="novo-emissor__ajuda">
          <strong>{emissor.razao_social}</strong> ({emissor.cnpj}) sai das listas de emissores, da coleta, do envio
          manual e do chat, e documentos novos dele deixam de ser extraídos.
        </p>
        <p className="novo-emissor__ajuda">
          Os documentos e extrações já guardados não são apagados. Para trazê-lo de volta, cadastre o mesmo CNPJ em
          “Novo emissor” e confirme a reativação.
        </p>
        <TextInput id="remover-emissor-nome" labelText={`Para confirmar, digite o nome: ${nome}`} value={digitado}
          onChange={e => setDigitado(e.target.value)} autoComplete="off" />
        {erro && <InlineNotification kind="error" lowContrast hideCloseButton title="Não removido." subtitle={erro} />}
      </Modal>
    </>
  )
}

export default RemoverEmissor
