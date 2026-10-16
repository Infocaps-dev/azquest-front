// Revisão e publicação dos relatórios: regras puras, sem acesso ao COS (testáveis à parte).
//
// A revisão de um relatório fica em revisoes/<relatorio_id>.json:
//   { relatorio_id, itens: { <item_id>: {status, motivo, texto_ajustado, texto, versao, usuario, em} },
//     decisao: {status, versao, justificativa, usuario, em}, historico: [...] }
//
// Cada decisão guarda o texto do item que foi revisado. Numa versão nova do relatório (alteração pelo agente), o item
// cujo texto mudou volta a pendente, com a decisão anterior à vista: aprovar um texto não aprova o texto que entrou
// no lugar dele. Item com o mesmo texto mantém a decisão.
//
// Ajuste: a decisão guarda o texto original (`texto_original`) e o novo (`texto`). Enquanto o ajuste não entra no
// relatório, ele vale contra o texto original e fica `aplicacao.status = aguardando`; "Gerar versão nova" manda todos
// os ajustes aguardando num pedido só (ajustes/<id>/<pedido>.json), o job do monitor publica a versão nova com eles,
// e a decisão passa a valer contra o texto novo.

export const DECISOES = ['aprovado', 'ajustado', 'rejeitado']
export const TIPOS_AJUSTAVEIS = ['texto', 'lista', 'campo']

// Mesma limpeza que a montagem faz no texto do item (marcadores, negrito, espaços), para comparar textos.
export function normalizar(texto) {
  return (texto || '')
    .replace(/\{(?:A[~+]?|R|T|AJ):[^}]*\}/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\{/g, '(').replace(/\}/g, ')')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:])/g, '$1')
    .trim()
}

export function revisaoVazia(relatorioId) {
  return { relatorio_id: relatorioId, itens: {}, decisao: null, historico: [] }
}

export function validarDecisao({ decisao, motivo, texto_ajustado: texto }) {
  if (!DECISOES.includes(decisao)) return 'Decisão inválida: use aprovado, ajustado ou rejeitado.'
  if (decisao === 'rejeitado' && !motivo?.trim()) return 'A rejeição exige motivo.'
  if (decisao === 'ajustado' && !texto?.trim()) return 'O ajuste exige o texto revisado.'
  return null
}

function quem(usuario) {
  return usuario?.email || usuario?.name || 'desconhecido'
}

// Aplica decisões a itens do resumo. Devolve os ids que não existem no relatório.
export function decidir(revisao, resumo, ids, { decisao, motivo, texto_ajustado: texto }, usuario, agora) {
  const porId = Object.fromEntries((resumo.itens || []).map(i => [i.id, i]))
  const faltando = ids.filter(id => !porId[id])
  for (const id of ids.filter(i => porId[i])) {
    const ajuste = decisao === 'ajustado' ? normalizar(texto) : null
    revisao.itens[id] = {
      status: decisao,
      motivo: motivo?.trim() || null,
      texto_ajustado: ajuste,
      texto: ajuste ?? porId[id].texto,
      texto_original: ajuste ? porId[id].texto : null,
      bruto: ajuste ? porId[id].bruto : null,
      aplicacao: ajuste ? { status: 'aguardando' } : null,
      categoria: porId[id].categoria,
      versao: resumo.versao,
      usuario: quem(usuario),
      em: agora,
    }
  }
  revisao.historico.push({ em: agora, usuario: quem(usuario), acao: decisao, itens: ids.filter(i => porId[i]),
    motivo: motivo?.trim() || null })
  revisao.historico = revisao.historico.slice(-500)
  return faltando
}

// Ajustes que ainda não entraram no relatório: aguardando o "Gerar versão nova" ou com erro na aplicação.
function ajustesNaoAplicados(resumo, revisao) {
  return (resumo.itens || [])
    .map(item => [item, revisao.itens[item.id]])
    .filter(([item, r]) => r?.status === 'ajustado' && r.aplicacao?.status !== 'aplicado'
      && r.aplicacao?.status !== 'enviado' && normalizar(r.texto_original) === normalizar(item.texto))
}

// Pedido de versão nova com os ajustes aguardando. Devolve null se não há nada para aplicar.
export function pedidoDeAjustes(resumo, revisao, usuario, agora) {
  const itens = ajustesNaoAplicados(resumo, revisao).filter(([, r]) => r.aplicacao?.status === 'aguardando')
  if (!itens.length) return null
  const pedidoId = `${agora.replace(/[^0-9]/g, '')}-${Math.random().toString(36).slice(2, 8)}`
  for (const [item] of itens) revisao.itens[item.id].aplicacao = { status: 'enviado', pedido: pedidoId }
  revisao.ajuste_pendente = { pedido_id: pedidoId, em: agora, versao_base: resumo.versao, itens: itens.length }
  revisao.historico.push({ em: agora, usuario: quem(usuario), acao: 'versão nova pedida', itens: itens.map(([i]) => i.id) })
  return {
    pedido_id: pedidoId, relatorio_id: resumo.relatorio_id, versao_base: resumo.versao, usuario: quem(usuario),
    em: agora, itens: itens.map(([item, r]) => ({ item_id: item.id, bruto: r.bruto, texto_novo: r.texto_ajustado })),
  }
}

// Estado da revisão para a versão atual do resumo: decisão por item, contagens e o que bloqueia a publicação.
export function estadoDaRevisao(resumo, revisao) {
  const itens = {}
  const contagem = { pendente: 0, aprovado: 0, ajustado: 0, rejeitado: 0 }
  const pendentesPorCategoria = {}
  for (const item of resumo.itens || []) {
    const r = revisao.itens[item.id]
    const atual = normalizar(item.texto)
    // O ajuste ainda não aplicado vale contra o texto original; depois da versão nova, contra o texto ajustado.
    const vale = r && (normalizar(r.texto) === atual
      || (r.status === 'ajustado' && r.aplicacao?.status !== 'aplicado' && normalizar(r.texto_original) === atual))
    itens[item.id] = vale ? r : { status: 'pendente', ...(r ? { anterior: r } : {}) }
    contagem[itens[item.id].status] += 1
    if (!vale) pendentesPorCategoria[item.categoria] = (pendentesPorCategoria[item.categoria] || 0) + 1
  }
  const naoAplicados = ajustesNaoAplicados(resumo, revisao)
  const aguardando = naoAplicados.filter(([, r]) => r.aplicacao?.status === 'aguardando').length
  const comErro = naoAplicados.filter(([, r]) => r.aplicacao?.status === 'erro').length
  const pendente = revisao.ajuste_pendente || null
  const decisaoValida = revisao.decisao && revisao.decisao.versao === resumo.versao ? revisao.decisao : null
  const bloqueios = []
  if (contagem.pendente) bloqueios.push(`${contagem.pendente} item(ns) pendente(s) de revisão`)
  if (contagem.rejeitado) {
    bloqueios.push(`${contagem.rejeitado} item(ns) rejeitado(s): corrija pelo agente (versão nova) ou ajuste o texto`)
  }
  if (aguardando) bloqueios.push(`${aguardando} ajuste(s) fora do relatório: gere a versão nova`)
  if (comErro) bloqueios.push(`${comErro} ajuste(s) não aplicado(s): veja o erro no item e ajuste de novo`)
  if (pendente) bloqueios.push('versão nova com os ajustes em geração')
  return {
    relatorio_id: resumo.relatorio_id,
    versao: resumo.versao,
    itens,
    contagem,
    pendentes_por_categoria: pendentesPorCategoria,
    status: decisaoValida?.status || 'em_revisao',
    decisao: decisaoValida,
    ajustes: { aguardando, com_erro: comErro, pedido: pendente },
    bloqueios_para_publicar: decisaoValida?.status === 'publicada' ? [] : bloqueios,
    historico: revisao.historico.slice(-50).reverse(),
  }
}
