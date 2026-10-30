import { useCallback, useEffect, useRef, useState } from 'react'
import { ComposedModal, InlineLoading, InlineNotification, ModalBody, ModalHeader } from '@carbon/react'
import { Chat, DocumentPdf, Launch } from '@carbon/icons-react'
import { enderecoHtml, enderecoRelatorio, versaoPublicada } from '../../services/resumosApi'
import { AVISO_LIGANDO_PDF, rotuloGerandoPdf, useBaixarPdf } from '../../hooks/useBaixarPdf'
import EdicaoTrecho from './EdicaoTrecho.jsx'
import { useVisualizadorDeFontes } from './FontesDoDocumento.jsx'
import { PainelDocumento } from './VisualizadorDocumento.jsx'
import { PREFIXO_EDICAO, referenciaDoTrecho, textoVisivel } from './edicaoTrecho'
import './RelatorioCompleto.scss'
import Carregando from '../Comum/Carregando.jsx'

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
//
// Fontes (28/10/2026): cada linha "Fonte:" do relatório é um link (a.azq-fonte) com o arquivo, a página e a aba/linha
// citados. Fora da tela, o link abre a tela já no documento; aqui, a tela troca o destino por #azq-fonte=<n>, lê o
// hash como no Editar e abre o documento por cima do relatório, com "Voltar". As fontes ficam fora do trecho editado.

// Edição no relatório (28/10/2026, revisto com o Kimi): o trecho sob o mouse (ou com o foco) ganha um realce discreto
// e um lápis na margem direita, fora do texto; nos títulos, o lápis fica dentro da barra e mostra "Pedir alteração na
// seção" ao passar o mouse. O trecho com a janela de edição aberta fica marcado até ela fechar. O realce é um fundo
// claro com halo, sem fio na lateral (30/10/2026), sem pseudo-elemento (os itens de lista usam ::before no marcador)
// e sem deslocar o texto. Nada disso imprime, e o PDF sai do HTML original, sem esta injeção.
const ESTILO_EDICAO = `
.azq-editavel { position: relative; border-radius: 2px; transition: background-color .12s, box-shadow .12s; }
.azq-editavel:not(.section-heading):not(.annex-heading):not(.sub-heading):hover,
.azq-editavel:not(.section-heading):not(.annex-heading):not(.sub-heading):focus-within {
  background: rgba(1,134,239,.05);
  box-shadow: 0 0 0 4px rgba(1,134,239,.05);
}
.azq-editavel.azq-editando:not(.section-heading):not(.annex-heading):not(.sub-heading) {
  background: rgba(1,134,239,.09);
  box-shadow: 0 0 0 4px rgba(1,134,239,.09);
}
.azq-editar {
  position: absolute; top: -5px; right: -31px; z-index: 5;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  width: 28px; height: 28px; padding: 0; border-radius: 4px;
  color: #525252 !important; text-decoration: none !important;
  font: 500 12px/16px 'IBM Plex Sans', -apple-system, 'Segoe UI', Arial, sans-serif;
  letter-spacing: .16px; text-transform: none; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity .12s, background-color .12s, color .12s;
}
.azq-editar svg { width: 16px; height: 16px; flex: none; fill: currentColor; }
.azq-editavel:hover > .azq-editar, .azq-editavel.azq-editando > .azq-editar, .azq-editavel.azq-saindo > .azq-editar,
.azq-editar:focus-visible {
  opacity: 1; pointer-events: auto;
}
.azq-editar:hover { background: rgba(1,134,239,.12); color: #0186ef !important; }
.azq-editar.azq-editar--dentro { top: -2px; right: 2px; background: #fff; box-shadow: 0 1px 3px rgba(2,25,38,.25); }
.azq-editar.azq-editar--dentro:hover { background: #e5f0fb; }
.azq-editar:focus-visible { outline: 2px solid #0f62fe; outline-offset: 1px; }
.azq-editar__texto { display: none; }
.section-heading > .azq-editar, .annex-heading > .azq-editar, .sub-heading > .azq-editar {
  top: 50%; right: 10px; width: auto; min-width: 28px; height: 24px; padding: 0 6px; transform: translateY(-50%);
}
.section-heading > .azq-editar, .annex-heading > .azq-editar { color: rgba(255,255,255,.85) !important; }
.section-heading > .azq-editar:hover, .annex-heading > .azq-editar:hover,
.section-heading > .azq-editar:focus-visible, .annex-heading > .azq-editar:focus-visible {
  background: rgba(255,255,255,.16); color: #fff !important;
}
.sub-heading > .azq-editar { color: #0186ef !important; }
.section-heading > .azq-editar:hover .azq-editar__texto, .annex-heading > .azq-editar:hover .azq-editar__texto,
.sub-heading > .azq-editar:hover .azq-editar__texto, .azq-editar:focus-visible .azq-editar__texto { display: inline; }
@media (prefers-reduced-motion: reduce) { .azq-editavel, .azq-editar { transition: none; } }
@media print {
  .azq-editar { display: none !important; }
  .azq-editavel { background: none !important; box-shadow: none !important; }
}
`

const PREFIXO_FONTE = 'azq-fonte='

// Links de fonte do relatório: o destino vira o fragmento lido pela tela (o iframe não navega) e os dados de cada
// link ficam na lista, na ordem.
function porLinksDeFonte(doc) {
  const links = [...(doc?.querySelectorAll('a.azq-fonte[data-arquivo]') || [])]
  links.forEach((a, n) => {
    a.setAttribute('href', `#${PREFIXO_FONTE}${n}`)
    a.removeAttribute('target')
    a.title = 'Abrir o documento citado'
  })
  return links.map(a => ({ ...a.dataset }))
}

// Fontes do trecho que vai ser editado: os links das linhas "Fonte:" do bloco e das que vêm logo depois dele, até a
// âncora seguinte. A janela de edição as mostra para o analista conferir o original enquanto pede a alteração; a
// mensagem ao agente não muda (ela leva o texto-fonte do bloco, com as citações).
function fontesDoTrecho(doc, id) {
  const fontes = []
  let elemento = doc.getElementById(id)?.nextElementSibling
  for (let n = 0; elemento && !elemento.classList.contains('ancora') && n < 12; n += 1) {
    elemento.querySelectorAll('a.azq-fonte[data-arquivo]').forEach(a => {
      const texto = (a.textContent || '').replace(/\s+/g, ' ').trim()
      if (!fontes.some(f => f.texto === texto)) fontes.push({ ...a.dataset, texto })
    })
    elemento = elemento.nextElementSibling
  }
  return fontes
}

// Blocos que ganham botão: todo item com âncora, menos tabela, gráfico e imagem (vêm prontos dos documentos e não se
// editam por texto), e todo título de seção e subseção.
const SEM_EDICAO = /^item-(?:tabela|grafico|imagem)-/

// Lápis (ícone Edit do Carbon), criado no documento do relatório: o iframe não carrega nada de fora.
function lapis(doc) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 32 32')
  svg.setAttribute('aria-hidden', 'true')
  const caminho = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  caminho.setAttribute('d', 'M2 26h28v2H2zM25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 '
    + '7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10 3.6 3.6-10 10H6z')
  svg.appendChild(caminho)
  return svg
}

// Se o lápis cabe na margem à direita do trecho. Dentro de uma caixa (quadro do sumário, observações) não cabe: ele
// passaria da borda e a caixa rolaria para o lado; aí fica dentro do canto do trecho.
function cabeNaMargem(alvo) {
  const janela = alvo.ownerDocument.defaultView
  const direita = alvo.getBoundingClientRect().right + 31
  for (let el = alvo.parentElement; el && el !== alvo.ownerDocument.body; el = el.parentElement) {
    const estilo = janela.getComputedStyle(el)
    const borda = parseFloat(estilo.borderRightWidth) || 0
    if (estilo.overflowX !== 'visible' || borda > 0) return direita <= el.getBoundingClientRect().right - borda
  }
  return true
}

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
    botao.appendChild(lapis(doc))
    const texto = doc.createElement('span')
    texto.className = 'azq-editar__texto'
    texto.textContent = secao ? 'Pedir alteração na seção' : 'Pedir alteração'
    botao.appendChild(texto)
    const inicio = textoVisivel(alvo).slice(0, 60)
    botao.title = secao ? 'Pedir ao agente uma alteração nesta seção' : 'Pedir ao agente uma alteração neste trecho'
    botao.setAttribute('aria-label', `${botao.title}${inicio ? `: ${inicio}` : ''}`)
    if (!secao && !cabeNaMargem(alvo)) botao.classList.add('azq-editar--dentro')
    alvo.appendChild(botao)
    // O lápis fica no alto, na margem: quem sai do meio de uma imagem alta em direção a ele passa fora do trecho
    // antes de chegar, e ele sumia (30/10/2026). Ao sair, ele continua visível e clicável por meio segundo.
    let saida = null
    alvo.addEventListener('mouseleave', () => {
      alvo.classList.add('azq-saindo')
      clearTimeout(saida)
      saida = setTimeout(() => alvo.classList.remove('azq-saindo'), 500)
    })
    alvo.addEventListener('mouseenter', () => { clearTimeout(saida); alvo.classList.remove('azq-saindo') })
  })
}

function RelatorioCompleto({
  aberto, onFechar, relatorioId, versao, titulo, ancora, itens, indice, versaoResumo, onVersaoNova, onConversar,
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
  const pdf = useBaixarPdf()
  const fontes = useVisualizadorDeFontes()
  const linksDeFonte = useRef([])
  const { fechar: fecharFonte, valor: { abrir: abrirFonte } } = fontes

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
      fecharFonte()
    }
    setSemAncora(false)
    setFoco(null) // "Ver no relatório" depois de uma edição volta a valer a âncora pedida
  }, [aberto, relatorioId, ancora, fecharFonte])

  useEffect(() => { setCarregado(false) }, [versaoTela])

  // Links de fonte em cada carga do HTML, e o clique lido do hash do iframe (vale também sem versão conhecida).
  useEffect(() => {
    if (!aberto || !carregado) return undefined
    linksDeFonte.current = porLinksDeFonte(quadro.current?.contentWindow?.document)
    const relogio = setInterval(() => {
      const atual = quadro.current?.contentWindow
      const hash = decodeURIComponent(atual?.location.hash || '')
      if (!hash.startsWith(`#${PREFIXO_FONTE}`)) return
      const dados = linksDeFonte.current[Number(hash.slice(1 + PREFIXO_FONTE.length))]
      // Tira o fragmento sem rolar a página, para o mesmo link poder ser clicado de novo.
      try {
        atual.history.replaceState(null, '', atual.location.pathname + atual.location.search)
      } catch {
        atual.location.hash = ''
      }
      if (dados) abrirFonte(dados)
    }, 250)
    return () => clearInterval(relogio)
  }, [aberto, carregado, abrirFonte])

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
    setEdicao({
      ...referenciaDoTrecho({
        ancora: id, itens, indice, textoNaTela: textoVisivel(bloco),
        resumoDaVersaoNaTela: Boolean(versaoTela) && versaoResumo === versaoTela,
      }),
      fontes: id.startsWith('item-') ? fontesDoTrecho(doc, id) : [],
    })
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

  useEffect(() => {
    const doc = quadro.current?.contentWindow?.document
    if (!carregado || !doc) return
    doc.querySelectorAll('.azq-editando').forEach(e => e.classList.remove('azq-editando'))
    if (edicao?.ancora) doc.getElementById(edicao.ancora)?.nextElementSibling?.classList.add('azq-editando')
  }, [carregado, edicao])

  function fecharEdicao() {
    const ancora = edicao?.ancora
    setEdicao(null)
    const doc = quadro.current?.contentWindow?.document
    doc?.getElementById(ancora)?.nextElementSibling?.querySelector?.('.azq-editar')?.focus()
  }

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
        <button type="button" className="rel-modal__abrir rel-modal__conversar" disabled={pdf.gerando !== null}
          onClick={() => pdf.baixar(relatorioId, versaoTela)}>
          {pdf.gerando === null ? 'Baixar PDF' : rotuloGerandoPdf(pdf.gerando)}
          {pdf.gerando === null ? <DocumentPdf size={14} /> : <InlineLoading className="rel-modal__carregando" />}
        </button>
        {/* Conversa dedicada a este relatório: cada pedido no chat vira uma versão nova dele, com a miniatura ao lado. */}
        {onConversar && (
          <button type="button" className="rel-modal__abrir rel-modal__conversar"
            onClick={() => { onFechar(); onConversar(relatorioId) }}>
            Conversar no chat sobre este relatório <Chat size={14} />
          </button>
        )}
      </ModalHeader>
      <ModalBody className="rel-modal__corpo">
        {versaoTela && (
          <p className="rel-modal__dica">
            Passe o mouse num trecho e use o lápis para pedir uma alteração ao agente. As linhas de fonte abrem o documento
            citado.
          </p>
        )}
        {pdf.ligando && (
          <InlineNotification kind="info" lowContrast hideCloseButton className="rel-modal__aviso"
            title="Gerando o PDF" subtitle={AVISO_LIGANDO_PDF} />
        )}
        {pdf.erro && (
          <InlineNotification kind="error" lowContrast className="rel-modal__aviso" title="O PDF não foi gerado"
            subtitle={pdf.erro} onClose={pdf.limparErro} />
        )}
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
        <div className="rel-modal__palco">
          {aberto && !carregado && <Carregando sobreposto descricao="Abrindo o relatório" />}
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
          {fontes.aberto && <PainelDocumento documento={fontes.aberto} onFechar={fontes.fechar} />}
          {edicao && (
            <EdicaoTrecho
              key={`${edicao.ancora}-${versaoTela}`}
              relatorioId={relatorioId}
              versao={versaoTela}
              referencia={edicao}
              onFechar={fecharEdicao}
              onVersaoNova={versaoGerada}
              onVersaoMudou={irParaMaisNova}
              onAbrirFonte={abrirFonte}
              onConversar={onConversar && (() => { onFechar(); onConversar(relatorioId) })}
            />
          )}
        </div>
      </ModalBody>
    </ComposedModal>
  )
}

export default RelatorioCompleto
