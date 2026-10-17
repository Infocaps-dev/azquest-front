import { useCallback, useEffect, useRef, useState } from 'react'
import { conversar, listarConversas, obterConversa } from '../services/chatApi'

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

export function useConversa() {
  const [mensagens, setMensagens] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [conversas, setConversas] = useState([])
  const [passo, setPasso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [segundos, setSegundos] = useState(0)

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
    const meu = new AbortController()
    controlador.current = meu

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
    let recebeuAlgo = false
    let concluido = false

    // O turno acaba no evento `fim`, não quando a conexão fecha: o Orchestrate
    // mantém o stream aberto por minutos depois de responder, e esperar o
    // fechamento deixava o "Enviar" travado e a conversa fora da lista por esse
    // tempo todo. No `fim` a tela libera o envio e atualiza a lista na hora.
    const concluir = () => {
      if (concluido) return
      concluido = true
      setEnviando(false)
      setPasso('')
      recarregarConversas()
    }

    const escreverNaResposta = trecho => {
      setMensagens(atuais => {
        const copia = [...atuais]
        const ultima = copia[copia.length - 1]
        copia[copia.length - 1] = { ...ultima, texto: ultima.texto + trecho }
        return copia
      })
    }

    try {
      for await (const evento of conversar(mensagem, thread, meu.signal)) {
        if (meu.signal.aborted) return

        if (evento.tipo === 'inicio') {
          // Conversa nova: a analise-api grava o vínculo nesse primeiro
          // evento, então ela já pode aparecer na barra lateral.
          if (!thread) recarregarConversas()
          thread = evento.thread_id
          setThreadId(evento.thread_id)
        } else if (evento.tipo === 'passo') {
          setPasso(evento.texto)
        } else if (evento.tipo === 'trecho') {
          recebeuAlgo = true
          setPasso('')
          escreverNaResposta(evento.texto)
        } else if (evento.tipo === 'erro') {
          setErro(evento.detalhe)
        } else if (evento.tipo === 'fim') {
          // O texto do `fim` é a resposta inteira, e os trechos já a
          // montaram. Ele só é usado quando nenhum trecho chegou — o que
          // acontece se o agente responder sem emitir delta.
          if (!recebeuAlgo && evento.texto) escreverNaResposta(evento.texto)
          concluir()
          break
        }
      }
    } catch (e) {
      // Abortar é saída normal, não falha: acontece toda vez que a pessoa
      // troca de conversa no meio de uma resposta.
      if (e.name !== 'AbortError' && !concluido) setErro(e.message)
    } finally {
      if (concluido) {
        // A resposta já chegou inteira: fecha a conexão que o servidor
        // deixaria aberta. O controlador só é desta resposta.
        if (controlador.current === meu) controlador.current = null
        meu.abort()
      } else if (!meu.signal.aborted) {
        concluir()
      }
    }
  }, [enviando, threadId, recarregarConversas])

  const abrir = useCallback(async id => {
    controlador.current?.abort()
    setErro('')
    setPasso('')
    setEnviando(false)
    setSegundos(0)
    try {
      const { mensagens: anteriores } = await obterConversa(id)
      setMensagens(anteriores)
      setThreadId(id)
    } catch (e) {
      setErro(e.message)
    }
  }, [])

  const nova = useCallback(() => {
    controlador.current?.abort()
    setMensagens([])
    setThreadId(null)
    setPasso('')
    setErro('')
    setEnviando(false)
    setSegundos(0)
  }, [])

  return {
    mensagens, threadId, conversas, passo, enviando, erro, segundos,
    enviar, abrir, nova,
  }
}
