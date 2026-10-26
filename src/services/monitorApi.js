// Cliente da monitor-api, a API da etapa 1.5 (Monitoramento).
//
// As chamadas vão para /monitor, que o Vite encaminha para a monitor-api em
// desenvolvimento (ver vite.config.js). O prefixo é separado de /api de
// propósito: /api é o BFF de autenticação, que roda noutro serviço.
//
// Modo simulado: com VITE_MONITOR_MOCK=true o módulo reproduz o ciclo 2T26
// passo a passo, sem backend, para demonstração. Mesma ideia do VITE_AUTH_MOCK.

import { CICLO_SIMULADO, etapasSimuladas } from './monitorMock'

export const MODO_SIMULADO = import.meta.env.VITE_MONITOR_MOCK === 'true'

const BASE = '/monitor'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  })
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    throw new Error(corpo.detail || `Falha em ${rota} (HTTP ${resposta.status})`)
  }
  return resposta.status === 204 ? null : resposta.json()
}

export async function saude() {
  if (MODO_SIMULADO) return { status: 'ok', simulado: true }
  return pedir('/api/health')
}

// Emissores monitorados, com o bucket do acervo, o baseline em uso e os
// trimestres que têm documento para rodar o ciclo.
export async function listarEmissores() {
  if (MODO_SIMULADO) return [{ emissor: 'Ecorodovias', periodos: ['2T26'], baseline: { versao: 'v0' } }]
  return pedir('/api/emissores')
}

export async function listarExecucoes(emissor) {
  if (MODO_SIMULADO) return [CICLO_SIMULADO.execucao]
  const query = emissor ? `?emissor=${encodeURIComponent(emissor)}` : ''
  return pedir(`/api/execucoes${query}`)
}

export async function obterExecucao(id) {
  if (MODO_SIMULADO) return { ...CICLO_SIMULADO.execucao, etapas: etapasSimuladas(8) }
  return pedir(`/api/execucoes/${encodeURIComponent(id)}`)
}

export async function obterComparacao(id) {
  if (MODO_SIMULADO) return CICLO_SIMULADO.comparacao
  return pedir(`/api/comparacoes/${id}`)
}

export async function listarAlertas(status) {
  if (MODO_SIMULADO) return CICLO_SIMULADO.alertas
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return pedir(`/api/alertas${query}`)
}

export async function obterBaseline(emissor) {
  if (MODO_SIMULADO) return CICLO_SIMULADO.baseline
  return pedir(`/api/baseline?emissor=${encodeURIComponent(emissor)}`)
}

export async function registrarRevisao({ alertaId, usuario, decisao, justificativa, textoEditado }) {
  // A API recusa rejeição sem justificativa e edição sem texto. A tela valida
  // antes para o analista não perder o que escreveu numa ida ao servidor.
  if (decisao === 'rejeitado' && !justificativa?.trim()) {
    throw new Error('A rejeição exige justificativa.')
  }
  if (decisao === 'editado' && !textoEditado?.trim()) {
    throw new Error('A edição exige o texto revisado.')
  }
  if (MODO_SIMULADO) {
    return { id: 1, alerta_id: alertaId, decisao, simulado: true }
  }
  return pedir('/api/revisoes', {
    method: 'POST',
    body: JSON.stringify({
      alerta_id: alertaId,
      usuario,
      decisao,
      justificativa: justificativa || null,
      texto_editado: textoEditado || null,
    }),
  })
}

// Comparação de um ciclo, achada pelo período.
//
// A tela achava a comparação pelo `comparacao_id` do alerta. Ciclo que termina
// em B5 não gera alerta, então abriria sem quadro comparativo nenhum -- e é
// justamente o quadro que explica por que o ciclo foi classificado assim.
export async function comparacaoDoPeriodo(emissor, periodo) {
  if (MODO_SIMULADO) return CICLO_SIMULADO.comparacao

  const lista = await pedir(
    `/api/comparacoes${emissor ? `?emissor=${encodeURIComponent(emissor)}` : ''}`,
  )
  // A lista vem do mais recente para o mais antigo: a primeira do período é a
  // comparação em vigor, caso o ciclo tenha sido recalculado.
  const resumo = (lista || []).find(c => c.periodo === periodo)
  return resumo ? obterComparacao(resumo.id) : null
}

// Histórico de ciclos do emissor, para situar o ciclo atual contra os
// anteriores.
//
// Vem das comparações, não dos alertas. Nem todo ciclo gera alerta: o que
// termina em B5, sem impacto material, não gera -- e foi o que aconteceu com o
// 1T26. Montar o histórico a partir dos alertas deixava de fora justamente os
// ciclos tranquilos, que são a linha de base da comparação.
//
// A decisão do analista, quando existe, vem do alerta correspondente.
export async function historicoDeCiclos(emissor) {
  if (MODO_SIMULADO) return CICLO_SIMULADO.historico

  const [comparacoes, todos] = await Promise.all([
    pedir(`/api/comparacoes${emissor ? `?emissor=${encodeURIComponent(emissor)}` : ''}`),
    listarAlertas().catch(() => []),
  ])
  // A lista de alertas vem de todos os emissores, e Ecorodovias e Motiva têm o
  // mesmo 2T26: sem o filtro, a decisão de um aparecia no histórico do outro.
  const alertas = (todos || []).filter(a => !emissor || !a.emissor || a.emissor === emissor)

  const decisaoPorPeriodo = new Map(
    (alertas || []).map(a => [a.periodo, a.status_revisao]),
  )

  // Uma linha por ciclo, não por comparação. Um mesmo período pode ter sido
  // recalculado -- o 2T26 foi, para ganhar o trimestre anterior como
  // referência -- e a lista vem do mais recente para o mais antigo, então a
  // primeira de cada período é a que vale. Sem isto o ciclo aparecia repetido.
  const porPeriodo = new Map()
  for (const c of comparacoes || []) {
    if (porPeriodo.has(c.periodo)) continue
    porPeriodo.set(c.periodo, {
      periodo: c.periodo,
      nivel: c.nivel_maximo,
      alavancagem: c.metricas?.dl_ebitda_consolidado ?? null,
      destino: c.roteamento?.destino || null,
      decisao: decisaoPorPeriodo.get(c.periodo) || null,
    })
  }

  return [...porPeriodo.values()].sort(
    (a, b) => String(a.periodo).localeCompare(String(b.periodo)),
  )
}

// Histórico de aprovação: o que foi decidido, por quem, e sobre que texto.
//
// Uma chamada só. Montar isto no front custaria uma requisição por alerta, e o
// texto decidido mora no alerta, não na revisão -- a API junta os dois.
export async function historicoDeAprovacoes(emissor, periodo) {
  if (MODO_SIMULADO) return CICLO_SIMULADO.decisoes || []
  const parametros = new URLSearchParams()
  if (emissor) parametros.set('emissor', emissor)
  if (periodo) parametros.set('periodo', periodo)
  const consulta = parametros.toString()
  return pedir(`/api/revisoes${consulta ? `?${consulta}` : ''}`)
}

// Roda o ciclo B1 a B8 do periodo.
//
// A API recusa com 409 quando ja ha etapa em andamento. A tela tambem desativa
// o botao nesse caso, mas as duas defesas precisam existir: duas abas abertas
// sao dois botoes, e so o servidor ve as duas.
//
// `assincrono`: a API semeia as oito etapas, devolve na hora e roda o ciclo em
// segundo plano. É o que deixa a tela mostrar B1 a B6 andando, em vez de só o
// estado final.
export async function executarCiclo(emissor, periodo) {
  if (MODO_SIMULADO) return { simulado: true }
  return pedir('/api/ciclos/executar', {
    method: 'POST',
    body: JSON.stringify({ emissor, periodo, assincrono: true }),
  })
}

// Marca o andamento de uma etapa. E a unica escrita de fluxo que a tela faz:
// serve para o analista encaminhar o ciclo quando o roteamento desvia, sem
// depender de o agente estar rodando naquele instante.
export async function marcarEtapa({ execucaoId, etapa, status, mensagem, fontes }) {
  if (MODO_SIMULADO) {
    return { id: execucaoId, etapa, status, simulado: true }
  }
  return pedir(
    `/api/execucoes/${encodeURIComponent(execucaoId)}/etapas/${encodeURIComponent(etapa)}`,
    {
      method: 'POST',
      body: JSON.stringify({ status, mensagem: mensagem || null, fontes: fontes || null }),
    },
  )
}

export function urlStream(execucaoId) {
  return `${BASE}/api/execucoes/${encodeURIComponent(execucaoId)}/stream`
}
