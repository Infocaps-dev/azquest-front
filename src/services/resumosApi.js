// Cliente da resumos-api: os resumos dos relatórios de crédito gerados pelo agente.
//
// As chamadas vão para /resumos, que o Vite encaminha para a resumos-api (ver
// vite.config.js). A API não tem login próprio: confere a sessão do BFF de
// autenticação pelo cookie, que vai junto sozinho por ser a mesma origem.
//
// Cada relatório gerado ou alterado no agente vira, em segundos, uma linha no
// índice e um resumo completo. O formato está em
// relatorio-creditos/monitor_resumo/LEIAME.md.

const BASE = '/resumos'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, {
    ...opcoes,
    headers: { Accept: 'application/json', ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    const erro = new Error(corpo.detail || `Falha em ${rota} (HTTP ${resposta.status})`)
    // 409 com versao_atual: o relatório mudou enquanto a tela estava aberta (a tela recarrega e avisa).
    if (corpo.versao_atual) erro.versaoAtual = corpo.versao_atual
    throw erro
  }
  return resposta.json()
}

// {atualizado_em, total, relatorios: [...]}, do mais recente para o mais antigo.
// Cada linha: relatorio_id, empresa, periodo, referencia, versao, atualizado_em,
// rating, alavancagem_consolidada, alavancagem_ecs, folga_covenant,
// ebitda_ajustado, divida_liquida, pontos_atencao, numeros_removidos,
// nao_localizados.
export function listarResumos() {
  return pedir('/api/resumos')
}

// Resumo completo: sumario, ratings, indicadores, covenants, pontos de atenção
// e fortes, documentos e validação. `link.url` abre o HTML (vale 1 hora).
export function obterResumo(id) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}`)
}

// Endereço para abrir o relatório numa aba nova (a API redireciona para o HTML).
export function enderecoRelatorio(id, versao) {
  const consulta = versao ? `?versao=${encodeURIComponent(versao)}` : ''
  return `${BASE}/api/relatorios/${encodeURIComponent(id)}${consulta}`
}

// HTML servido pela própria API (mesma origem): é o que o iframe do relatório
// completo carrega, para poder rolar até a âncora (#item-E-070, #secao-10-e).
export function enderecoHtml(id, versao) {
  const consulta = versao ? `?versao=${encodeURIComponent(versao)}` : ''
  return `${BASE}/api/relatorios/${encodeURIComponent(id)}/html${consulta}`
}

// A versão N do relatório já foi publicada? O agente grava relatorios/<id>-vN.html no instante em que a edição
// termina, antes de o monitor refazer o resumo: é o sinal mais cedo de que a versão nova existe. HEAD, sem baixar
// o HTML; qualquer falha conta como "ainda não".
export async function versaoPublicada(id, versao) {
  try {
    const resposta = await fetch(enderecoHtml(id, versao), { method: 'HEAD', cache: 'no-store' })
    return resposta.ok
  } catch {
    return false
  }
}

// Registra o pedido de edição de um trecho (botão "Editar" do relatório completo): {versao, ancora, textos} → {pedido_id}.
// A API grava quem pediu, pela sessão; o agente recebe só o número e a tool de edição lê o registro para marcar o texto
// novo como do analista, mantendo os números que ele digitou.
export function registrarEdicao(id, { versao, ancora, textos }) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}/edicoes`, {
    method: 'POST', body: JSON.stringify({ versao, ancora, textos }),
  })
}

// Baseline vigente do emissor: o da última versão publicada na Análise de
// Crédito (null enquanto nada foi publicado). Fonte dos dados de referência.
export async function obterBaselineVigente(emissor) {
  const resposta = await fetch(`${BASE}/api/baselines/${encodeURIComponent(emissor)}`, {
    headers: { Accept: 'application/json' },
  })
  if (resposta.status === 404) return null
  if (!resposta.ok) throw new Error(`Falha ao ler o baseline (HTTP ${resposta.status})`)
  return resposta.json()
}

// ── Revisão e publicação ────────────────────────────────────────────────
//
// A revisão vale para a versão atual do relatório. Cada decisão guarda o texto
// revisado: numa versão nova, o item cujo texto mudou volta a pendente, com a
// decisão anterior em `anterior`.

// {itens: {id: {status, motivo, texto_ajustado, usuario, em, anterior?}},
//  contagem, pendentes_por_categoria, status, decisao, bloqueios_para_publicar, historico}
export function obterRevisao(id) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}/revisao`)
}

// Toda decisão leva a `versao` do relatório que está na tela: se ela mudou no
// meio-tempo, a API recusa (409) em vez de aprovar um texto que ninguém viu.

// decisao: aprovado | ajustado | rejeitado. Rejeitar exige motivo; ajustar, o texto.
export async function decidirItem(id, itemId, { decisao, motivo, textoAjustado, versao }) {
  if (decisao === 'rejeitado' && !motivo?.trim()) throw new Error('A rejeição exige motivo.')
  if (decisao === 'ajustado' && !textoAjustado?.trim()) throw new Error('O ajuste exige o texto revisado.')
  return pedir(`/api/resumos/${encodeURIComponent(id)}/itens/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ versao, decisao, motivo, texto_ajustado: textoAjustado }),
  })
}

// Vários itens de uma vez (seção, categoria, filtro). Ajuste é sempre um a um.
export function decidirLote(id, itens, { decisao, motivo, versao }) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}/revisao/lote`, {
    method: 'POST',
    body: JSON.stringify({ versao, itens, decisao, motivo }),
  })
}

// Gera a versão nova do relatório com todos os ajustes aguardando (um pedido
// por vez). A resposta volta logo, com `ajustes.pedido`; a versão nova chega
// em segundos, publicada pelo job do monitor, e então `ajustes.pedido` some.
export function aplicarAjustes(id, versao) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}/ajustes/aplicar`, {
    method: 'POST', body: JSON.stringify({ versao }),
  })
}

export function devolver(id, justificativa, versao) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}/devolver`, {
    method: 'POST',
    body: JSON.stringify({ versao, justificativa }),
  })
}

// Exige todos os itens revisados e nenhum rejeitado. Devolve o estado da
// revisão e `baseline` ({enviado, motivo}) do envio ao Monitoramento.
export function publicar(id, versao) {
  return pedir(`/api/resumos/${encodeURIComponent(id)}/publicar`, { method: 'POST', body: JSON.stringify({ versao }) })
}
