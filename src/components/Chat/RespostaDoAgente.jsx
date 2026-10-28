import { createContext, lazy, Suspense, useContext } from 'react'
import { Button, InlineLoading } from '@carbon/react'
import { ArrowRight, Document, Launch } from '@carbon/icons-react'
import { graficoDaUrl } from '../../services/resumosApi'
import InserirNoRelatorio from './InserirNoRelatorio.jsx'
import './GraficoInterativo.scss'

// O Carbon Charts (d3 junto) só é baixado quando uma resposta traz gráfico.
const GraficoInterativo = lazy(() => import('./GraficoInterativo.jsx'))

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

// O "!" opcional é o da imagem markdown no meio de um parágrafo: vira link, sem sobrar o "!" na tela.
const LINK = /!?\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
// Imagem markdown sozinha na linha: o agente de EBITDA responde assim com o gráfico.
const IMAGEM = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/
// Imagens que a tela mostra: só as do nosso bucket (gráficos do EBITDA, públicos). Imagem de outro endereço vira
// link: carregar uma URL qualquer que o modelo escreveu entregaria a visita de quem está logado a terceiros.
const IMAGEM_NOSSA = /^https:\/\/s3\.br-sao\.cloud-object-storage\.appdomain\.cloud\/ecovias-itr-docs\/ebitda\//
const NEGRITO = /\*\*([^*]+)\*\*/g
// Erro da plataforma que o Orchestrate grava como resposta: numa conversa reaberta ele volta do histórico, em inglês.
const ERRO_DA_PLATAFORMA = /^\s*I have encountered an error\. Please try again\.\s*$/i
const ERRO_TRADUZIDO = 'O Orchestrate teve uma falha técnica nesta resposta. Pergunte de novo, ou confira a aba Análise '
  + 'de Crédito se o pedido era de relatório.'

// O relatório é publicado como HTML no Cloud Object Storage, com URL assinada
// que vale 7 dias. É o que distingue o link do relatório de um link qualquer
// que o agente de busca web possa citar.
// As imagens dos gráficos do EBITDA estão no mesmo bucket e não são relatório.
function eRelatorio(url) {
  return /cloud-object-storage|\/relatorios\//.test(url) && !IMAGEM_NOSSA.test(url)
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

// Envio de mensagem do chat (onEnviar do ChatMain): com ele, gráficos e notícias ganham o botão "Inserir no
// relatório". Fora do chat (a janela de edição do relatório), não há botão.
const EnvioDoChat = createContext(null)

// Link externo numa resposta: pode ser uma notícia salva da busca. O botão confere na hora (resumos-api) e avisa
// quando o link não está entre as consultas salvas.
function InserirNoticia({ link }) {
  const onEnviar = useContext(EnvioDoChat)
  if (!onEnviar || IMAGEM_NOSSA.test(link) || eRelatorio(link)) return null
  return <InserirNoRelatorio link={link} onEnviar={onEnviar} compacto />
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
      <InserirNoticia key={`${chave}-i${achado.index}`} link={achado[2]} />,
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

function Imagem({ titulo, url }) {
  const onEnviar = useContext(EnvioDoChat)
  const grafico = graficoDaUrl(url)
  if (grafico) {
    return (
      <Suspense fallback={<InlineLoading description="Carregando o gráfico" />}>
        <GraficoInterativo grafico={grafico} url={url} titulo={titulo} onEnviar={onEnviar} />
      </Suspense>
    )
  }
  if (IMAGEM_NOSSA.test(url)) {
    return <figure className="chat-grafico"><img className="chat-grafico__imagem" src={url} alt={titulo} /></figure>
  }
  return <p>{comLinks(`[${titulo || url}](${url})`, `img-${url}`)}</p>
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
  // Bloco de código (```): sai como <pre>, com o conteúdo como texto, nunca
  // como HTML. `codigo` é null fora de um bloco e a lista de linhas dentro.
  let codigo = null

  const blocoDeCodigo = conteudo => {
    blocos.push(
      <pre key={`c-${blocos.length}`} className="chat-msg__codigo"><code>{conteudo}</code></pre>,
    )
  }

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
    if (codigo !== null) {
      // Dentro do bloco as linhas valem como estão, inclusive as vazias.
      if (linha.startsWith('```')) {
        blocoDeCodigo(codigo.join('\n'))
        codigo = null
      } else {
        codigo.push(bruta)
      }
      continue
    }
    if (linha.startsWith('```')) {
      fecharLista()
      fecharTabela()
      fecharParagrafo()
      // "``` texto ```" numa linha só é um bloco inteiro.
      const naLinha = linha.slice(3).replace(/^[a-z]*\s/i, '')
      if (naLinha.endsWith('```') && naLinha.length > 3) blocoDeCodigo(naLinha.slice(0, -3).trim())
      else codigo = []
      continue
    }
    const imagem = IMAGEM.exec(linha)
    if (!linha) {
      fecharLista()
      fecharTabela()
      fecharParagrafo()
    } else if (imagem) {
      fecharLista()
      fecharTabela()
      fecharParagrafo()
      blocos.push(<Imagem key={`img-${blocos.length}`} titulo={imagem[1]} url={imagem[2]} />)
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
  if (codigo !== null) blocoDeCodigo(codigo.join('\n')) // bloco que a resposta não fechou

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

// As fontes dos números da resposta, tiradas do que as ferramentas devolveram (28/10/2026): ficam fora do texto do
// modelo, que não recebe frase colada. Vêm no fim do turno e no histórico.
function FontesDaResposta({ fontes }) {
  if (!fontes?.length) return null
  return (
    <div className="chat-msg__fontes">
      <p className="chat-msg__fontes-titulo">Fontes</p>
      <ul className="chat-msg__fontes-lista">
        {fontes.map(f => <li key={f}>{f}</li>)}
      </ul>
    </div>
  )
}

// A linha "Fontes:" que o prompt pede no fim da resposta (28/10/2026): sai do texto e vai para o componente, no
// padrão visual das fontes. As citações vêm separadas por ";".
// Também a "Fonte: ..." no fim da última frase, na mesma linha (o modelo a escreve assim): só sai se confirmada.
const LINHA_FONTES = /(?:\n+|[ \t]+)\(?[ \t]*[*_]*Fontes?[*_]*[ \t]*:[*_]*[ \t]*([^\n]+?)\)?\s*$/i

function separarFontes(texto) {
  const m = LINHA_FONTES.exec(texto)
  if (!m) return { texto, declaradas: [] }
  const declaradas = m[1].split(';').map(f => f.replace(/[*_]/g, '').trim().replace(/\.$/, '')).filter(Boolean)
  return { texto: texto.slice(0, m.index).trim(), declaradas }
}

// Resposta retida pela conferência (nota de uma emissão, ou de outra empresa do grupo, dita como rating da empresa,
// e a correção não resolveu): a tela mostra o rating como está no documento, montado dos dados da ferramenta.
function CartaoRating({ ratings }) {
  return (
    <div className="chat-msg__retida">
      <p className="chat-msg__retida-aviso">A conferência reteve a resposta do agente. O rating, como está no documento:</p>
      {ratings.map(r => (
        <dl key={`${r.agencia}-${r.nota}-${r.emissao}`} className="chat-msg__rating">
          <dt>Agência</dt><dd>{r.agencia}</dd>
          <dt>Nota</dt><dd>{r.nota}</dd>
          {r.emissao && <><dt>Escopo</dt><dd>{r.emissao}</dd></>}
          {r.entidade_diferente_do_emissor && r.entidade && <><dt>Entidade</dt><dd>{r.entidade} (não é o emissor)</dd></>}
          {r.perspectiva && <><dt>Perspectiva</dt><dd>{r.perspectiva}</dd></>}
        </dl>
      ))}
      <FontesDaResposta fontes={ratings.flatMap(r => r.fontes || [])} />
    </div>
  )
}

function RespostaDoAgente({ texto, fontes, retida, ratings, onTrocarAba, onEnviar }) {
  if (retida && ratings?.length) return <CartaoRating ratings={ratings} />
  if (!texto) return null
  if (ERRO_DA_PLATAFORMA.test(texto)) texto = ERRO_TRADUZIDO
  // A linha só sai do texto quando todas as fontes dela estão entre as confirmadas pelos dados da ferramenta (as que a
  // analise-api manda): fonte que o modelo declarou e os dados não confirmam fica no texto, sem o destaque de fonte.
  texto = texto.replace(/\n+[ \t]*[*_]*Fontes?[*_]*[ \t]*:[*_]*\s*$/i, '').trim() // "Fontes:" sem nada depois
  const separado = separarFontes(texto)
  const confirmada = f => (fontes || []).some(x => x.startsWith(f) || f.startsWith(x))
  if (separado.declaradas.length && separado.declaradas.every(confirmada)) texto = separado.texto
  const relatorio = [...texto.matchAll(LINK)].find(a => eRelatorio(a[2]))
  // Com o cartão, a linha que só traz o link do relatório sai do texto: o mesmo link duas vezes, uma delas no meio
  // da narrativa do agente, parecia resposta com defeito (27/10/2026). Linha com mais conteúdo fica como está.
  if (relatorio) {
    texto = texto.split('\n')
      .filter(linha => !(linha.trim() && linha.replace(LINK, (m, rotulo, url) => (eRelatorio(url) ? '' : m)).trim() === ''))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }
  return (
    <>
      <EnvioDoChat.Provider value={onEnviar || null}>
        <Blocos texto={texto} />
      </EnvioDoChat.Provider>
      <FontesDaResposta fontes={fontes} />
      {relatorio && <CartaoRelatorio url={relatorio[2]} onTrocarAba={onTrocarAba} />}
    </>
  )
}

export default RespostaDoAgente
