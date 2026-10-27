import { useCallback, useEffect, useRef, useState } from 'react'
import { conversar, listarConversas, obterConversa } from '../services/chatApi'
import { enderecoRelatorio, estadoRelatorio, obterFontes, pedidosEmAndamento, relatoriosDesde } from '../services/resumosApi'

// Governa a conversa da tela de início com o Agente Analista de Crédito.
//
// Um turno acontece assim: a mensagem da pessoa entra na lista na hora, uma
// resposta vazia entra ao lado dela, e os trechos vão preenchendo essa
// resposta conforme chegam. O andamento ("Pensando no pedido") fica num campo
// à parte, não na lista: ele é substituível e não é parte da conversa.
//
// Sobre a espera, que é longa
// ---------------------------
// Medido em 16/10/2026: ~1,5s para uma pergunta simples, ~38s para gerar
// relatório, ~49s para uma pergunta que passa pelo agente de busca.
//
// E o pior: **o Orchestrate não transmite nada nos primeiros ~39 segundos.**
// Ele retém os avisos de andamento e despeja todos de uma vez, e só depois
// disso o stream é ao vivo. Então o aviso do agente não serve para preencher
// a espera — durante a espera ele não chega.
//
// Por isso duas coisas que não vêm do agente: um aviso inicial, posto no
// mesmo instante do envio, e o tempo decorrido, que avança de segundo em
// segundo. São a única evidência de vida que existe nesse intervalo, e sem
// elas a tela fica 40 segundos parada depois de a pessoa pedir um relatório.

const AVISO_INICIAL = 'Pedido enviado ao agente'

// Quanto esperar pela resposta gravada quando o stream termina sem ela: 0 s,
// depois 3 s, 5 s, 10 s... até ~3,5 min no total, o bastante para um pedido
// que ainda esteja rodando no Orchestrate.
const ESPERAS_HISTORICO = [0, 3000, 5000, 10000, 15000, 20000, 30000, 30000, 30000, 30000, 30000]

// A resposta do agente à `pergunta`, lida da conversa gravada no Orchestrate:
// a primeira mensagem do agente depois da última vez que a pergunta aparece.
// null se ela não aparecer no prazo.
async function respostaDoHistorico(threadId, pergunta, sinal) {
  const alvo = pergunta.trim()
  for (const ms of ESPERAS_HISTORICO) {
    if (ms) await new Promise(resolve => { setTimeout(resolve, ms) })
    if (sinal.aborted) return null
    try {
      const { mensagens } = await obterConversa(threadId)
      const i = mensagens.map(m => m.papel === 'usuario' && m.texto.trim() === alvo).lastIndexOf(true)
      const resposta = i >= 0 && mensagens.slice(i + 1).find(m => m.papel === 'agente' && m.texto.trim())
      if (resposta) return resposta.texto
    } catch {
      // A analise-api pode estar acordando: tenta de novo na próxima espera.
    }
  }
  return null
}

// Erro da plataforma: o Orchestrate devolve esta frase como se fosse a
// resposta, com o run "completed" e sem last_error. Em 1.078 runs (23/09 a
// 23/10/2026) apareceu 10 vezes, sempre depois de as tools terem respondido,
// também antes de existir o nosso plugin (15/10).
const ERRO_DA_PLATAFORMA = /^\s*I have encountered an error/i

// Falha da plataforma ao rodar a tool ("Error getting Python tool status"): o agente responde que a ferramenta não
// respondeu e pede para tentar de novo. Nos mesmos runs aconteceu 11 vezes, também nas tools da própria IBM (busca na
// web); o agente chama a tool de novo no mesmo turno e ela falha de novo, mas a pergunta repetida segundos depois
// passou todas as vezes.
const FALHA_DE_TOOL = /(ferramenta|tool)[^.\n]{0,80}(não respond|não está respond|erro|falh)|tente (novamente|de novo) mais tarde|encountered an error calling the tool|error getting python tool/i
const TEM_NUMERO = /R\$\s?\d|\d,\d|\d\s?%|\d\s?x\b/
const falhaParaRepetir = resposta => ERRO_DA_PLATAFORMA.test(resposta)
  || (FALHA_DE_TOOL.test(resposta) && !TEM_NUMERO.test(resposta))

// Pedido que grava relatório (gerar, alterar, inserir, e as mensagens das
// telas, que trazem "Origem:"): só é repetido depois de conferir que nenhum
// relatório foi gravado desde o envio; repetir um que já saiu geraria outro.
const ALTERA_RELATORIO = /(^|\n)Origem:|\b(ger[ae]r?|cri[ae]r?|atualiz\w*|alter\w*|edit\w*|insir\w*|inser\w*|inclu\w*|troqu\w*|troc\w*|substitu\w*|remov\w*|exclu\w*|acrescent\w*|corrij\w*|corrig\w*|apag\w*|refa\w*)\b/i

// A falha passa em segundos: a pergunta vai até 3 vezes, esperando antes de
// cada repetição (a falha de tool chegou a durar o turno inteiro, ~30 s).
const TENTATIVAS = 3
const SAIU = Symbol('a pessoa saiu da conversa')
const ESPERA_ANTES_DE_REPETIR_MS = [3000, 10000]

const AVISO_FALHA_REPETIDA = 'O Orchestrate teve uma falha técnica nas 3 tentativas de responder. '
  + 'Tente de novo em alguns instantes.'
const AVISO_RELATORIO_INCERTO = 'O Orchestrate teve uma falha técnica, e o relatório ainda não apareceu como gravado. '
  + 'Para não gerar outro, o pedido não foi repetido: confira a aba Análise de Crédito em alguns minutos.'
const AVISO_NADA_GRAVADO = 'O Orchestrate teve uma falha técnica nas 3 tentativas, e nenhum relatório foi '
  + 'gravado desde o envio. Pode pedir de novo.'

// Relatório gravado até 30 s antes do envio também conta: o relógio do
// navegador pode estar adiantado em relação ao do armazenamento.
const MARGEM_RELOGIO_MS = 30000

// Depois de uma falha da plataforma num pedido que grava relatório: { relatorio } gravado (ou versão nova) desde o
// envio; { nada } se nenhum foi gravado e nenhuma tool de relatório está rodando (repetir é seguro); { incerto } se
// uma continua rodando depois de ~5 min ou a resumos-api não respondeu (repetir poderia gerar um relatório a mais).
// A plataforma pode desistir da resposta com a tool ainda rodando: enquanto houver pedido em andamento, espera.
const ESPERA_MINIMA_MS = 15000
const ESPERA_MAXIMA_MS = 5 * 60 * 1000

async function desfechoDoPedido(envio, aoAguardar) {
  const desde = new Date(envio.getTime() - MARGEM_RELOGIO_MS)
  const comeco = Date.now()
  for (let n = 0; ; n += 1) {
    if (n) await new Promise(resolve => { setTimeout(resolve, n < 3 ? 5000 : 10000) })
    let emAndamento = null
    try {
      const [r] = await relatoriosDesde(desde)
      if (r) return { relatorio: r }
      emAndamento = await pedidosEmAndamento(desde)
    } catch {
      // A resumos-api pode estar acordando: conta como incerto e tenta de novo.
    }
    const passou = Date.now() - comeco
    if (emAndamento && !emAndamento.length && passou >= ESPERA_MINIMA_MS) return { nada: true }
    if (passou >= ESPERA_MAXIMA_MS) return { incerto: true }
    if (emAndamento?.length) aoAguardar()
  }
}

function avisoRelatorioGravado(r) {
  const nome = [r.empresa, r.referencia].filter(Boolean).join(' — ') || r.relatorio_id
  const url = `${window.location.origin}${enderecoRelatorio(r.relatorio_id, r.versao)}`
  return 'O Orchestrate teve uma falha técnica ao fechar a resposta, mas o relatório foi gravado: '
    + `[Abrir relatório — ${nome}${r.versao ? ` (versão ${r.versao})` : ''}](${url})`
}

// Conversa vinculada a um relatório (escolhido na tela, aberto pelo "Conversar no chat" do relatório, ou gerado na
// própria conversa): cada mensagem vai com esta primeira linha, que diz ao Analista qual relatório alterar (ver
// "Relatório desta conversa" na instrução dele). A tela esconde a linha. Sem ela, só o relatório gerado na própria
// conversa podia ganhar versão nova.
const PREFIXO_VINCULO = 'Relatório desta conversa: '
const LINHA_VINCULO = /^Relatório desta conversa: (\S+)\n\n?/
// Link de relatório numa resposta: o assinado do bucket (relatorios/<id>.html ou <id>-vN.html) ou o da resumos-api.
const LINK_RELATORIO = /\/relatorios\/([a-z0-9][a-z0-9-]*?)(?:-v\d+)?(?:\.html|\?versao=|\/html)/g

// O vínculo de cada conversa fica no navegador ('' = desvinculada de propósito); sem registro, vale o que a própria
// conversa mostra (a linha de vínculo, ou o último relatório gerado nela).
const CHAVE_VINCULOS = 'azquest_vinculos'

function lerVinculos() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_VINCULOS) || '{}') || {}
  } catch {
    return {}
  }
}

function gravarVinculo(thread, relatorioId) {
  try {
    localStorage.setItem(CHAVE_VINCULOS, JSON.stringify({ ...lerVinculos(), [thread]: relatorioId || '' }))
  } catch {
    // Sem armazenamento (janela anônima, bloqueio): o vínculo vale até a página recarregar.
  }
}

function ultimoRelatorio(texto) {
  return [...(texto || '').matchAll(LINK_RELATORIO)].map(m => m[1]).pop() || null
}

// Empresa da conversa. As tools do agente não veem a conversa, e o Analista já repassou uma pergunta de seguimento
// sem a empresa ("E a margem EBITDA ajustada nesse trimestre?"): a resposta foi "Ecorodovias ou Motiva?" numa conversa
// sobre a Ecorodovias (27/10/2026). A tela manda a empresa junto, e a tool a usa quando o pedido chega sem nenhuma.
const semAcento = texto => (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// A empresa citada no texto, entre as que têm acervo; null se nenhuma ou mais de uma.
export function empresaCitada(texto, empresas) {
  const t = semAcento(texto)
  const citadas = empresas.filter(e => new RegExp(`(^|[^a-z0-9])${semAcento(e)}([^a-z0-9]|$)`).test(t))
  return citadas.length === 1 ? citadas[0] : null
}

// A da mensagem; senão a última citada pelo analista nesta conversa; senão a do relatório vinculado.
export function empresaDaConversa(mensagem, anteriores, empresaDoVinculo, empresas) {
  for (const texto of [mensagem, ...[...anteriores].reverse()]) {
    const citada = empresaCitada(texto, empresas)
    if (citada) return citada
  }
  return empresaDoVinculo || null
}

export function useConversa() {
  const [mensagens, setMensagens] = useState([])
  // As mensagens e as empresas com acervo, lidas no envio sem recriar o `enviar` a cada mensagem.
  const mensagensRef = useRef([])
  useEffect(() => { mensagensRef.current = mensagens }, [mensagens])
  const empresasRef = useRef([])
  useEffect(() => {
    obterFontes().then(f => { empresasRef.current = f.empresas || [] }).catch(() => {})
  }, [])
  const [threadId, setThreadId] = useState(null)
  const [conversas, setConversas] = useState([])
  const [passo, setPasso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [segundos, setSegundos] = useState(0)
  // Relatório desta conversa: {relatorio_id, versao, empresa, referencia}, ou null.
  const [vinculo, setVinculo] = useState(null)
  // A conversa cujo vínculo a pessoa mudou nesta tela: só ela é gravada (abrir uma conversa não grava nada).
  const mudouVinculo = useRef(false)

  // O controlador aborta o stream quando a pessoa troca de conversa ou sai da
  // aba no meio de uma resposta. Sem ele, os trechos continuariam chegando e
  // seriam escritos na conversa errada.
  const controlador = useRef(null)

  // A analise-api fica com zero instâncias quando ninguém usa: a primeira
  // chamada depois de um tempo parado acorda o serviço e pode falhar. Antes, essa
  // falha deixava a barra lateral vazia até o próximo turno. Agora tenta de
  // novo (2 s, 5 s, 10 s, 20 s) e, se mesmo assim falhar, mantém a lista que já
  // estava na tela. Lista que não carrega não impede conversar.
  const tentativaLista = useRef(0)
  const recarregarConversas = useCallback(() => {
    const minha = ++tentativaLista.current
    const esperas = [2000, 5000, 10000, 20000]
    const tentar = n => {
      listarConversas()
        .then(lista => { if (minha === tentativaLista.current) setConversas(lista) })
        .catch(() => {
          if (minha === tentativaLista.current && n < esperas.length) setTimeout(() => tentar(n + 1), esperas[n])
        })
    }
    tentar(0)
  }, [])

  useEffect(() => {
    recarregarConversas()
    return () => controlador.current?.abort()
  }, [recarregarConversas])

  // Liga a conversa a um relatório (null desliga). Os rótulos (empresa, período, versão) vêm do estado do relatório.
  const vincular = useCallback(async (relatorioId, { escolhido = true } = {}) => {
    if (escolhido) mudouVinculo.current = true
    if (!relatorioId) {
      setVinculo(null)
      return
    }
    setVinculo(atual => (atual?.relatorio_id === relatorioId ? atual : { relatorio_id: relatorioId }))
    try {
      const estado = await estadoRelatorio(relatorioId)
      setVinculo(atual => (atual?.relatorio_id === relatorioId ? { ...atual, ...estado } : atual))
    } catch {
      // Sem o estado, o vínculo vale do mesmo jeito: só os rótulos ficam faltando.
    }
  }, [])

  // A versão atual do relatório vinculado (a miniatura troca quando ela avança).
  const atualizarVinculo = useCallback(async () => {
    const id = vinculo?.relatorio_id
    if (!id) return
    try {
      const estado = await estadoRelatorio(id)
      setVinculo(atual => (atual?.relatorio_id === id && atual.versao !== estado.versao ? { ...atual, ...estado } : atual))
    } catch {
      // Tenta de novo no próximo turno.
    }
  }, [vinculo?.relatorio_id])

  useEffect(() => {
    if (threadId && mudouVinculo.current) gravarVinculo(threadId, vinculo?.relatorio_id)
  }, [threadId, vinculo?.relatorio_id])

  // O relógio só existe enquanto se espera. Fora disso o intervalo é
  // desmontado, para a tela não re-renderizar de segundo em segundo sem
  // motivo.
  useEffect(() => {
    if (!enviando) return undefined
    const relogio = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(relogio)
  }, [enviando])

  const enviar = useCallback(async texto => {
    const mensagem = texto.trim()
    if (!mensagem || enviando) return

    controlador.current?.abort()

    const anteriores = mensagensRef.current.filter(m => m.papel === 'usuario').map(m => m.texto)
    const empresa = empresaDaConversa(mensagem, anteriores, vinculo?.empresa, empresasRef.current)

    setErro('')
    setEnviando(true)
    setSegundos(0)
    // O aviso inicial é posto aqui, não esperado do agente: o primeiro evento
    // do Orchestrate pode levar 39 segundos.
    setPasso(AVISO_INICIAL)
    setMensagens(atuais => [
      ...atuais,
      { id: `u-${Date.now()}`, papel: 'usuario', texto: mensagem },
      { id: `a-${Date.now()}`, papel: 'agente', texto: '' },
    ])

    // O id da thread no fechamento, não no estado: `setThreadId` só vale no
    // próximo render, e o turno precisa do id agora para a conversa nova
    // já nascer vinculada.
    let thread = threadId
    const envio = new Date()
    const relatorioDaConversa = vinculo?.relatorio_id || null
    const enviado = relatorioDaConversa ? `${PREFIXO_VINCULO}${relatorioDaConversa}\n\n${mensagem}` : mensagem

    // A resposta também numa variável: é preciso lê-la (para reconhecer o erro
    // da plataforma) sem esperar o próximo render.
    let resposta = ''
    const trocarResposta = novo => {
      resposta = novo
      setMensagens(atuais => {
        const copia = [...atuais]
        copia[copia.length - 1] = { ...copia[copia.length - 1], texto: novo }
        return copia
      })
    }
    const escreverNaResposta = trecho => trocarResposta(resposta + trecho)
    // O relatório gerado neste turno (27/10/2026): a analise-api repassa as etapas reais da geração (evento
    // `relatorio`) e o pedido_id, com que a tela acompanha a versão 2 depois da resposta.
    const marcarNaResposta = campos => setMensagens(atuais => {
      const copia = [...atuais]
      copia[copia.length - 1] = { ...copia[copia.length - 1], ...campos }
      return copia
    })

    // Uma rodada: o stream e, se ele não trouxer a resposta, a conversa
    // gravada. Devolve {falha, recebeuAlgo}, ou null se a pessoa saiu da
    // conversa no meio (abortar é saída normal, não falha).
    //
    // A rodada acaba no evento `fim`, não quando a conexão fecha: o
    // Orchestrate mantém o stream aberto por minutos depois de responder, e
    // esperar o fechamento deixava o "Enviar" travado esse tempo todo.
    const rodada = async meu => {
      let recebeuAlgo = false
      let falha = ''
      // A analise-api confere no histórico da conversa se toda tool do turno
      // falhou na plataforma: o modelo já disfarçou essa falha de resposta
      // ("não disponho do valor exato da emissão", 26/10/2026), e pelo texto
      // a tela não tem como reconhecer.
      let falhaDeTool = false
      try {
        for await (const evento of conversar(enviado, thread, meu.signal, empresa)) {
          if (meu.signal.aborted) return null

          if (evento.tipo === 'inicio') {
            // Conversa nova: a analise-api grava o vínculo nesse primeiro
            // evento, então ela já pode aparecer na barra lateral.
            if (!thread) recarregarConversas()
            thread = evento.thread_id
            setThreadId(evento.thread_id)
            if (evento.pedido_id) marcarNaResposta({ pedidoId: evento.pedido_id })
          } else if (evento.tipo === 'relatorio') {
            marcarNaResposta({ andamento: evento.andamento })
            setPasso(evento.andamento?.estado === 'concluida' ? 'Relatório pronto; redigindo a resposta' : 'Construindo o relatório')
          } else if (evento.tipo === 'passo') {
            setPasso(evento.texto)
          } else if (evento.tipo === 'trecho') {
            recebeuAlgo = true
            setPasso('')
            escreverNaResposta(evento.texto)
          } else if (evento.tipo === 'erro') {
            falha = evento.detalhe
          } else if (evento.tipo === 'fim') {
            // O texto do `fim` é a resposta inteira, e os trechos já a
            // montaram. Ele só é usado quando nenhum trecho chegou — o que
            // acontece se o agente responder sem emitir delta.
            if (!recebeuAlgo && evento.texto) {
              recebeuAlgo = true
              escreverNaResposta(evento.texto)
            }
            falhaDeTool = evento.falha_de_tool === true
            break
          }
        }
      } catch (e) {
        if (e.name === 'AbortError' || meu.signal.aborted) return null
        falha = e.message
      }

      // A resposta não chegou pelo stream, mas o agente pode tê-la terminado:
      // medido em 19/10/2026, com as tools frias, um pedido de relatório levou
      // mais de 140 s — o relatório saiu, e a tela mostrou erro (a conexão caiu
      // antes) ou resposta vazia (o Orchestrate fechou o stream sem delta).
      // O Orchestrate grava a resposta na conversa de qualquer jeito, então ela
      // é buscada lá antes de a tela desistir.
      if (!recebeuAlgo && thread) {
        setPasso('Buscando a resposta gravada na conversa')
        const gravada = await respostaDoHistorico(thread, enviado, meu.signal)
        if (meu.signal.aborted) return null
        if (gravada) {
          recebeuAlgo = true
          falha = ''
          escreverNaResposta(gravada)
        }
      }
      return { falha, recebeuAlgo, falhaDeTool }
    }

    // Espera entre tentativas: `abrir`/`nova` abortam o controlador, e o turno
    // para sem mexer na tela da outra conversa.
    const esperando = async tarefa => {
      const pausa = new AbortController()
      controlador.current = pausa
      const valor = await tarefa()
      if (pausa.signal.aborted) return SAIU
      controlador.current = null
      return valor
    }

    let fim = null
    for (let tentativa = 1; ; tentativa += 1) {
      const meu = new AbortController()
      controlador.current = meu
      fim = await rodada(meu)
      // Fecha a conexão que o servidor deixaria aberta. O controlador só é
      // desta rodada.
      if (controlador.current === meu) controlador.current = null
      if (!fim) return // a pessoa trocou de conversa: `abrir`/`nova` já limparam a tela
      meu.abort()

      if (!fim.falhaDeTool && !falhaParaRepetir(resposta)) break
      // Falha da plataforma (o Orchestrate devolve "I have encountered an
      // error. Please try again." como se fosse a resposta, ou a tool não
      // roda): a mesma mensagem vai de novo, na mesma conversa. Pedido que
      // grava relatório só vai de novo se nada foi gravado desde o envio.
      const alteraRelatorio = ALTERA_RELATORIO.test(mensagem)
      if (alteraRelatorio) {
        setPasso('Conferindo se o relatório foi gravado')
        const desfecho = await esperando(() => desfechoDoPedido(envio,
          () => setPasso('O relatório ainda está sendo gravado; aguardando')))
        if (desfecho === SAIU) return
        if (desfecho.relatorio) {
          trocarResposta(avisoRelatorioGravado(desfecho.relatorio))
          break
        }
        if (desfecho.incerto) {
          trocarResposta(AVISO_RELATORIO_INCERTO)
          break
        }
      }
      if (tentativa === TENTATIVAS) {
        trocarResposta(alteraRelatorio ? AVISO_NADA_GRAVADO : AVISO_FALHA_REPETIDA)
        break
      }
      trocarResposta('')
      setPasso(alteraRelatorio
        ? 'O Orchestrate teve uma falha técnica e nada foi gravado; pedindo de novo'
        : 'O Orchestrate teve uma falha técnica; perguntando de novo')
      const pausa = ESPERA_ANTES_DE_REPETIR_MS[tentativa - 1]
      if (await esperando(() => new Promise(resolve => { setTimeout(resolve, pausa) })) === SAIU) return
    }

    if (fim.falha) {
      setErro(fim.falha)
    } else if (!fim.recebeuAlgo) {
      setErro('A resposta do agente não chegou a tempo. Se você pediu um relatório, ele pode '
        + 'ter sido gravado: confira a aba Análise de Crédito ou abra esta conversa de novo em alguns minutos.')
    }
    // Relatório gerado nesta conversa passa a ser o dela: a miniatura aparece e as próximas alterações vão para ele.
    const gerado = ultimoRelatorio(resposta)
    if (gerado && gerado !== relatorioDaConversa) vincular(gerado)
    else if (relatorioDaConversa) atualizarVinculo()
    setEnviando(false)
    setPasso('')
    recarregarConversas()
  }, [enviando, threadId, recarregarConversas, vinculo?.relatorio_id, vinculo?.empresa, vincular, atualizarVinculo])

  const abrir = useCallback(async id => {
    controlador.current?.abort()
    setErro('')
    setPasso('')
    setEnviando(false)
    setSegundos(0)
    try {
      const { mensagens: anteriores } = await obterConversa(id)
      const salvos = lerVinculos()
      let relatorio = salvos[id] ?? null
      if (!(id in salvos)) {
        anteriores.forEach(m => {
          relatorio = (m.papel === 'usuario' ? LINHA_VINCULO.exec(m.texto)?.[1] : ultimoRelatorio(m.texto)) || relatorio
        })
      }
      mudouVinculo.current = false
      setMensagens(anteriores.map(m => (m.papel === 'usuario' ? { ...m, texto: m.texto.replace(LINHA_VINCULO, '') } : m)))
      setThreadId(id)
      vincular(relatorio || null, { escolhido: false })
    } catch (e) {
      setErro(e.message)
    }
  }, [vincular])

  // Conversa nova; com `relatorioId`, já vinculada a ele (o "Conversar no chat" do relatório).
  const nova = useCallback(relatorioId => {
    // Do botão "Nova conversa" chega o evento do clique: só uma string é id de relatório.
    const id = typeof relatorioId === 'string' ? relatorioId : null
    controlador.current?.abort()
    setMensagens([])
    setThreadId(null)
    mudouVinculo.current = Boolean(id)
    vincular(id, { escolhido: Boolean(id) })
    setPasso('')
    setErro('')
    setEnviando(false)
    setSegundos(0)
  }, [vincular])

  return {
    mensagens, threadId, conversas, passo, enviando, erro, segundos, vinculo,
    enviar, abrir, nova, vincular, atualizarVinculo,
  }
}
