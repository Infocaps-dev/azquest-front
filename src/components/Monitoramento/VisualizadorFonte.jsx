import { ComposedModal, ModalBody, ModalHeader } from '@carbon/react'
import { rotuloFonte } from './niveis'

// Visualizador de fonte, item 8 da seção 11.
//
// O handoff prevê abrir a página do PDF com o trecho destacado quando houver
// bbox. O extrator já produz a imagem da página e o bbox, mas a monitor-api
// ainda não expõe uma rota que sirva esse recorte. Até lá, o visualizador
// mostra a referência completa e de onde o número veio, que é o que o analista
// precisa para conferir na fonte. O espaço da imagem está preparado.

function VisualizadorFonte({ fonte, aberto, onFechar }) {
  if (!fonte) return null

  return (
    <ComposedModal open={aberto} onClose={onFechar} size="md" className="mon-fonte-modal">
      <ModalHeader label="Rastreabilidade" title="Fonte do dado" closeModal={onFechar}
        iconDescription="Fechar" />
      <ModalBody>
        <dl className="mon-fonte-modal__dados">
          <dt>Documento</dt>
          <dd>{fonte.documento}</dd>

          {fonte.pagina && (
            <>
              <dt>Página do PDF</dt>
              <dd>{fonte.pagina}</dd>
            </>
          )}
          {fonte.pagina_impressa && (
            <>
              <dt>Página impressa</dt>
              <dd>{fonte.pagina_impressa}</dd>
            </>
          )}
          {fonte.aba && (
            <>
              <dt>Planilha</dt>
              <dd>aba &quot;{fonte.aba}&quot;, linha {fonte.linha}, coluna {fonte.coluna}</dd>
            </>
          )}
          {fonte.local && (
            <>
              <dt>Localização</dt>
              <dd>{fonte.local}</dd>
            </>
          )}
        </dl>

        {fonte.trecho && (
          <blockquote className="mon-fonte-modal__trecho">{fonte.trecho}</blockquote>
        )}

        <p className="mon-fonte-modal__nota">
          Referência para conferência: {rotuloFonte(fonte)}. A imagem da página com o
          trecho destacado entra quando a API expuser o recorte gerado pelo extrator.
        </p>
      </ModalBody>
    </ComposedModal>
  )
}

export default VisualizadorFonte
