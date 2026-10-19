import { useCallback, useEffect, useRef, useState } from 'react'
import { ComposedModal, InlineNotification, Loading, ModalBody, ModalHeader } from '@carbon/react'
import { Launch } from '@carbon/icons-react'
import { enderecoHtml, enderecoRelatorio, versaoPublicada } from '../../services/resumosApi'
import EdicaoTrecho from './EdicaoTrecho.jsx'
import { PREFIXO_EDICAO, referenciaDoTrecho, textoVisivel } from './edicaoTrecho'
import './RelatorioCompleto.scss'

// Relatório completo: o HTML publicado pelo agente, o mesmo que o analista
// baixa, e não uma remontagem a partir dos itens. Gráficos, tabelas e imagens
// aparecem como no documento.
//
// O HTML vem pela resumos-api (mesma origem do front), então a tela consegue
// rolar o iframe até a âncora pedida: cada seção (#secao-10-e) e cada item
// (#item-E-070) do relatório tem a sua, e o item fica destacado. Relatório
// gerado antes das âncoras abre no início, com o aviso.
//
// Edição no próprio relatório: a tela põe um botão "Editar" em cada trecho e
// "Editar seção" em cada título. O relatório não roda script (CSP e sandbox),
// então o botão é um link para o fragmento #azq-editar=<âncora>, que a tela lê
// no iframe. O clique abre a janela de edição na frente do relatório; quando a
// versão nova é publicada, a tela troca para ela, posicionada no trecho
// alterado e com ele destacado. Sem aviso de "versão disponível": o analista
// já está olhando para ela.

const ESTILO_EDICAO = `
.azq-editavel { position: relative; }
.azq-editar {
  position: absolute; top: 0; right: 0; z-index: 5; display: none;
  padding: 2px 10px; border-radius: 2px; background: #0f62fe; color: #fff !important;
  font: 500 12px/18px 'IBM Plex Sans', Arial, sans-serif; text-decoration: none !important;
  letter-spacing: .16px; text-transform: none; box-shadow: 0 1px 3px rgba(0,0,0,.25);
}
.azq-editar:hover { background: #0353e9; }
.azq-editavel:hover > .azq-editar, .azq-editar:focus { display: inline-block; }
.section-heading.azq-editavel > .azq-editar, .annex-heading.azq-editavel > .azq-editar { top: 50%; transform: translateY(-50%); right: 8px; }
`

// Blocos que ganham botão: todo item com âncora, menos tabela, gráfico e imagem (vêm prontos dos documentos e não se
// editam por texto), e todo título de seção e subseção.
const SEM_EDICAO = /^item-(?:tabela|grafico|imagem)-/

function porBotoes(doc) {
  if (!doc?.head || doc.getElementById('azq-edicao-estilo')) return
  const estilo = doc.createElement('style')
  estilo.id = 'azq-edicao-estilo'
  estilo.textContent = ESTILO_EDICAO
  doc.head.appendChild(estilo)
  doc.querySelectorAll('a.ancora[id]').forEach(ancora => {
    const id = ancora.id
    const secao = id.startsWith('secao-')
    if ((!secao && !id.startsWith('item-')) || SEM_EDICAO.test(id)) return
    let alvo = ancora.nextElementSibling
    if (!alvo || alvo.classList.contains('ancora') || alvo.tagName === 'TABLE') return
    if (alvo.tagName === 'UL' || alvo.tagName === 'OL') alvo = alvo.firstElementChild || alvo // botão dentro do <li>
    alvo.classList.add('azq-editavel')
    const botao = doc.createElement('a')
    botao.className = 'azq-editar'
    botao.href = `#${PREFIXO_EDICAO}${id}`
    botao.textContent = secao ? 'Editar seção' : 'Editar'
    botao.title = secao ? 'Pedir uma alteração nesta seção' : 'Pedir uma alteração neste trecho'
    alvo.appendChild(botao)
  })
}

function RelatorioCompleto({
  aberto, onFechar, relatorioId, versao, titulo, ancora, itens, indice, versaoResumo, onVersaoNova,
}) {
  const quadro = useRef(null)
  const [carregado, setCarregado] = useState(false)
  const [semAncora, setSemAncora] = useState(false)
  // A versão no iframe. Começa na do resumo (assim o texto-fonte de cada bloco, que vem do resumo, é o da tela) e
  // avança com as edições feitas aqui, sem esperar o monitor refazer o resumo.
  const [versaoTela, setVersaoTela] = useState(versao || null)
  const [foco, setFoco] = useState(null) // âncoras onde a versão nova se posiciona: o item, senão a seção
  const [edicao, setEdicao] = useState(null)
  const [concluida, setConcluida] = useState(null)

  useEffect(() => {
    setVersaoTela(versao || null)
    setEdicao(null)
    setFoco(null)
    setConcluida(null)
  }, [relatorioId]) // eslint-disable-line react-hooks/exhaustive-deps -- só ao trocar de relatório

  useEffect(() => {
    if (versao && (!versaoTela || versao > versaoTela)) setVersaoTela(versao)
  }, [versao]) // eslint-disable-line react-hooks/exhaustive-deps -- segue a versão do resumo quando ela passa à frente

  useEffect(() => {
    if (!aberto) {
      setCarregado(false)
      setEdicao(null)
      setConcluida(null)
    }
    setSemAncora(false)
    setFoco(null) // "Ver no relatório" depois de uma edição volta a valer a âncora pedida
  }, [aberto, relatorioId, ancora])

  useEffect(() => { setCarregado(false) }, [versaoTela])

  // Âncora pedida (clique em "Ver no relatório") ou foco da versão nova depois de uma edição.
  useEffect(() => {
    if (!aberto || !carregado) return
    const janela = quadro.current?.contentWindow
    const candidatas = foco || (ancora ? [ancora] : [])
    if (!janela || !candidatas.length) return
    const id = candidatas.find(c => janela.document.getElementById(c))
    if (!foco) setSemAncora(!id)
    if (!id) return
    // O hash ativa o destaque (:target) do CSS do relatório; o scrollIntoView
    // cobre o clique repetido na mesma âncora, que não muda o hash.
    if (janela.location.hash !== `#${id}`) janela.location.hash = id
    janela.document.getElementById(id).scrollIntoView({ block: 'start' })
  }, [aberto, carregado, ancora, foco])

  const abrirEdicao = useCallback((id, doc) => {
    const bloco = doc.getElementById(id)?.nextElementSibling
    setConcluida(null)
    setEdicao(referenciaDoTrecho({
      ancora: id, itens, indice, textoNaTela: textoVisivel(bloco),
      resumoDaVersaoNaTela: Boolean(versaoTela) && versaoResumo === versaoTela,
    }))
  }, [itens, indice, versaoResumo, versaoTela])

  // Botões de edição em cada carga do HTML, e o clique lido do hash do iframe.
  useEffect(() => {
    if (!aberto || !carregado || !versaoTela) return undefined
    const janela = quadro.current?.contentWindow
    porBotoes(janela?.document)
    const relogio = setInterval(() => {
      const atual = quadro.current?.contentWindow
      const hash = decodeURIComponent(atual?.location.hash || '')
      if (!hash.startsWith(`#${PREFIXO_EDICAO}`)) return
      const id = hash.slice(1 + PREFIXO_EDICAO.length)
      atual.location.hash = id // destaca o trecho que vai ser editado
      abrirEdicao(id, atual.document)
    }, 250)
    return () => clearInterval(relogio)
  }, [aberto, carregado, versaoTela, abrirEdicao])

  function versaoGerada(nova) {
    const ref = edicao
    setEdicao(null)
    setFoco([...(ref?.ancorasFoco || []), 'sumario'])
    setConcluida({ versao: nova, rotulo: ref?.rotulo })
    setVersaoTela(nova)
    onVersaoNova?.(nova)
  }

  // Outra versão saiu enquanto a tela estava aberta: carrega a mais nova, no trecho que o analista ia editar.
  async function irParaMaisNova() {
    let n = versaoTela
    while (await versaoPublicada(relatorioId, n + 1)) n += 1
    const ref = edicao
    setEdicao(null)
    setFoco([...(ref?.ancorasFoco || []), 'sumario'])
    setConcluida({ versao: n, rotulo: ref?.rotulo, mudou: true })
    setVersaoTela(n)
    onVersaoNova?.(n)
  }

  if (!relatorioId) return null

  return (
    <ComposedModal open={aberto} onClose={onFechar} size="lg" className="rel-modal" preventCloseOnClickOutside>
      <ModalHeader label={`Relatório completo${versaoTela ? ` · versão ${versaoTela}` : ''}`}
        title={titulo || 'Relatório de Crédito'} closeModal={onFechar} iconDescription="Fechar">
        <a className="rel-modal__abrir" href={enderecoRelatorio(relatorioId, versaoTela)} target="_blank" rel="noreferrer">
          Abrir em nova aba <Launch size={14} />
        </a>
      </ModalHeader>
      <ModalBody className="rel-modal__corpo">
        {semAncora && (
          <InlineNotification kind="info" lowContrast hideCloseButton className="rel-modal__aviso"
            title="Posição não encontrada"
            subtitle="Este relatório foi gerado antes das âncoras de navegação: ele abre no início." />
        )}
        {concluida && (
          <InlineNotification kind={concluida.mudou ? 'warning' : 'success'} lowContrast className="rel-modal__aviso"
            onClose={() => setConcluida(null)}
            title={concluida.mudou ? `Carregada a versão ${concluida.versao}, a mais nova` : `Versão ${concluida.versao}`}
            subtitle={concluida.mudou
              ? 'O relatório tinha mudado: confira o trecho e peça a alteração de novo, se ainda for preciso.'
              : `Alteração aplicada${concluida.rotulo ? ` em ${concluida.rotulo}` : ''}. O trecho alterado está destacado.`} />
        )}
        {!carregado && <Loading withOverlay={false} small description="Carregando o relatório" />}
        <div className="rel-modal__palco">
          {aberto && (
            <iframe
              key={versaoTela || 'atual'}
              ref={quadro}
              title="Relatório completo"
              className="rel-modal__quadro"
              // Sem allow-scripts: o relatório não roda código nenhum. allow-same-origin mantém a rolagem até a
              // âncora e deixa a tela pôr os botões de edição.
              sandbox="allow-same-origin"
              src={enderecoHtml(relatorioId, versaoTela)}
              onLoad={() => setCarregado(true)}
            />
          )}
          {edicao && (
            <EdicaoTrecho
              key={`${edicao.ancora}-${versaoTela}`}
              relatorioId={relatorioId}
              versao={versaoTela}
              referencia={edicao}
              onFechar={() => setEdicao(null)}
              onVersaoNova={versaoGerada}
              onVersaoMudou={irParaMaisNova}
            />
          )}
        </div>
      </ModalBody>
    </ComposedModal>
  )
}

export default RelatorioCompleto
