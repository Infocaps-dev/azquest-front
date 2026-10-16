import { ComposedModal, ModalBody, ModalHeader } from '@carbon/react'
import { evidenciaDe, rotuloEvidencia, tipoDeEvidencia } from './vocabulario'
import './RelatorioCompleto.scss'

// Relatório completo, item 3.7 e seção 4: o template da Marcela virando
// componente.
//
// O HTML de referência não é embutido: dele vieram o CSS e a estrutura de
// classes (`doc-header`, `section-heading`, `sub-heading`, `body-text`,
// `caption`, `nao-entra`, `footnote`), e este componente renderiza a partir
// dos mesmos dados que alimentam os highlights. Highlights, revisão e
// relatório completo passam a ser os mesmos dados em três formatos.
//
// Três correções da seção 4 do handoff, aplicadas:
//
// 1. Travessão, meia-risca e o separador "·" saíram, na extração do índice.
// 2. "Não entra no Piloto" continua visível na impressão. O CSS original o
//    escondia com `@media print { .nao-entra { display: none } }`, o que
//    contradiz a regra de "nenhum item excluído": o PDF exportado deixaria de
//    mostrar justamente o que não foi coberto.
// 3. O `img-placeholder` distingue o que é imagem ainda não extraída do que é
//    "não localizado" de propósito, em vez de usar a mesma caixa para os dois.

function Legenda({ item }) {
  const evidencias = item.evidencias || []
  if (!evidencias.length) {
    return (
      <p className="rel-caption rel-caption--ausente">
        Não localizado{item.observacao ? `: ${item.observacao}` : ''}
      </p>
    )
  }
  return (
    <>
      {evidencias.map((e, i) => (
        <p key={i} className={`rel-caption rel-caption--${evidenciaDe(e.tipo_fonte).classe}`}>
          {evidenciaDe(e.tipo_fonte).rotulo}: {rotuloEvidencia(e)}
        </p>
      ))}
    </>
  )
}

function Item({ item, onAbrir }) {
  const ausente = tipoDeEvidencia(item) === 'nao_localizado'
  const doAnalista = item.origem_texto === 'analista'

  if (item.tipo === 'imagem' || item.tipo === 'grafico') {
    return (
      <div className="rel-figura">
        {/* Imagem ainda não servida: o extrator gera as imagens de página no
            bucket, e a rota que as serve é da etapa 8. A caixa diz o que é,
            em vez de parecer uma imagem que faltou. */}
        <div className="rel-img-pendente">
          {item.tipo === 'grafico'
            ? 'Gráfico do relatório, ainda não extraído'
            : 'Imagem do relatório, ainda não extraída'}
        </div>
        <p className="rel-body" onClick={() => onAbrir?.(item)}>{item.conteudo}</p>
        <Legenda item={item} />
      </div>
    )
  }

  return (
    <div className="rel-item">
      <p
        className={[
          'rel-body',
          ausente ? 'rel-body--ausente' : '',
          doAnalista ? 'rel-body--analista' : '',
        ].join(' ').trim()}
        onClick={() => onAbrir?.(item)}
      >
        {doAnalista && <span className="rel-marca">Comentário do analista </span>}
        {item.conteudo}
      </p>
      <Legenda item={item} />
    </div>
  )
}

function RelatorioCompleto({ aberto, onFechar, analise, indice = [], itens = [], onAbrirItem }) {
  const porNo = itens.reduce((mapa, item) => {
    if (!item.chave_no) return mapa
    mapa[item.chave_no] = [...(mapa[item.chave_no] || []), item]
    return mapa
  }, {})

  const fora = indice.filter(n => !n.no_piloto).length

  return (
    <ComposedModal open={aberto} onClose={onFechar} size="lg" className="rel-modal">
      <ModalHeader
        label="Relatório completo"
        title={analise?.referencia || 'Relatório de Crédito'}
        closeModal={onFechar}
        iconDescription="Fechar"
      />
      <ModalBody hasScrollingContent>
        <div className="rel-doc">
          <header className="rel-header">
            <div>
              <span className="rel-marca-dagua">AZ<span>Quest</span></span>
              <span className="rel-subtitulo">Relatório de Crédito</span>
            </div>
            <div className="rel-meta">
              <strong>{analise?.emissor}</strong>
              <span>Data-base {analise?.data_base}</span>
              <span className="rel-badge">{analise?.versao} {analise?.status}</span>
            </div>
          </header>

          <p className="rel-aviso">
            {indice.length} seções e anexos do relatório, {fora} fora do recorte do
            Piloto. Nenhuma seção é omitida: o que não entra aparece marcado.
          </p>

          <div className="rel-conteudo">
            {indice.map((no, i) => {
              const doNo = porNo[no.chave] || []
              const Titulo = no.tipo === 'secao' ? 'h2' : no.tipo === 'anexo' ? 'h2' : 'h3'
              const classe = no.tipo === 'secao'
                ? 'rel-secao'
                : no.tipo === 'anexo' ? 'rel-anexo' : 'rel-subsecao'
              return (
                <section key={`${no.chave}-${i}`}>
                  <Titulo className={classe}>
                    {no.tipo === 'secao' && (
                      <span className="rel-numero">
                        {String(no.numero).padStart(2, '0')}
                      </span>
                    )}
                    {no.titulo}
                  </Titulo>

                  {!no.no_piloto && doNo.length === 0 && (
                    <p className="rel-nao-entra">Não entra no Piloto</p>
                  )}

                  {doNo.map(item => (
                    <Item key={item.id} item={item} onAbrir={onAbrirItem} />
                  ))}

                  {no.no_piloto && doNo.length === 0 && (
                    <p className="rel-nao-entra">
                      Seção do recorte sem item no roteiro
                    </p>
                  )}
                </section>
              )
            })}
          </div>

          <footer className="rel-footer">
            <span className="rel-marca-dagua">AZ<span>Quest</span></span>
            <span>
              Gerado da mesma fonte dos highlights. Cada legenda aponta
              documento e página.
            </span>
          </footer>
        </div>
      </ModalBody>
    </ComposedModal>
  )
}

export default RelatorioCompleto
