// Vocabulário de níveis, compartilhado pelos componentes da aba.
// A ordem e os nomes vêm da seção 4, item 3, do handoff de Monitoramento.

export const NIVEIS = {
  informativo: { rotulo: 'Informativo', tag: 'gray', ordem: 0 },
  atencao: { rotulo: 'Atenção', tag: 'cyan', ordem: 1 },
  relevante: { rotulo: 'Relevante', tag: 'magenta', ordem: 2 },
  critico: { rotulo: 'Crítico', tag: 'red', ordem: 3 },
  bloqueio: { rotulo: 'Bloqueio', tag: 'red', ordem: 4 },
}

export const nivelDe = n => NIVEIS[n] || NIVEIS.informativo

// Formata número no padrão brasileiro, com a unidade do próprio dado.
export function formatar(valor, unidade) {
  if (valor === null || valor === undefined) return '—'
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  const casas = unidade === 'R$ mi' || unidade === '%' || unidade === 'p.p.' ? 1 : 2
  const texto = n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
  if (unidade === 'x') return `${texto}x`
  if (unidade === '%') return `${texto}%`
  if (unidade === 'p.p.') return `${texto} p.p.`
  if (unidade === 'R$ mi') return `R$ ${texto} mi`
  return unidade ? `${texto} ${unidade}` : texto
}

export function formatarVariacao(valor, unidade) {
  if (valor === null || valor === undefined) return '—'
  const sinal = Number(valor) > 0 ? '+' : ''
  return `${sinal}${formatar(valor, unidade)}`
}

// "ITR-2T26-ECORODOVIAS.pdf, p. 26"
export function rotuloFonte(fonte) {
  if (!fonte?.documento) return ''
  if (fonte.pagina) return `${fonte.documento}, p. ${fonte.pagina}`
  if (fonte.aba) return `${fonte.documento}, aba "${fonte.aba}", linha ${fonte.linha}`
  return fonte.documento
}
