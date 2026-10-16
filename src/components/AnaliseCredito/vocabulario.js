// Vocabulário da aba Análise de Crédito, compartilhado pelos componentes.
//
// Mesma ideia do `niveis.js` do Monitoramento: os rótulos ficam num lugar só,
// porque várias telas mostram os mesmos estados (cartões, painel de revisão,
// seções, aba Desempenho) e um nome divergente entre elas é lido como estado
// diferente.

// Tipo de fonte do item, o mesmo do relatório: laranja para fonte, vermelho
// para ausência, como no template.
export const EVIDENCIA = {
  fonte: { rotulo: 'Fonte', tag: 'green', classe: 'ok' },
  parcial: { rotulo: 'Fonte parcial', tag: 'teal', classe: 'parcial' },
  atualizada: { rotulo: 'Fonte, versão atualizada', tag: 'cyan', classe: 'atualizada' },
  nao_localizado: { rotulo: 'Não localizado', tag: 'red', classe: 'ausente' },
}

export const evidenciaDe = tipo => EVIDENCIA[tipo] || EVIDENCIA.nao_localizado

// Categoria de revisão: o que precisa ser revisado no item. O rótulo e a
// descrição vêm do resumo (`categorias_revisao`), calculados por código no
// monitor; aqui fica só a cor, da mais grave (vermelho) para a mais leve.
export const COR_CATEGORIA = {
  montagem: 'red',
  numero_removido: 'red',
  preencher: 'magenta',
  nao_extraido: 'purple',
  fonte_ausente: 'red',
  desatualizado: 'cyan',
  outra_entidade: 'warm-gray',
  informacao_incompleta: 'teal',
  dado_interno: 'blue',
  conferir: 'green',
}

export const corDaCategoria = id => COR_CATEGORIA[id] || 'gray'

// Estado da revisão humana de um item.
export const REVISAO = {
  pendente: { rotulo: 'Pendente', tag: 'gray' },
  aprovado: { rotulo: 'Aprovado', tag: 'green' },
  ajustado: { rotulo: 'Ajustado', tag: 'blue' },
  rejeitado: { rotulo: 'Rejeitado', tag: 'red' },
}

export const revisaoDe = status => REVISAO[status] || REVISAO.pendente

// Estado da versão do relatório.
export const STATUS_VERSAO = {
  em_revisao: { rotulo: 'em revisão', tag: 'blue' },
  devolvida: { rotulo: 'devolvida para ajuste', tag: 'magenta' },
  publicada: { rotulo: 'publicada', tag: 'green' },
}

// Linha de fonte da evidência, como no relatório:
// "ITR-2T26-ECORODOVIAS.pdf, p. 26 (impressa 24), Nota 16".
export function rotuloEvidencia(evidencia) {
  if (!evidencia) return ''
  if (typeof evidencia === 'string') return evidencia
  if (evidencia.texto) return evidencia.texto
  const partes = [evidencia.arquivo]
  if (evidencia.pagina) partes.push(`p. ${evidencia.pagina}`)
  if (evidencia.local) partes.push(evidencia.local)
  return partes.filter(Boolean).join(', ')
}

// Seção do item no relatório: "10. Endividamento > e. Covenants apurados".
export function caminhoDoItem(item) {
  return [item.secao_titulo, item.subsecao_titulo].filter(Boolean).join(' > ')
}

// Âncora da seção no HTML do relatório (o quadro-resumo é "sumario").
export function ancoraDaSecao(secao) {
  return secao === 'S' ? 'sumario' : `secao-${secao}`
}

// Número no padrão brasileiro. A unidade vem do próprio dado.
export function formatar(valor, unidade = '', casas) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  if (typeof valor === 'string') return valor
  // Múltiplos com até duas casas (3,87x; 4,1x); valores grandes sem casas.
  const decimais = casas ?? (Math.abs(valor) >= 1000 ? 0 : 1)
  const texto = Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: casas ?? (unidade === 'x' ? 2 : decimais),
  })
  if (unidade === 'x') return `${texto}x`
  if (unidade === '%') return `${texto}%`
  return unidade ? `${texto} ${unidade}` : texto
}

// "12 s", "3 min 05 s"
export function duracao(segundos) {
  if (segundos === null || segundos === undefined) return '—'
  if (segundos < 60) return `${segundos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
  const m = Math.floor(segundos / 60)
  return `${m} min ${String(Math.round(segundos % 60)).padStart(2, '0')} s`
}

export function dataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
