import { Button } from '@carbon/react'
import { ArrowRight, Document, Launch } from '@carbon/icons-react'

// Renderiza o texto do agente.
//
// O agente responde em markdown — medido em 16/10/2026: parágrafos, listas
// com "- ", negrito, link e **tabela**. A tabela entrou depois: a primeira
// versão deste módulo afirmava que ele não mandava nenhuma, e então um pedido
// de notícias voltou com um quadro de quatro colunas, que apareceu na tela
// como linhas de texto cheias de barras verticais. Este módulo cobre o que
// ele manda de fato; o que não reconhece sai como texto, que é o pior caso
// aceitável.
//
// **Por que não `dangerouslySetInnerHTML` nem uma biblioteca de markdown.**
// O texto vem de um modelo de linguagem passando por tools que leem
// documentos de terceiros. Injetar isso como HTML seria confiar nessa cadeia
// com a sessão de quem está logado. Aqui o texto nunca vira HTML: vira nós do
// React, e um `<script>` que o agente escrevesse apareceria como as letras
// que ele é. A biblioteca resolveria mais casos do que existem e traria
// sanitização para manter — 30 linhas honestas valem mais.

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
const NEGRITO = /\*\*([^*]+)\*\*/g

// O relatório é publicado como HTML no Cloud Object Storage, com URL assinada
// que vale 7 dias. É o que distingue o link do relatório de um link qualquer
// que o agente de busca web possa citar.
function eRelatorio(url) {
  return /cloud-object-storage|\/relatorios\//.test(url)
}

function comNegrito(texto, chave) {
  const pedacos = []
  let fim = 0
  for (const achado of texto.matchAll(NEGRITO)) {
    if (achado.index > fim) pedacos.push(texto.slice(fim, achado.index))
    pedacos.push(<strong key={`${chave}-b${achado.index}`}>{achado[1]}</strong>)
    fim = achado.index + achado[0].length
  }
  if (fim < texto.length) pedacos.push(texto.slice(fim))
  return pedacos
}

function comLinks(texto, chave) {
  const pedacos = []
  let fim = 0
  for (const achado of texto.matchAll(LINK)) {
    if (achado.index > fim) {
      pedacos.push(...comNegrito(texto.slice(fim, achado.index), `${chave}-${fim}`))
    }
    pedacos.push(
      <a
        key={`${chave}-l${achado.index}`}
        href={achado[2]}
        target="_blank"
        // `noopener` é o que impede a página aberta de mexer nesta pela
        // `window.opener`. O destino é uma URL que o agente escolheu.
        rel="noopener noreferrer"
        className="chat-msg__link"
      >
        {achado[1]}
        <Launch size={14} />
      </a>,
    )
    fim = achado.index + achado[0].length
  }
  if (fim < texto.length) pedacos.push(...comNegrito(texto.slice(fim), `${chave}-${fim}`))
  return pedacos
}

// Uma linha de tabela markdown: "| a | b |". A linha separadora, feita de
// hífens e dois-pontos, não é dado — é a que diz onde acaba o cabeçalho.
const LINHA_TABELA = /^\|(.+)\|$/
const SEPARADOR = /^\|[\s:|-]+\|$/

function celulas(linha) {
  return linha.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

function Tabela({ linhas, chave }) {
  const cabecalho = celulas(linhas[0])
  const corpo = linhas.slice(1).filter(l => !SEPARADOR.test(l)).map(celulas)
  return (
    // O embrulho rola na horizontal: o painel central tem 46rem e um quadro
    // de quatro colunas com texto não cabe. Sem ele, a tabela esticaria a
    // conversa inteira e empurraria o composer para fora da tela.
    <div className="chat-msg__tabela-rolagem" key={chave}>
      <table className="chat-msg__tabela">
        <thead>
          <tr>{cabecalho.map((c, i) => <th key={i}>{comLinks(c, `${chave}-h${i}`)}</th>)}</tr>
        </thead>
        <tbody>
          {corpo.map((linha, i) => (
            <tr key={i}>
              {linha.map((c, j) => <td key={j}>{comLinks(c, `${chave}-${i}-${j}`)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Blocos({ texto }) {
  // Linha em branco separa parágrafo; linhas com "- " viram uma lista; linhas
  // com "|" viram tabela. O agrupamento é feito à mão porque uma lista pode
  // vir no meio de um parágrafo, como na resposta que ele deu à pergunta
  // sobre o que aceita, e porque a tabela não é anunciada — ela só começa.
  const linhas = texto.split('\n')
  const blocos = []
  let lista = []
  let paragrafo = []
  let tabela = []

  const fecharLista = () => {
    if (!lista.length) return
    blocos.push(
      <ul key={`ul-${blocos.length}`} className="chat-msg__lista">
        {lista.map((item, i) => (
          <li key={i}>{comLinks(item, `li-${blocos.length}-${i}`)}</li>
        ))}
      </ul>,
    )
    lista = []
  }

  const fecharTabela = () => {
    if (!tabela.length) return
    blocos.push(<Tabela key={`t-${blocos.length}`} linhas={tabela} chave={`t${blocos.length}`} />)
    tabela = []
  }

  const fecharParagrafo = () => {
    if (!paragrafo.length) return
    const conteudo = paragrafo.join(' ')
    blocos.push(<p key={`p-${blocos.length}`}>{comLinks(conteudo, `p-${blocos.length}`)}</p>)
    paragrafo = []
  }

  for (const bruta of linhas) {
    const linha = bruta.trim()
    if (!linha) {
      fecharLista()
      fecharTabela()
      fecharParagrafo()
    } else if (LINHA_TABELA.test(linha)) {
      fecharLista()
      fecharParagrafo()
      tabela.push(linha)
    } else if (/^[-*•]\s+/.test(linha)) {
      fecharParagrafo()
      fecharTabela()
      lista.push(linha.replace(/^[-*•]\s+/, ''))
    } else {
      fecharLista()
      fecharTabela()
      paragrafo.push(linha)
    }
  }
  fecharLista()
  fecharTabela()
  fecharParagrafo()

  return blocos
}

// O cartão do relatório.
//
// O agente é instruído a nunca escrever o relatório no chat: ele devolve o
// link. A tela aproveita isso em vez de contrariar — o relatório inteiro vive
// na aba Análise de Crédito, com evidência por item e revisão, e o chat é a
// porta. Dois caminhos, porque são coisas diferentes: o HTML publicado é o
// documento como o agente o montou; a aba é onde ele é revisado e aprovado.
function CartaoRelatorio({ url, onTrocarAba }) {
  return (
    <div className="chat-msg__relatorio">
      <div className="chat-msg__relatorio-cabeca">
        <Document size={16} />
        <span>Relatório disponível</span>
      </div>
      <div className="chat-msg__relatorio-acoes">
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Launch}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir o documento
        </Button>
        {onTrocarAba && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowRight}
            onClick={() => onTrocarAba('analise')}
          >
            Revisar na aba Análise de Crédito
          </Button>
        )}
      </div>
    </div>
  )
}

function RespostaDoAgente({ texto, onTrocarAba }) {
  if (!texto) return null
  const relatorio = [...texto.matchAll(LINK)].find(a => eRelatorio(a[2]))
  return (
    <>
      <Blocos texto={texto} />
      {relatorio && <CartaoRelatorio url={relatorio[2]} onTrocarAba={onTrocarAba} />}
    </>
  )
}

export default RespostaDoAgente
