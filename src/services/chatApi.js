// Cliente da conversa com o Agente Analista de Crédito AZ Quest.
//
// As chamadas vão para /analise, o mesmo prefixo da analise-api (ver
// vite.config.js): a conversa roda lá porque é lá que a chave do Orchestrate
// vive, em variável de ambiente. A chave nunca chega ao navegador — é o que
// descarta a alternativa de o front falar direto com o Orchestrate.
//
// Modo simulado: com VITE_CHAT_MOCK=true o módulo responde de um roteiro
// fixo, no mesmo padrão dos outros flags (VITE_AUTH_MOCK,
// VITE_MONITOR_MOCK). Serve para a demonstração não
// depender de o Orchestrate estar de pé.

export const MODO_SIMULADO = import.meta.env.VITE_CHAT_MOCK === 'true'

const BASE = '/analise'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  })
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    const detalhe = corpo.detail
    throw new Error(
      typeof detalhe === 'string'
        ? detalhe
        : detalhe?.mensagem || `Falha em ${rota} (HTTP ${resposta.status})`,
    )
  }
  return resposta.status === 204 ? null : resposta.json()
}

// ── Um turno de conversa ───────────────────────────────────────────────
//
// Gerador assíncrono: entrega os eventos conforme chegam, e quem consome
// escreve um `for await` em vez de registrar callbacks.
//
// Por que `fetch` e não `EventSource`: o turno é um POST (tem corpo —
// mensagem e thread_id), e EventSource só faz GET. A alternativa seria o POST
// abrir a execução e um GET acompanhar, o que obrigaria a API a guardar os
// eventos em memória esperando alguém ler, com o problema extra de dois
// workers no Code Engine (o GET pode cair no worker que não tem o stream).
// Uma requisição, sem estado no servidor.
//
// Vocabulário dos eventos, que é o contrato com a analise-api:
//   {tipo: 'inicio',  thread_id, run_id}
//   {tipo: 'passo',   texto}     andamento, substituível
//   {tipo: 'trecho',  texto}     pedaço da resposta, acumulável
//   {tipo: 'fim',     texto, thread_id, run_id, uso, fontes?}
//                     fontes: as fontes dos números da resposta (componente "Fontes", fora do texto do modelo)
//   {tipo: 'erro',    detalhe}

// `empresa`: a empresa de que a conversa trata (ver empresaDaConversa em useConversa); a analise-api a manda ao
// Orchestrate como contexto, e as tools a usam quando o pedido chega sem empresa.
export async function* conversar(mensagem, threadId = null, sinal = null, empresa = null) {
  if (MODO_SIMULADO) {
    yield* conversaSimulada(mensagem, threadId)
    return
  }

  const resposta = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensagem, thread_id: threadId, ...(empresa ? { empresa } : {}) }),
    signal: sinal,
  })

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    const detalhe = typeof corpo.detail === 'string' ? corpo.detail : null
    throw new Error(
      detalhe
        || (resposta.status === 401
          ? 'Sessão expirada. Entre novamente.'
          : `O agente não pôde ser acionado (HTTP ${resposta.status}).`),
    )
  }

  const leitor = resposta.body.getReader()
  const decodificador = new TextDecoder()
  let resto = ''

  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break

      // `stream: true` é obrigatório: um caractere acentuado pode ficar
      // partido entre dois pedaços da rede, e sem isso ele vira "�".
      resto += decodificador.decode(value, { stream: true })

      // Eventos SSE são separados por linha em branco. O último pedaço pode
      // estar incompleto, então ele volta para o acumulador.
      const blocos = resto.split('\n\n')
      resto = blocos.pop()

      for (const bloco of blocos) {
        const linha = bloco.split('\n').find(l => l.startsWith('data:'))
        if (!linha) continue
        try {
          yield JSON.parse(linha.slice(5).trim())
        } catch {
          // Linha quebrada não derruba a conversa: o que já chegou vale.
        }
      }
    }
  } finally {
    // Cancelar o leitor fecha a conexão. Sem isso, trocar de conversa no meio
    // de uma resposta longa deixaria o stream aberto até o servidor desistir.
    leitor.releaseLock?.()
  }
}

export async function listarConversas() {
  if (MODO_SIMULADO) return conversasSimuladas
  return pedir('/api/chat/conversas')
}

export async function obterConversa(threadId) {
  if (MODO_SIMULADO) {
    return { thread_id: threadId, mensagens: historicoSimulado[threadId] || [] }
  }
  return pedir(`/api/chat/conversas/${encodeURIComponent(threadId)}`)
}

// ── Modo simulado ──────────────────────────────────────────────────────
//
// O roteiro imita o que a instância real devolveu na medição de 16/10/2026:
// avisos de andamento, depois o texto, e um link markdown quando o pedido é
// de relatório. O agente nunca escreve o relatório no chat — a instrução dele
// é explícita —, então nem a simulação escreve.

const conversasSimuladas = [
  {
    thread_id: 'simulada-1',
    titulo: 'Qual a folga do covenant de alavancagem?',
    turnos: 2,
    ultima_em: '2026-10-16T14:10:00Z',
  },
]

const historicoSimulado = {
  'simulada-1': [
    { id: 's1', papel: 'usuario', texto: 'Qual a folga do covenant de alavancagem?' },
    {
      id: 's2',
      papel: 'agente',
      texto: 'A folga e a distância do gatilho vêm do motor de regras, pela '
        + 'monitor-api. Abra a aba Monitoramento para o número com a fonte.',
    },
  ],
}

const RESPOSTA_RELATORIO = 'Relatório gerado. '
  + '[Abrir relatório — Ecorodovias — 2º trimestre de 2026](https://exemplo.invalido/relatorio-simulado.html)\n\n'
  + 'O link vale 7 dias. Em modo simulado nada foi gerado no Cloud Object Storage.'

const RESPOSTA_PADRAO = 'Em modo simulado eu não aciono o agente. '
  + 'Aponte VITE_CHAT_MOCK para false e configure ORCHESTRATE_API_KEY na '
  + 'analise-api para conversar com o Agente Analista de Crédito AZ Quest.'

function espera(ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

async function* conversaSimulada(mensagem, threadId) {
  const thread = threadId || `simulada-${Date.now()}`
  yield { tipo: 'inicio', thread_id: thread, run_id: 'run-simulada' }

  await espera(400)
  yield { tipo: 'passo', texto: 'O agente esta processando seu pedido' }
  await espera(700)
  yield { tipo: 'passo', texto: 'Pensando no pedido' }
  await espera(700)

  const pedeRelatorio = /relat[oó]rio|gerar|gere/i.test(mensagem)
  const texto = pedeRelatorio ? RESPOSTA_RELATORIO : RESPOSTA_PADRAO

  // Em pedaços, para a tela exercitar o acúmulo de trechos como no real.
  for (const pedaco of texto.match(/[\s\S]{1,40}/g) || []) {
    yield { tipo: 'trecho', texto: pedaco }
    await espera(45)
  }

  yield { tipo: 'fim', texto, thread_id: thread, run_id: 'run-simulada', uso: null,
          ...(pedeRelatorio ? {} : { fontes: ['Balanco-DRE-FC-2026-06.xlsx, aba "Destaques", linha 16'] }) }
}
