// Baseline do Monitoramento (etapa 1.5) a partir do relatório publicado na Análise de Crédito.
//
// O baseline é a referência com que a monitor-api compara cada trimestre novo (alavancagem contra a última tese,
// distância ao gatilho de rating, projeções...). O v0 foi copiado à mão do relatório de mar/26. Ao publicar uma versão,
// este módulo parte do baseline vigente e troca só o que vinha do RELATÓRIO DE REFERÊNCIA pelos dados do relatório
// publicado. O que veio direto dos documentos extraídos (limites e apurações de covenant das escrituras e dos agentes
// fiduciários, ratings, vencimentos, compliance) fica como está.
//
// O que o relatório publicado ainda não traz (hoje, as projeções do Anexo I, que estão no Excel do analista) continua
// herdado do baseline anterior, listado em `herdados_da_referencia`, para ninguém ler um número antigo como novo.

// Fonte que aponta para o relatório de referência antigo (o .docx do Piloto) ou para uma publicação anterior.
const DA_REFERENCIA = /relat[óo]rio de cr[ée]dito/i

function daReferencia(entrada) {
  const fontes = [entrada?.fonte, entrada?.fonte_limite, entrada?.fonte_apurado].filter(Boolean)
  return entrada?.origem === 'relatorio_publicado' || fontes.some(f => DA_REFERENCIA.test(f.documento || ''))
}

const numeroBr = texto => Number(String(texto).replace(/\./g, '').replace(',', '.'))

function fimDoPeriodo(periodo) {
  const m = /^(\d)T(\d{2})$/.exec(periodo || '')
  if (!m) return null
  const mes = Number(m[1]) * 3
  const dia = [31, 30, 30, 31][Number(m[1]) - 1]
  return `20${m[2]}-${String(mes).padStart(2, '0')}-${dia}`
}

export function emissorCanonico(empresa) {
  return /ecorodovias/i.test(empresa || '') ? 'Ecorodovias' : (empresa || '').trim()
}

// Fonte de um dado do baseline: o relatório publicado (com a âncora do item) e o documento de onde ele veio.
function fonteDoRelatorio(resumo, ancora, original) {
  return {
    documento: `Relatório de crédito ${resumo.empresa} ${resumo.periodo}, versão ${resumo.versao} (publicada)`,
    relatorio_id: resumo.relatorio_id,
    versao: resumo.versao,
    ancora: ancora || null,
    ...(original ? { fonte_original: original } : {}),
  }
}

// Troca (ou acrescenta) a entrada com o id, a não ser que a atual tenha vindo de documento extraído.
function substituir(lista, nova) {
  const i = lista.findIndex(x => x.id === nova.id)
  if (i < 0) lista.push(nova)
  else if (daReferencia(lista[i])) lista[i] = nova
}

// R$ 51 bilhões, ~R$11bi → R$ mi
function bilhoesEmMilhoes(texto) {
  const m = /R\$\s*~?\s*(\d+(?:[.,]\d+)?)\s*(?:bi\b|bilh)/i.exec(texto || '')
  return m ? Math.round(numeroBr(m[1]) * 1000) : null
}

// "Alavancagem consolidada consistentemente acima de 4,5 vezes (Fitch)" → gatilho de downgrade em 4,5x.
export function gatilhoDoTexto(item) {
  const texto = item.texto || ''
  const m = /(acima|superior|pr[óo]xim[ao]|abaixo|inferior)\s+(?:a|de|do)?\s*(\d+(?:,\d+)?)\s*(?:vezes|x)\b/i.exec(texto)
  if (!m || !/alavancagem|d[íi]vida l[íi]quida/i.test(texto)) return null
  const sobe = /acima|superior/i.test(m[1])
  const agencia = /\((Fitch|S&P|Moody'?s)\)/i.exec(texto)?.[1] || null
  return {
    agencia,
    tipo: sobe ? 'downgrade' : 'upgrade',
    metrica: 'dl_ebitda_consolidado',
    comparacao: sobe ? 'acima' : 'abaixo',
    limite: numeroBr(m[2]),
    condicao: texto.replace(/\s*\((Fitch|S&P|Moody'?s)\)\s*/i, ' ').trim(),
    fonte_primaria_ausente: item.tipo_fonte === 'nao_localizado',
  }
}

export function baselineAtualizado(anterior, resumo, usuario, agora) {
  const base = anterior ? structuredClone(anterior) : {}
  for (const k of ['metricas', 'limites', 'gatilhos_rating', 'ratings', 'projecoes', 'premissas', 'vencimentos_relevantes']) {
    if (!Array.isArray(base[k])) base[k] = []
  }
  const ind = resumo.indicadores || {}
  const alav = ind.alavancagem || {}
  const cartao = id => (resumo.numeros_chave || []).find(n => n.id === id)
  const itens = resumo.itens || []
  const origem = 'relatorio_publicado'

  // Métricas da tese
  if (alav.consolidada?.valor != null) {
    substituir(base.metricas, { id: 'dl_ebitda_consolidado', origem,
      descricao: 'Alavancagem consolidada, Divida Liquida sobre EBITDA ajustado', valor: alav.consolidada.valor,
      unidade: 'x', periodo: resumo.periodo, fonte: fonteDoRelatorio(resumo, 'secao-10-b', alav.consolidada.fonte) })
  }
  const ebitda = cartao('ebitda_ajustado_ltm')
  if (ebitda) {
    substituir(base.metricas, { id: 'ebitda_ajustado', origem, descricao: 'EBITDA ajustado dos ultimos 12 meses',
      valor: ebitda.valor, unidade: 'R$ mi', periodo: ebitda.periodo,
      fonte: fonteDoRelatorio(resumo, 'secao-9-a', ebitda.fonte) })
    const margem = /margem ([\d,]+)%/.exec(ebitda.contexto || '')
    if (margem) {
      substituir(base.metricas, { id: 'margem_ebitda_ajustada', origem,
        descricao: 'Margem EBITDA ajustada dos ultimos 12 meses', valor: numeroBr(margem[1]), unidade: '%',
        periodo: ebitda.periodo, fonte: fonteDoRelatorio(resumo, 'secao-9-a', ebitda.fonte) })
    }
  }
  if (ind.divida_liquida?.valor != null) {
    substituir(base.metricas, { id: 'divida_liquida', origem, descricao: 'Divida liquida', valor: ind.divida_liquida.valor,
      unidade: 'R$ mi', periodo: resumo.periodo, fonte: fonteDoRelatorio(resumo, 'secao-10-b', ind.divida_liquida.fonte) })
  }
  // Número que o relatório traz no texto aprovado do sumário: capex a realizar. (O do BNDES não entra: o texto diz
  // "já contratados" e a fonte diz "a desembolsar"; fica herdado até o texto ser revisto.)
  const doSumario = itens.filter(i => i.secao === 'S')
  const capex = doSumario.find(i => /capex/i.test(i.texto) && bilhoesEmMilhoes(i.texto))
  if (capex) {
    substituir(base.metricas, { id: 'capex_contratual_a_realizar', origem, descricao: 'Capex contratual a realizar',
      valor: bilhoesEmMilhoes(capex.texto), unidade: 'R$ mi', periodo: resumo.periodo, aproximado: true,
      fonte: fonteDoRelatorio(resumo, capex.ancora, capex.evidencias?.[0]?.texto) })
  }
  // Gatilhos de rating: a seção 17b (sensibilidade do rating) do relatório aprovado.
  const gatilhos = itens.filter(i => i.secao === '17' && i.subsecao === 'b').map(i => {
    const g = gatilhoDoTexto(i)
    return g && { ...g, origem, fonte: fonteDoRelatorio(resumo, i.ancora, i.evidencias?.[0]?.texto) }
  }).filter(Boolean)
  if (gatilhos.length && base.gatilhos_rating.every(daReferencia)) base.gatilhos_rating = gatilhos

  // Premissas das projeções: o texto do Anexo I do relatório aprovado.
  const premissas = itens.filter(i => i.secao === 'A1' && ['texto', 'lista'].includes(i.tipo) && !/^Tabela:/i.test(i.texto))
    .map(i => ({ id: i.id, texto: i.texto, origem, fonte: fonteDoRelatorio(resumo, i.ancora, i.evidencias?.[0]?.texto) }))
  if (premissas.length && base.premissas.every(daReferencia)) base.premissas = premissas

  // O que ainda vem do relatório de referência antigo: aparece listado, nunca como dado novo.
  const herdados = []
  for (const k of ['metricas', 'limites', 'gatilhos_rating', 'projecoes', 'premissas']) {
    base[k].forEach(x => {
      if (x.origem !== origem && daReferencia(x)) herdados.push(`${k}: ${x.id || x.metrica || x.agencia}${x.ano ? ` ${x.ano}` : ''}`)
    })
  }

  return {
    ...base,
    emissor: base.emissor || emissorCanonico(resumo.empresa),
    versao: `${resumo.periodo}-v${resumo.versao}`,
    data_base: fimDoPeriodo(resumo.periodo) || base.data_base,
    origem: `Relatório de crédito ${resumo.relatorio_id}, versão ${resumo.versao}`,
    relatorio_id: resumo.relatorio_id,
    relatorio_versao: resumo.versao,
    baseline_anterior: anterior?.versao || null,
    publicado_por: usuario?.email || usuario?.name || null,
    publicado_em: agora,
    herdados_da_referencia: herdados,
    observacao: herdados.length
      ? 'Baseline da versão publicada. Itens em herdados_da_referencia ainda vêm do relatório de referência anterior.'
      : 'Baseline da versão publicada do relatório.',
  }
}
