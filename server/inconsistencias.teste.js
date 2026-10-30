// Teste das inconsistências nos quadros herdados (inconsistencias.js), sem COS. Para no primeiro erro.
// Uso: node server/inconsistencias.teste.js
import { aplicarAcao, bloqueiosDeInconsistencia, herdadosDoResumo, inconsistenciasDoRelatorio, situacao } from './inconsistencias.js'

function ok(condicao, mensagem, extra = '') {
  console.log(condicao ? 'OK  ' : 'ERRO', mensagem, condicao ? '' : JSON.stringify(extra).slice(0, 600))
  if (!condicao) { console.log('PAROU NO PRIMEIRO ERRO'); process.exit(1) }
}
function recusa(fn) {
  try { fn() } catch (e) { return e } return null
}

const R1 = 'alfa-2o-trimestre-de--20261030-090000'
const R2 = 'alfa-2o-trimestre-de--20261031-090000'
const base = { usuario: 'ana@x', agora: '2026-10-30T10:00:00Z', relatorioId: R1, docxAtual: 'D1', podeDecidir: true }

ok(situacao(null, 'D1', R1).estado === 'nenhuma', 'sem registro: nenhuma, não bloqueia')
const registro = { itens: {} }
ok(recusa(() => aplicarAcao(registro, { ...base, acao: 'registrar', referencia: 'E-385', texto: 'curto' }))?.status === 400,
  'descrição curta é recusada')
aplicarAcao(registro, { ...base, acao: 'registrar', referencia: 'E-385', texto: 'FCFF cai de 1 em 1 na tabela do modelo' })
ok(situacao(registro.itens['E-385'], 'D1', R1).estado === 'aberta', 'registrada: aberta e bloqueia')
ok(recusa(() => aplicarAcao(registro, { ...base, acao: 'registrar', referencia: 'E-385', texto: 'outra descrição longa' }))?.status === 409,
  'o mesmo quadro não é registrado duas vezes')
ok(recusa(() => aplicarAcao(registro, { ...base, acao: 'assumir', referencia: 'E-385', texto: 'justificativa ok aqui', podeDecidir: false }))?.status === 403,
  'assumir exige o papel de publicar')
ok(recusa(() => aplicarAcao(registro, { ...base, acao: 'assumir', referencia: 'E-385', texto: '' }))?.status === 400,
  'assumir exige justificativa')
ok(recusa(() => aplicarAcao(registro, { ...base, acao: 'corrigida', referencia: 'E-385', texto: 'corrigido no modelo' }))?.status === 409,
  'não dá para marcar corrigida com o mesmo DOCX')
aplicarAcao(registro, { ...base, acao: 'assumir', referencia: 'E-385', texto: 'comitê ciente; modelo será revisto' })
ok(situacao(registro.itens['E-385'], 'D1', R1).estado === 'assumida', 'assumida para este relatório: não bloqueia')
ok(situacao(registro.itens['E-385'], 'D1', R2).estado === 'aberta', 'outro relatório do mesmo DOCX: continua aberta')
ok(situacao(registro.itens['E-385'], 'D2', R1).estado === 'reavaliar', 'DOCX novo: reavaliar (bloqueia), mesmo assumida antes')
aplicarAcao(registro, { ...base, acao: 'corrigida', referencia: 'E-385', texto: 'linha de FCFF refeita', docxAtual: 'D2' })
ok(situacao(registro.itens['E-385'], 'D2', R2).estado === 'corrigida', 'corrigida no DOCX novo: some')
ok(registro.historico.length === 3 && registro.historico.every(h => h.usuario === 'ana@x'), 'histórico com quem e o quê')

const resumo = {
  relatorio_id: R1, atualizado_em: '2026-10-30T09:00:00Z', itens: [
    { id: 's16a-1', origem: 'herdado', herdado_chave: 'relatorio_anterior/alfa/abc.png', refs: ['E-385'], texto: 'Fluxo – Herdado' },
    { id: 's10-2', origem: 'documento', refs: [], texto: 'x' }],
}
ok(herdadosDoResumo(resumo).length === 1 && herdadosDoResumo(resumo)[0].pasta === 'relatorio_anterior/alfa',
  'quadros herdados do resumo, com a pasta do relatório anterior')
const novo = { itens: {} }
aplicarAcao(novo, { ...base, acao: 'registrar', referencia: 'E-385', texto: 'EBIT duplicado no Anexo I' })
const ler = async chave => ({ 'relatorio_anterior/alfa/inconsistencias.json': novo, 'relatorio_anterior/alfa/manifesto.json': { docx: 'D1' } })[chave] ?? null
const lista = await inconsistenciasDoRelatorio(resumo, ler)
ok(lista.length === 1 && lista[0].estado === 'aberta', 'situação lida do registro na hora', lista)
const bloqueios = bloqueiosDeInconsistencia(lista, resumo)
ok(bloqueios.some(b => b.includes('sem decisão')), 'aberta bloqueia a publicação', bloqueios)
ok(bloqueios.some(b => b.includes('ainda não chegou')), 'decisão mais nova que a versão na tela também bloqueia', bloqueios)
const emDia = bloqueiosDeInconsistencia(lista, { ...resumo, atualizado_em: '2026-10-30T11:00:00Z' })
ok(emDia.length === 1, 'versão já com o alerta: só o bloqueio da aberta', emDia)
console.log('TUDO OK')
