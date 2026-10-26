import { useEffect, useRef, useState } from 'react'
import { MODO_SIMULADO, obterExecucao, urlStream } from '../services/monitorApi'
import { TOTAL_ETAPAS, etapasSimuladas } from '../services/monitorMock'

// Acompanha uma execução do ciclo B1 a B8 em tempo real.
//
// Em produção abre um EventSource no endpoint de Server-Sent Events da
// monitor-api, que emite o estado das oito etapas a cada mudança e encerra
// quando o ciclo termina.
//
// Em modo simulado avança uma etapa a cada poucos segundos, para a demonstração
// mostrar o processo andando sem backend. O ciclo simulado pausa em B6,
// aguardando a aprovação na tela, que é o comportamento real do fluxo.

const INTERVALO_SIMULADO_MS = 2500
const ETAPA_DE_APROVACAO = 5 // índice de B6

// `decisao` e a decisao do analista -- 'aprovado', 'editado' ou 'rejeitado'.
// Ela entra como dependencia do efeito para a tela recarregar o ciclo depois
// que a API fecha as etapas. Antes entrava so um booleano `aprovado`, e a
// rejeicao, que tambem muda o fluxo (B8 fica bloqueado), nao disparava
// recarga: o analista rejeitava e a tela seguia pedindo a decisao.
// `acompanhar`: enquanto a tela roda um ciclo, pergunta o estado a cada 1,5 s.
// O EventSource continua aberto, mas no Code Engine o stream chega bufferizado,
// todo no fim (README do front); sem a consulta, as etapas não se moveriam.
const INTERVALO_ACOMPANHAMENTO_MS = 1500

// Estado velho não sobrescreve estado novo. No Code Engine o stream chega
// bufferizado, em blocos atrasados: depois do fim do ciclo ainda chegavam
// estados antigos ("B3 concluído, B4 pendente"), e a tela voltava no tempo
// por um instante. Foi o que fez o aviso de desvio piscar e sumir. A ordem é
// o horário mais recente das etapas e, no empate (mesmo segundo), o avanço.
const PESO_STATUS = { pendente: 0, em_execucao: 1, aguardando_aprovacao: 2, concluido: 3, falhou: 3, bloqueado: 3 }

function marcaDe(execucao) {
  const horarios = [execucao?.inicio, ...(execucao?.etapas || []).flatMap(e => [e.inicio, e.fim])]
    .filter(Boolean).map(String).sort()
  const avanco = (execucao?.etapas || []).reduce((soma, e) => soma + (PESO_STATUS[e.status] ?? 0), 0)
  return [horarios[horarios.length - 1] || '', avanco]
}

function maisRecente(atual, novo) {
  if (!atual || !novo || atual.id !== novo.id) return novo
  const [hAtual, aAtual] = marcaDe(atual)
  const [hNovo, aNovo] = marcaDe(novo)
  if (hNovo < hAtual || (hNovo === hAtual && aNovo < aAtual)) return atual
  return novo
}

export function useExecucao(execucaoId, { decisao = null, acompanhar = false } = {}) {
  const aprovado = Boolean(decisao) && decisao !== 'rejeitado'
  const [execucao, setExecucao] = useState(null)
  const [erro, setErro] = useState('')
  // Em modo simulado a 'conexao' ja nasce ativa: nao ha o que conectar, e
  // iniciar em false obrigaria a um setState sincrono dentro do efeito.
  const [conectado, setConectado] = useState(MODO_SIMULADO)
  const avanco = useRef(0)

  useEffect(() => {
    if (!execucaoId) return undefined

    // ── Modo simulado ────────────────────────────────────────────────
    if (MODO_SIMULADO) {
      let ativo = true
      obterExecucao(execucaoId).then(base => {
        if (!ativo) return
        setExecucao({ ...base, etapas: etapasSimuladas(avanco.current) })
      })
      const timer = setInterval(() => {
        // O fluxo real pausa em B6 esperando o analista. Sem aprovação, a
        // simulação para no mesmo ponto em vez de seguir sozinha.
        const limite = aprovado ? TOTAL_ETAPAS : ETAPA_DE_APROVACAO
        if (avanco.current >= limite) return
        avanco.current += 1
        setExecucao(atual => (atual ? { ...atual, etapas: etapasSimuladas(avanco.current) } : atual))
      }, INTERVALO_SIMULADO_MS)
      return () => {
        ativo = false
        clearInterval(timer)
      }
    }

    // ── Produção: Server-Sent Events ─────────────────────────────────
    let fonte
    // Carrega o estado uma vez antes de abrir o stream: assim a tela já
    // aparece preenchida mesmo que a próxima mudança demore.
    const aplicar = novo => setExecucao(atual => maisRecente(atual, novo))
    obterExecucao(execucaoId).then(aplicar).catch(e => setErro(e.message))

    try {
      fonte = new EventSource(urlStream(execucaoId))
      fonte.addEventListener('open', () => setConectado(true))
      fonte.addEventListener('etapas', evento => {
        try {
          aplicar(JSON.parse(evento.data))
          setErro('')
        } catch {
          setErro('Não foi possível ler o andamento do ciclo.')
        }
      })
      fonte.addEventListener('fim', evento => {
        try {
          aplicar(JSON.parse(evento.data))
        } catch {
          /* o estado anterior já está na tela */
        }
        fonte.close()
        setConectado(false)
      })
      fonte.addEventListener('erro', () => {
        setErro('Execução não encontrada no servidor.')
        fonte.close()
        setConectado(false)
      })
      fonte.onerror = () => {
        // O EventSource reconecta sozinho; só avisa quando a tela está vazia,
        // para não piscar aviso a cada hipo de rede.
        setConectado(false)
        setExecucao(atual => {
          if (!atual) setErro('Sem conexão com o serviço de monitoramento.')
          return atual
        })
      }
    } catch {
      setErro('Este navegador não suporta acompanhamento em tempo real.')
    }

    return () => fonte?.close()
  }, [execucaoId, decisao, aprovado])

  useEffect(() => {
    if (!acompanhar || !execucaoId || MODO_SIMULADO) return undefined
    const timer = setInterval(() => {
      obterExecucao(execucaoId).then(novo => setExecucao(atual => maisRecente(atual, novo))).catch(() => {})
    }, INTERVALO_ACOMPANHAMENTO_MS)
    return () => clearInterval(timer)
  }, [acompanhar, execucaoId])

  const etapas = execucao?.etapas || []
  const concluidas = etapas.filter(e => e.status === 'concluido').length
  const etapaAtual = etapas.find(e => e.status === 'em_execucao' || e.status === 'aguardando_aprovacao')

  return {
    execucao,
    etapas,
    etapaAtual,
    concluidas,
    total: etapas.length || TOTAL_ETAPAS,
    aguardandoAprovacao: etapaAtual?.status === 'aguardando_aprovacao',
    conectado,
    erro,
    simulado: MODO_SIMULADO,
  }
}
