import { useEffect, useRef, useState } from 'react'
import { ComposedModal, InlineNotification, Loading, ModalBody, ModalHeader } from '@carbon/react'
import { Launch } from '@carbon/icons-react'
import { enderecoHtml, enderecoRelatorio } from '../../services/resumosApi'
import './RelatorioCompleto.scss'

// Relatório completo: o HTML publicado pelo agente, o mesmo que o analista
// baixa, e não uma remontagem a partir dos itens. Gráficos, tabelas e imagens
// aparecem como no documento.
//
// O HTML vem pela resumos-api (mesma origem do front), então a tela consegue
// rolar o iframe até a âncora pedida: cada seção (#secao-10-e) e cada item
// (#item-E-070) do relatório tem a sua, e o item fica destacado. Relatório
// gerado antes das âncoras abre no início, com o aviso.

function RelatorioCompleto({ aberto, onFechar, relatorioId, versao, titulo, ancora }) {
  const quadro = useRef(null)
  const [carregado, setCarregado] = useState(false)
  const [semAncora, setSemAncora] = useState(false)

  useEffect(() => {
    if (!aberto) setCarregado(false)
    setSemAncora(false)
  }, [aberto, relatorioId, ancora])

  useEffect(() => {
    if (!aberto || !carregado || !ancora) return
    const janela = quadro.current?.contentWindow
    const alvo = janela?.document.getElementById(ancora)
    setSemAncora(!alvo)
    if (!alvo) return
    // O hash ativa o destaque (:target) do CSS do relatório; o scrollIntoView
    // cobre o clique repetido na mesma âncora, que não muda o hash.
    if (janela.location.hash !== `#${ancora}`) janela.location.hash = ancora
    alvo.scrollIntoView({ block: 'start' })
  }, [aberto, carregado, ancora])

  if (!relatorioId) return null

  return (
    <ComposedModal open={aberto} onClose={onFechar} size="lg" className="rel-modal">
      <ModalHeader label="Relatório completo" title={titulo || 'Relatório de Crédito'} closeModal={onFechar}
        iconDescription="Fechar">
        <a className="rel-modal__abrir" href={enderecoRelatorio(relatorioId, versao)} target="_blank" rel="noreferrer">
          Abrir em nova aba <Launch size={14} />
        </a>
      </ModalHeader>
      <ModalBody className="rel-modal__corpo">
        {semAncora && (
          <InlineNotification kind="info" lowContrast hideCloseButton className="rel-modal__aviso"
            title="Posição não encontrada"
            subtitle="Este relatório foi gerado antes das âncoras de navegação: ele abre no início." />
        )}
        {!carregado && <Loading withOverlay={false} small description="Carregando o relatório" />}
        {aberto && (
          <iframe
            ref={quadro}
            title="Relatório completo"
            className="rel-modal__quadro"
            // Sem allow-scripts: o relatório não roda código nenhum. allow-same-origin mantém a rolagem até a âncora.
            sandbox="allow-same-origin"
            src={enderecoHtml(relatorioId, versao)}
            onLoad={() => setCarregado(true)}
          />
        )}
      </ModalBody>
    </ComposedModal>
  )
}

export default RelatorioCompleto
