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

export function urlStream(execucaoId) {
  return `${BASE}/api/execucoes/${encodeURIComponent(execucaoId)}/stream`
}
