// Inconsistências registradas em quadros herdados do relatório anterior (30/10/2026, decidido com o usuário e o Kimi).
//
// O analista registra uma vez o erro conhecido num quadro herdado (ex.: a linha de FCFF que cai de 1 em 1): o quadro
// sai com alerta no relatório e a publicação para o comitê fica bloqueada até alguém com o papel de publicar
// ASSUMIR para aquele relatório (justificativa obrigatória; o alerta continua no PDF, com quem e quando), ou o quadro
// ser corrigido num relatório anterior novo (DOCX novo: até alguém confirmar, a pendência fica "reavaliar").
//
// O registro fica em relatorio_anterior/<empresa>/inconsistencias.json, ao lado do manifesto do DOCX. A mesma regra
// de situação está em relatorio-creditos/tools/acervo/relatorio_anterior.py (a montagem do alerta).

// {estado: aberta|reavaliar|assumida|corrigida|nenhuma, bloqueia}: a mesma regra de relatorio_anterior.situacao.
export function situacao(entrada, docxAtual, relatorioId) {
  if (!entrada) return { estado: 'nenhuma', bloqueia: false }
  const corrigida = entrada.corrigida || null
  if (corrigida && corrigida.docx === docxAtual) return { estado: 'corrigida', bloqueia: false, ...corrigida }
  const assumida = (entrada.assumidas || {})[relatorioId]
  if (entrada.docx && docxAtual && entrada.docx !== docxAtual) return { estado: 'reavaliar', bloqueia: true }
  if (assumida) return { estado: 'assumida', bloqueia: false, ...assumida }
  return { estado: 'aberta', bloqueia: true }
}

const pastaDe = chave => String(chave || '').split('/').slice(0, -1).join('/')

// Quadros herdados desta versão do relatório: os itens do resumo com origem "herdado" (a montagem guarda a chave da
// imagem, cuja pasta é a do relatório anterior da empresa).
export function herdadosDoResumo(resumo) {
  return (resumo.itens || [])
    .filter(i => i.origem === 'herdado' && i.herdado_chave && (i.refs || []).length)
    .map(i => ({ item_id: i.id, referencia: i.refs[0], pasta: pastaDe(i.herdado_chave), texto: i.texto }))
}

// Situação de cada quadro herdado do relatório, lendo o registro e o manifesto atuais (nunca um resumo antigo).
export async function inconsistenciasDoRelatorio(resumo, lerJson) {
  const herdados = herdadosDoResumo(resumo)
  const pastas = {}
  for (const pasta of new Set(herdados.map(h => h.pasta))) {
    const [registro, manifesto] = await Promise.all([lerJson(`${pasta}/inconsistencias.json`), lerJson(`${pasta}/manifesto.json`)])
    pastas[pasta] = { registro: registro || { itens: {} }, docx: manifesto?.docx || '' }
  }
  return herdados.map(h => {
    const { registro, docx } = pastas[h.pasta]
    const entrada = (registro.itens || {})[h.referencia] || null
    return { ...h, entrada, docx_atual: docx, ...situacao(entrada, docx, resumo.relatorio_id) }
  })
}

// O que bloqueia a publicação: inconsistência aberta ou a reavaliar; e decisão mais nova que a versão na tela (o
// alerta ainda não está no relatório que iria ao comitê).
export function bloqueiosDeInconsistencia(inconsistencias, resumo) {
  const bloqueios = []
  const abertas = inconsistencias.filter(i => i.bloqueia)
  if (abertas.length) {
    bloqueios.push(`${abertas.length} inconsistência(s) no modelo sem decisão: assuma para o comitê ou corrija no `
      + `relatório anterior (${abertas.map(i => descricaoCurta(i.texto)).join('; ')})`)
  }
  const ultima = inconsistencias.map(i => ultimaDecisao(i.entrada, resumo.relatorio_id)).filter(Boolean).sort().pop()
  if (ultima && resumo.atualizado_em && ultima > resumo.atualizado_em) {
    bloqueios.push('versão com o alerta de inconsistência ainda não chegou: aguarde a versão nova')
  }
  return bloqueios
}

const descricaoCurta = texto => String(texto || '').split(' – ')[0].slice(0, 80)

function ultimaDecisao(entrada, relatorioId) {
  if (!entrada) return null
  return [entrada.em, entrada.assumidas?.[relatorioId]?.em, entrada.corrigida?.em].filter(Boolean).sort().pop() || null
}

// Altera o registro de uma empresa. Lança Error com .status (400/403/409) para recusar.
export function aplicarAcao(registro, { acao, referencia, texto, usuario, agora, relatorioId, docxAtual, podeDecidir }) {
  registro.itens = registro.itens || {}
  registro.historico = registro.historico || []
  const entrada = registro.itens[referencia]
  const s = situacao(entrada, docxAtual, relatorioId)
  const recusa = (status, mensagem) => Object.assign(new Error(mensagem), { status })
  const textoLimpo = String(texto || '').trim()
  if (acao === 'registrar') {
    if (s.estado === 'aberta' || s.estado === 'reavaliar' || s.estado === 'assumida') {
      throw recusa(409, 'Este quadro já tem uma inconsistência registrada.')
    }
    if (textoLimpo.length < 10) throw recusa(400, 'Descreva a inconsistência (pelo menos 10 caracteres).')
    registro.itens[referencia] = { descricao: textoLimpo, docx: docxAtual, registrado_por: usuario, em: agora, assumidas: {} }
  } else if (acao === 'assumir') {
    if (!podeDecidir) throw recusa(403, 'Seu perfil não pode assumir inconsistências para o comitê.')
    if (s.estado !== 'aberta') throw recusa(409, 'Só uma inconsistência aberta pode ser assumida.')
    if (textoLimpo.length < 10) throw recusa(400, 'A justificativa é obrigatória (pelo menos 10 caracteres).')
    entrada.assumidas = { ...(entrada.assumidas || {}), [relatorioId]: { por: usuario, em: agora, justificativa: textoLimpo } }
  } else if (acao === 'corrigida') {
    if (!podeDecidir) throw recusa(403, 'Seu perfil não pode confirmar a correção.')
    if (s.estado !== 'reavaliar') {
      throw recusa(409, 'Só depois de um relatório anterior novo: o quadro herdado ainda é o mesmo em que o erro foi registrado.')
    }
    if (textoLimpo.length < 10) throw recusa(400, 'Diga o que foi corrigido (pelo menos 10 caracteres).')
    entrada.corrigida = { por: usuario, em: agora, docx: docxAtual, justificativa: textoLimpo }
  } else {
    throw recusa(400, 'Ação inválida.')
  }
  registro.historico.push({ em: agora, usuario, acao, referencia, relatorio_id: relatorioId, texto: textoLimpo })
  registro.atualizado_em = agora
  return registro.itens[referencia]
}
