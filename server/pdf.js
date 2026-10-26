// PDF do relatório de crédito: o HTML publicado pelo agente, com o CSS de impressão (pdf/pdf.css), a IBM Plex Sans
// embutida e um script de preparação, convertido no Chromium do Gotenberg (serviço próprio, privado no projeto do Code
// Engine). O HTML publicado não muda: tudo que é só do PDF entra aqui.
//
// Por que o Chromium (e não WeasyPrint): o layout do relatório é flex/grid e os gráficos são SVG; o motor da tela os
// imprime iguais, e desde o Chrome 131 ele faz cabeçalho e rodapé corridos com "Página X de Y" (@page com caixas de
// margem). O que ele ainda não faz: sumário com número de página e o nome da seção corrente no cabeçalho.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pdf')
const PESOS = [['Regular', 400, 'normal'], ['Italic', 400, 'italic'], ['Medium', 500, 'normal'],
  ['SemiBold', 600, 'normal'], ['Bold', 700, 'normal']]

const FONTES = PESOS.map(([arquivo, peso, estilo]) => `@font-face { font-family: "IBM Plex Sans"; font-weight: ${peso};
  font-style: ${estilo}; src: url(data:font/woff2;base64,${fs.readFileSync(path.join(PASTA, 'fontes', `IBMPlexSans-${arquivo}.woff2`)).toString('base64')}) format("woff2"); }`).join('\n')
const CSS = fs.readFileSync(path.join(PASTA, 'pdf.css'), 'utf8')

// Roda no Chromium antes da impressão, depois de o relatório carregar (o script entra no <head>, antes do corpo). O fim
// (window.pdfPronto) é o que o Gotenberg espera (waitForExpression).
const PREPARAR = `document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = 'pt-BR'
  // Títulos de seção viram h2/h3: o PDF ganha marcadores (outline) com a estrutura do relatório.
  const trocar = (seletor, tag) => document.querySelectorAll(seletor).forEach(el => {
    const novo = document.createElement(tag)
    for (const a of el.attributes) novo.setAttribute(a.name, a.value)
    novo.append(...el.childNodes)
    el.replaceWith(novo)
  })
  trocar('div.section-heading, div.annex-heading', 'h2')
  trocar('div.sub-heading', 'h3')
  // Cada parágrafo, figura, tabela ou item vai para a página junto das linhas de fonte logo abaixo dele.
  document.querySelectorAll('.fonte').forEach(fonte => {
    if (fonte.parentElement && fonte.parentElement.classList.contains('com-fonte')) return
    const alvo = fonte.previousElementSibling
    if (!alvo || alvo.classList.contains('fonte')) return
    const bloco = document.createElement('div')
    bloco.className = 'com-fonte'
    alvo.before(bloco)
    bloco.append(alvo)
    for (let f = bloco.nextElementSibling; f && f.classList.contains('fonte'); f = bloco.nextElementSibling) bloco.append(f)
  })
  // Com 10 colunas ou mais o cabeçalho da tabela se partia sílaba a sílaba em pé: ela vai para a página deitada.
  document.querySelectorAll('table.data-table').forEach(t => {
    if (((t.rows[0] && t.rows[0].cells.length) || 0) >= 10) t.classList.add('deitada')
  })
  // O texto das margens (cabeçalho e rodapé corridos) não faz o navegador baixar a fonte: cada peso é carregado aqui.
  Promise.all(['400', 'italic 400', '500', '600', '700'].map(p => document.fonts.load(p + ' 10pt "IBM Plex Sans"')))
    .then(() => document.fonts.ready)
    .finally(() => { window.pdfPronto = true })
})`

// Muda quando o desenho do PDF muda: entra no nome do PDF guardado, e a versão nova do desenho não reaproveita PDF velho.
export const DESENHO = crypto.createHash('sha256').update(FONTES).update(CSS).update(PREPARAR).digest('hex').slice(0, 8)

const literal = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

// O HTML do relatório pronto para imprimir. `referencia` vai no cabeçalho corrido; `gerado`, no rodapé.
export function htmlDoPdf(html, { referencia, gerado }) {
  const css = CSS.replaceAll('__REFERENCIA__', literal(referencia)).replaceAll('__GERADO__', literal(gerado))
  const extra = `<style>${FONTES}\n${css}</style><script>${PREPARAR}</script>`
  return html.includes('</head>') ? html.replace('</head>', `${extra}</head>`) : extra + html
}

// "Ecorodovias – 2º trimestre de 2026  ·  versão 3"
export function referenciaDoPdf({ empresa, referencia, versao }) {
  return [[empresa, referencia].filter(Boolean).join(' – '), versao ? `versão ${versao}` : ''].filter(Boolean).join('  ·  ')
}

export function agoraEmSaoPaulo() {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
    .format(new Date())
}

// Converte no Gotenberg (POST /forms/chromium/convert/html). Devolve o PDF (Buffer).
export async function converter(gotenbergUrl, html, { titulo = '', timeoutMs = 240000 } = {}) {
  const corpo = new FormData()
  corpo.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
  corpo.append('preferCssPageSize', 'true')
  corpo.append('printBackground', 'true')
  corpo.append('generateDocumentOutline', 'true')
  corpo.append('waitForExpression', 'window.pdfPronto === true')
  corpo.append('metadata', JSON.stringify({ Author: 'AZ Quest Investimentos', Subject: titulo }))
  const resposta = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
    method: 'POST', body: corpo, signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => '')).slice(0, 300)
    throw new Error(`Gotenberg respondeu HTTP ${resposta.status}: ${detalhe}`)
  }
  return Buffer.from(await resposta.arrayBuffer())
}
