import { useEffect, useRef, useState } from 'react'
import { Button, IconButton, InlineLoading, InlineNotification, TextArea } from '@carbon/react'
import { Chat, Close, Send } from '@carbon/icons-react'
import { conversar } from '../../services/chatApi'
import { registrarEdicao, versaoPublicada } from '../../services/resumosApi'
import RespostaDoAgente from '../Chat/RespostaDoAgente.jsx'
import { mensagemDeEdicao } from './edicaoTrecho'
import './EdicaoTrecho.scss'

// Janela de conversa da edição de um trecho, aberta na frente do relatório pelo botão "Editar".
//
// O analista explica a alteração; a mensagem vai ao Analista com a referência exata do campo (âncora e texto-fonte do
// bloco) e ele a repassa ao Agente de Relatório, que grava a versão nova. A versão nova é percebida pelo arquivo
// relatorios/<id>-v<N+1>.html, que o agente publica no fim da edição: a tela não espera o fim da resposta (o
// Orchestrate pode segurar o stream por minutos) nem o resumo do monitor. Assim que a versão existe, a janela fecha e
// a tela do relatório troca para ela, já no campo alterado.
//
// Se o agente responder sem gerar versão (pediu um esclarecimento, ou o trecho não foi encontrado), a resposta aparece
// aqui e o analista responde na mesma janela; cada envio leva o diálogo inteiro, porque o agente não vê o anterior.

const PRAZO_MS = 6 * 60 * 1000 // edição com tools frias pode passar de 2 minutos
const ESPERA_APOS_RESPOSTA_MS = 20000 // a versão é gravada antes da resposta; a margem cobre o atraso do COS

const esperar = ms => new Promise(resolve => { setTimeout(resolve, ms) })

function EdicaoTrecho({
  relatorioId, versao, referencia, onFechar, onVersaoNova, onVersaoMudou, onConversar, onAbrirFonte,
}) {
  const [dialogo, setDialogo] = useState([]) // {papel: 'usuario' | 'agente', texto}
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [passo, setPasso] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState('')
  const thread = useRef(null)
  const controlador = useRef(null)
  const campo = useRef(null)

  useEffect(() => { campo.current?.focus() }, [])
  useEffect(() => () => controlador.current?.abort(), [])
  useEffect(() => {
    if (!enviando) return undefined
    const relogio = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(relogio)
  }, [enviando])

  async function enviar() {
    const pedido = texto.trim()
    if (!pedido || enviando) return
    setErro('')
    // Alguém gerou outra versão enquanto a tela estava aberta: o trecho na tela pode não ser mais o atual.
    if (await versaoPublicada(relatorioId, versao + 1)) {
      setErro('O relatório ganhou uma versão nova enquanto a tela estava aberta.')
      onVersaoMudou?.()
      return
    }
    const novoDialogo = [...dialogo, { papel: 'usuario', texto: pedido }]
    // O pedido fica registrado com quem pediu (sessão): é o que permite ao agente manter os números que o analista
    // digitou, em vez de a conferência retirá-los como "número sem fonte".
    let pedidoId
    try {
      ({ pedido_id: pedidoId } = await registrarEdicao(relatorioId, {
        versao, ancora: referencia.ancora,
        textos: novoDialogo.filter(m => m.papel === 'usuario').map(m => m.texto),
      }))
    } catch (e) {
      setErro(e.message)
      return
    }
    setDialogo(novoDialogo)
    setTexto('')
    setEnviando(true)
    setSegundos(0)
    setPasso('Pedido enviado ao agente')

    const meu = new AbortController()
    controlador.current = meu
    const alvo = versao + 1
    const limite = Date.now() + PRAZO_MS

    const vigia = (async () => {
      while (!meu.signal.aborted && Date.now() < limite) {
        if (await versaoPublicada(relatorioId, alvo)) return true
        await esperar(3000)
      }
      return false
    })()

    let resposta = ''
    let falha = ''
    const conversa = (async () => {
      try {
        const mensagem = mensagemDeEdicao({ relatorioId, versao, referencia, dialogo: novoDialogo, pedidoId })
        for await (const evento of conversar(mensagem, thread.current, meu.signal)) {
          if (evento.tipo === 'inicio') thread.current = evento.thread_id
          else if (evento.tipo === 'passo') setPasso(evento.texto)
          else if (evento.tipo === 'trecho') resposta += evento.texto
          else if (evento.tipo === 'erro') falha = evento.detalhe
          else if (evento.tipo === 'fim') {
            resposta = resposta || evento.texto || ''
            if (evento.thread_id) thread.current = evento.thread_id
            break
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') falha = e.message
      }
      return 'resposta'
    })()

    let primeiro = await Promise.race([vigia.then(v => (v ? 'versao' : 'prazo')), conversa])
    if (primeiro === 'resposta') {
      setPasso('Conferindo a versão nova')
      primeiro = (await Promise.race([vigia, esperar(ESPERA_APOS_RESPOSTA_MS).then(() => false)])) ? 'versao' : 'sem_versao'
    }
    meu.abort()
    if (controlador.current !== meu) return // a janela fechou ou outro envio começou
    setEnviando(false)
    setPasso('')
    if (primeiro === 'versao') {
      onVersaoNova(alvo, resposta)
      return
    }
    if (resposta.trim()) {
      setDialogo(atual => [...atual, { papel: 'agente', texto: resposta.trim() }])
    } else {
      setErro(falha || (primeiro === 'prazo'
        ? 'A edição passou de 6 minutos sem gerar versão nova. Tente de novo; se repetir, peça pelo chat.'
        : 'O agente não respondeu e nenhuma versão nova foi gerada. Tente de novo.'))
    }
  }

  function aoTeclar(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <aside className="edicao-trecho" aria-label="Editar trecho do relatório">
      <header className="edicao-trecho__topo">
        <div>
          <p className="edicao-trecho__rotulo">{referencia.tipo === 'secao' ? 'Editar seção' : 'Editar trecho'}</p>
          <h3 className="edicao-trecho__campo">{referencia.rotulo}</h3>
        </div>
        <IconButton kind="ghost" size="sm" label="Fechar" onClick={onFechar} align="left">
          <Close />
        </IconButton>
      </header>

      {referencia.textoNaTela && (
        <blockquote className="edicao-trecho__atual">
          {referencia.textoNaTela.length > 400 ? `${referencia.textoNaTela.slice(0, 400)}…` : referencia.textoNaTela}
        </blockquote>
      )}

      {/* As fontes do trecho abrem o documento por cima do relatório; "Voltar" devolve a esta janela, como estava. */}
      {onAbrirFonte && referencia.fontes?.length > 0 && (
        <div className="edicao-trecho__fontes">
          <p className="edicao-trecho__rotulo">{referencia.fontes.length === 1 ? 'Fonte do trecho' : 'Fontes do trecho'}</p>
          <ul>
            {referencia.fontes.map(f => (
              <li key={f.texto}>
                <button type="button" className="edicao-trecho__fonte" title="Abrir o documento citado"
                  onClick={() => onAbrirFonte(f)}>
                  {f.texto}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="edicao-trecho__conversa">
        {!dialogo.length && (
          <p className="edicao-trecho__dica">
            Explique a alteração: o que trocar, acrescentar ou tirar neste {referencia.tipo === 'secao' ? 'trecho da seção' : 'trecho'}.
            Fatos novos precisam de fonte nos documentos; número sem fonte é retirado.
          </p>
        )}
        {dialogo.map((m, n) => (
          <div key={n} className={`edicao-trecho__fala edicao-trecho__fala--${m.papel}`}>
            {m.papel === 'agente' ? <RespostaDoAgente texto={m.texto} onTrocarAba={() => {}} /> : m.texto}
          </div>
        ))}
        {enviando && (
          <InlineLoading className="edicao-trecho__andamento"
            description={`${passo || 'Aguardando o agente'} · ${segundos} s`} />
        )}
        {erro && <InlineNotification kind="error" lowContrast hideCloseButton title={erro} />}
      </div>

      {onConversar && (
        <p className="edicao-trecho__chat">
          Várias alterações, ou uma conversa mais longa?{' '}
          <Button kind="ghost" size="sm" renderIcon={Chat} onClick={onConversar} disabled={enviando}>
            Abrir um chat dedicado a este relatório
          </Button>
        </p>
      )}

      <footer className="edicao-trecho__envio">
        <TextArea ref={campo} labelText="Alteração" hideLabel rows={3} value={texto} disabled={enviando}
          placeholder="Ex.: troque por “a folga caiu para 0,85x no 2T26” (Enter envia, Shift+Enter quebra a linha)"
          onChange={e => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        <Button size="sm" renderIcon={Send} onClick={enviar} disabled={enviando || !texto.trim()}>
          Enviar alteração
        </Button>
      </footer>
    </aside>
  )
}

export default EdicaoTrecho
