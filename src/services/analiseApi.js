// Cliente da analise-api, a API da etapa 1.2 (Análise de Crédito).
//
// As chamadas vão para /analise, que o Vite encaminha para a analise-api em
// desenvolvimento (ver vite.config.js). Três prefixos, três serviços: /api é o
// BFF de autenticação, /monitor é a 1.5 e /analise é esta.
//
// Modo simulado: com VITE_ANALISE_MOCK=true o módulo serve a fixture do Piloto
// de /piloto/analise.json, os mesmos 54 itens e 8 números-chave que a API
// devolve. A fixture fica em public/ e é buscada, não importada: importar
// colocaria 120 KB de JSON no bundle de quem nunca abre a aba.

export const MODO_SIMULADO = import.meta.env.VITE_ANALISE_MOCK === 'true'

const BASE = '/analise'
const FIXTURE = '/piloto/analise.json'

let piloto = null

async function fixture() {
  if (!piloto) {
    const resposta = await fetch(FIXTURE)
    if (!resposta.ok) {
      throw new Error('Não foi possível carregar os dados do Piloto.')
    }
    piloto = await resposta.json()
    // O estado da revisão no modo simulado vive aqui, em memória: recarregar a
    // página volta tudo a pendente. É honesto para uma demonstração, e evita
    // dar a impressão de que a decisão ficou registrada em algum lugar.
    piloto.itens = piloto.itens.map(i => ({ ...i, revisao: { ...i.revisao } }))
  }
  return piloto
}

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

export async function listarAnalises(emissor) {
  if (MODO_SIMULADO) return [(await fixture()).analise]
  const consulta = emissor ? `?emissor=${encodeURIComponent(emissor)}` : ''
  return pedir(`/api/analises${consulta}`)
}

export async function criarAnalise(emissor) {
  if (MODO_SIMULADO) return (await fixture()).analise
  return pedir('/api/analises', { method: 'POST', body: JSON.stringify({ emissor }) })
}

export async function obterAnalise(id) {
  if (MODO_SIMULADO) {
    const dados = await fixture()
    return { ...dados.analise, etapas: dados.etapas }
  }
  return pedir(`/api/analises/${encodeURIComponent(id)}`)
}

export async function obterResumo(id) {
  if (MODO_SIMULADO) {
    const dados = await fixture()
    return {
      analise: dados.analise,
      etapas: dados.etapas,
      sumario: dados.sumario,
      numeros_chave: dados.numeros_chave,
      destaques: dados.destaques,
      cobertura: coberturaDe(dados.itens),
      bloqueios_para_publicar: bloqueiosDe(dados.itens),
    }
  }
  return pedir(`/api/analises/${encodeURIComponent(id)}/resumo`)
}

export async function listarItens(id, { tema, revisao } = {}) {
  if (MODO_SIMULADO) {
    const dados = await fixture()
    return dados.itens.filter(
      i => (!tema || i.tema === tema) && (!revisao || i.revisao?.status === revisao),
    )
  }
  const parametros = new URLSearchParams()
  if (tema) parametros.set('tema', tema)
  if (revisao) parametros.set('revisao', revisao)
  const consulta = parametros.toString()
  return pedir(`/api/analises/${encodeURIComponent(id)}/itens${consulta ? `?${consulta}` : ''}`)
}

export async function listarFontes(id) {
  if (MODO_SIMULADO) return (await fixture()).fontes
  return pedir(`/api/analises/${encodeURIComponent(id)}/fontes`)
}

export async function obterIndice(id) {
  // O índice do relatório inteiro, para o que não entra no Piloto aparecer
  // como "não entra" em vez de simplesmente não existir.
  if (MODO_SIMULADO) return (await fixture()).indice
  const resumo = await pedir(`/api/analises/${encodeURIComponent(id)}/resumo`)
  return resumo.indice || []
}

export async function revisarItem(id, itemId, { decisao, motivo, textoAjustado }) {
  // A API recusa rejeição sem motivo e ajuste sem texto. A tela valida antes
  // para o analista não perder o que escreveu numa ida ao servidor.
  if (decisao === 'rejeitado' && !motivo?.trim()) {
    throw new Error('A rejeição exige motivo.')
  }
  if (decisao === 'ajustado' && !textoAjustado?.trim()) {
    throw new Error('O ajuste exige o texto revisado.')
  }

  if (MODO_SIMULADO) {
    const dados = await fixture()
    const item = dados.itens.find(i => i.id === itemId)
    if (item) {
      item.revisao = { status: decisao, usuario: 'simulado', motivo: motivo || null, em: new Date().toISOString() }
      if (decisao === 'ajustado') {
        item.conteudo = textoAjustado
        item.origem_texto = 'analista'
      }
    }
    const pendentes = dados.itens.filter(i => i.revisao?.status === 'pendente').length
    return { item, pendentes }
  }

  return pedir(`/api/analises/${encodeURIComponent(id)}/itens/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ decisao, motivo, texto_ajustado: textoAjustado }),
  })
}

export async function decidirVersao(id, { decisao, justificativa }) {
  if (decisao !== 'aprovar' && !justificativa?.trim()) {
    throw new Error('Devolver ou rejeitar exige justificativa.')
  }
  if (MODO_SIMULADO) {
    return { decisao, usuario: 'simulado', simulado: true }
  }
  return pedir(`/api/analises/${encodeURIComponent(id)}/decisao`, {
    method: 'POST',
    body: JSON.stringify({ decisao, justificativa }),
  })
}

export async function publicar(id) {
  if (MODO_SIMULADO) {
    const dados = await fixture()
    const pendentes = dados.itens.filter(i => i.revisao?.status === 'pendente').length
    if (pendentes) {
      throw new Error(`Publicação bloqueada: ${pendentes} item(ns) pendente(s) de revisão.`)
    }
    return {
      versao: { versao: 'v1.0', aprovador: 'simulado', hash: '0'.repeat(64) },
      baseline: { enviado: false, motivo: 'modo simulado: nada foi enviado ao Monitoramento' },
    }
  }
  return pedir(`/api/analises/${encodeURIComponent(id)}/publicar`, { method: 'POST' })
}

// Reprocessar: aciona o Agente Analista de Crédito, que gera o relatório, e
// depois remonta a tela a partir do roteiro. A resposta diz o que aconteceu em
// cada metade, porque a segunda acontece mesmo que a primeira falhe.
export async function reprocessar(id) {
  if (MODO_SIMULADO) {
    throw new Error(
      'Reprocessar aciona o agente no Orchestrate e precisa da analise-api.',
    )
  }
  return pedir(`/api/analises/${encodeURIComponent(id)}/reprocessar`, { method: 'POST' })
}

// Exportação, etapa 8. O .docx vem pronto do servidor; o PDF é a impressão
// do HTML que o servidor monta, com @page A4 já definido.
//
// Não há PDF gerado no backend de propósito: exigiria um motor de renderização
// no container, e seria um terceiro renderizador para manter igual aos outros
// dois. O navegador que mostra a tela imprime o mesmo documento.
export function urlExportacao(id, formato = 'docx') {
  return `${BASE}/api/analises/${encodeURIComponent(id)}/export?formato=${formato}`
}

export function exportar(id, formato = 'docx') {
  if (MODO_SIMULADO) {
    throw new Error(
      'A exportação precisa da analise-api: o modo simulado serve os dados de um arquivo.',
    )
  }
  if (formato === 'pdf') {
    // Abre o HTML e manda imprimir. `print()` só dispara depois que a janela
    // carregou, senão imprime a página em branco.
    const janela = window.open(urlExportacao(id, 'html'), '_blank')
    if (!janela) throw new Error('O navegador bloqueou a janela de impressão.')
    janela.addEventListener('load', () => janela.print())
    return
  }
  window.location.href = urlExportacao(id, 'docx')
}

export function urlStream(id) {
  return `${BASE}/api/analises/${encodeURIComponent(id)}/stream`
}

// ── Cobertura no modo simulado ─────────────────────────────────────────
//
// Repete a regra de `analise/cobertura.py`: o item vale pela evidência mais
// forte. Está aqui só para a demonstração sem backend; em produção o número
// vem calculado da API, que é onde a regra mora de verdade.

export function tipoDeEvidencia(item) {
  const tipos = new Set((item.evidencias || []).map(e => e.tipo_fonte))
  return ['fonte', 'atualizada', 'parcial'].find(t => tipos.has(t)) || 'nao_localizado'
}

function coberturaDe(itens) {
  const porTipo = { fonte: 0, parcial: 0, atualizada: 0, nao_localizado: 0 }
  itens.forEach(i => { porTipo[tipoDeEvidencia(i)] += 1 })
  const total = itens.length
  const comEvidencia = total - porTipo.nao_localizado
  const revisao = { pendente: 0, aprovado: 0, ajustado: 0, rejeitado: 0 }
  itens.forEach(i => { revisao[i.revisao?.status || 'pendente'] += 1 })
  return {
    evidencia: {
      por_tipo: porTipo,
      total,
      com_evidencia: comEvidencia,
      percentual_com_evidencia: total ? Math.round((1000 * comEvidencia) / total) / 10 : 0,
      referencias: itens.reduce((soma, i) => soma + (i.evidencias?.length || 0), 0),
    },
    revisao,
  }
}

function bloqueiosDe(itens) {
  const pendentes = itens.filter(i => (i.revisao?.status || 'pendente') === 'pendente').length
  return pendentes ? [`${pendentes} item(ns) pendente(s) de revisao`] : []
}
