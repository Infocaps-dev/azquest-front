import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ComposedModal, InlineLoading, InlineNotification, ModalBody, ModalHeader } from '@carbon/react'
import { ArrowLeft } from '@carbon/icons-react'

// Documento de uma referência aberto na própria tela, sem baixar o arquivo: o PDF na página citada; a planilha lida
// no navegador, na aba citada, com as linhas citadas destacadas. Antes o "Abrir" de uma planilha baixava o .xlsx.

const ehPlanilha = arquivo => /\.xlsx?$/i.test(arquivo || '')

// 'aba "Balanço Patrimonial", linha 7' -> { aba: 'Balanço Patrimonial', linha: 7 }
function linhasCitadas(linhas = []) {
  const porAba = new Map()
  for (const texto of linhas) {
    const m = /aba "([^"]+)"(?:, linha (\d+))?/.exec(texto)
    if (!m) continue
    if (!porAba.has(m[1])) porAba.set(m[1], new Set())
    if (m[2]) porAba.get(m[1]).add(Number(m[2]))
  }
  return porAba
}

const semEspacos = texto => (texto || '').trim().toLowerCase()

function celula(valor) {
  if (valor == null) return ''
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (valor instanceof Date) return valor.toLocaleDateString('pt-BR')
  return String(valor)
}

function Planilha({ link, linhas }) {
  const [abas, setAbas] = useState(null)
  const [erro, setErro] = useState(null)
  const citadas = useMemo(() => linhasCitadas(linhas), [linhas])
  const [abaAtual, setAbaAtual] = useState(null)
  const destaque = useRef(null)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const resposta = await fetch(link, { credentials: 'same-origin' })
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
        const { default: lerPlanilha } = await import('read-excel-file/browser')
        const lidas = await lerPlanilha(await resposta.blob())
        if (!ativo) return
        setAbas(lidas)
        const primeira = lidas.find(a => [...citadas.keys()].some(c => semEspacos(c) === semEspacos(a.sheet))) || lidas[0]
        setAbaAtual(primeira?.sheet || null)
      } catch (e) {
        if (ativo) setErro(e.message || 'não foi possível ler a planilha')
      }
    })()
    return () => { ativo = false }
  }, [link, citadas])

  useEffect(() => { destaque.current?.scrollIntoView({ block: 'center' }) }, [abaAtual, abas])

  if (erro) return <InlineNotification kind="error" lowContrast hideCloseButton title="Planilha" subtitle={erro} />
  if (!abas) return <InlineLoading description="Lendo a planilha…" />

  const aba = abas.find(a => a.sheet === abaAtual)
  const marcadas = [...citadas.entries()].find(([nome]) => semEspacos(nome) === semEspacos(abaAtual))?.[1] || new Set()
  const primeiraMarcada = Math.min(...marcadas)
  return (
    <div className="ana-planilha">
      <div className="ana-planilha__abas" role="tablist">
        {abas.map(a => {
          const citada = [...citadas.keys()].some(c => semEspacos(c) === semEspacos(a.sheet))
          return (
            <button key={a.sheet} type="button" role="tab" aria-selected={a.sheet === abaAtual}
              className={`ana-planilha__aba${a.sheet === abaAtual ? ' ana-planilha__aba--atual' : ''}${citada ? ' ana-planilha__aba--citada' : ''}`}
              onClick={() => setAbaAtual(a.sheet)}>
              {a.sheet}
            </button>
          )
        })}
      </div>
      <div className="ana-planilha__grade">
        <table>
          <tbody>
            {(aba?.data || []).map((linha, i) => {
              const numero = i + 1
              const marcada = marcadas.has(numero)
              return (
                <tr key={numero} ref={numero === primeiraMarcada ? destaque : null}
                  className={marcada ? 'ana-planilha__linha--citada' : ''}>
                  <th scope="row">{numero}</th>
                  {linha.map((v, j) => <td key={j}>{celula(v)}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// O documento em si (PDF ou planilha), sem a janela: serve à janela abaixo e ao painel que abre por cima do relatório
// completo, onde uma segunda janela ficaria presa atrás da primeira.
export function ConteudoDocumento({ documento }) {
  const { arquivo, link, paginas = [], linhas = [] } = documento
  if (link === undefined) return <InlineLoading description="Procurando o documento no acervo…" />
  if (!link) {
    return (
      <InlineNotification kind="warning" lowContrast hideCloseButton title="Documento fora do acervo"
        subtitle={`${arquivo} não está na aba Documentos (pode ter sido renomeado ou removido).`} />
    )
  }
  return ehPlanilha(arquivo)
    ? <Planilha link={link} linhas={linhas} />
    : <iframe className="ana-visualizador__pdf" title={arquivo} src={`${link}${paginas[0] ? `#page=${paginas[0]}` : ''}`} />
}

// "p. 12" ou 'aba "DRE", linha 13': onde o documento abre.
export function localDoDocumento({ paginas = [], linhas = [] } = {}) {
  return [paginas.length ? `p. ${paginas.join(', ')}` : '', ...linhas].filter(Boolean).join('; ')
}

// Dentro de uma janela (painel de revisão, relatório completo): o documento cobre a janela, com "Voltar" para ela.
export function PainelDocumento({ documento, onFechar }) {
  const local = localDoDocumento(documento)
  return (
    <section className="ana-doc-painel" aria-label={`Documento ${documento.arquivo}`}
      onKeyDown={evento => {
        if (evento.key !== 'Escape') return
        evento.stopPropagation() // Esc fecha o documento, não a janela de baixo
        onFechar()
      }}>
      <header className="ana-doc-painel__topo">
        <div>
          <p className="ana-doc-painel__rotulo">{local ? `Referência · ${local}` : 'Referência'}</p>
          <h3 className="ana-doc-painel__titulo">{documento.arquivo}</h3>
        </div>
        <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={onFechar} autoFocus>Voltar</Button>
      </header>
      <div className="ana-doc-painel__corpo">
        <ConteudoDocumento documento={documento} />
      </div>
    </section>
  )
}

function VisualizadorDocumento({ documento, onFechar }) {
  if (!documento) return null
  const local = localDoDocumento(documento)
  return (
    <ComposedModal open onClose={onFechar} size="lg" className="ana-visualizador">
      <ModalHeader label={local ? `Referência · ${local}` : 'Referência'} title={documento.arquivo} closeModal={onFechar}
        iconDescription="Fechar" />
      <ModalBody>
        <ConteudoDocumento documento={documento} />
      </ModalBody>
    </ComposedModal>
  )
}

export default VisualizadorDocumento
