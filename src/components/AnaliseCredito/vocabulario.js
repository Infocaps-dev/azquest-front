// Vocabulário da aba Análise de Crédito, compartilhado pelos componentes.
//
// Mesma ideia do `niveis.js` do Monitoramento: os rótulos ficam num lugar só,
// porque quatro telas mostram os mesmos estados -- a faixa do processo, os
// cartões, a gaveta e o relatório completo -- e um nome divergente entre elas
// é lido como estado diferente.

// Os seis passos do ciclo de construção da tese, como na seção 2 do handoff.
// O código A1 a A6 é a chave na API e no banco; o nome é o que se lê.
export const ETAPAS_DO_FLUXO = {
  A1: 'Consolidar informações',
  A2: 'Atualizar modelo',
  A3: 'Tese e relatório',
  A4: 'Definir o baseline',
  A5: 'Revisão e aprovação',
  A6: 'Publicar a tese',
}

export const nomeDaEtapa = codigo => ETAPAS_DO_FLUXO[codigo] || codigo || ''

export const ESTADO_DA_ETAPA = {
  pendente: 'Pendente',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
  aguardando_humano: 'Aguardando você',
  // A2 não é um passo que alguém esqueceu: as projeções seguem no Excel do
  // analista, por decisão de escopo. "Pendente" diria que ainda vai acontecer.
  fora_do_mvp: 'Fora do MVP',
  falhou: 'Falhou',
}

// Tipo de evidência. A cor repete a do template da Marcela: laranja para
// fonte, vermelho para ausência, verde para o comentário do analista.
export const EVIDENCIA = {
  fonte: { rotulo: 'Fonte', tag: 'green', classe: 'ok' },
  parcial: { rotulo: 'Fonte parcial', tag: 'teal', classe: 'parcial' },
  atualizada: { rotulo: 'Fonte, versão atualizada', tag: 'cyan', classe: 'atualizada' },
  nao_localizado: { rotulo: 'Não localizado', tag: 'red', classe: 'ausente' },
}

export const evidenciaDe = tipo => EVIDENCIA[tipo] || EVIDENCIA.nao_localizado

// Estado da revisão humana de um item ou cartão.
export const REVISAO = {
  pendente: { rotulo: 'Pendente', tag: 'gray' },
  aprovado: { rotulo: 'Aprovado', tag: 'green' },
  ajustado: { rotulo: 'Ajustado', tag: 'blue' },
  rejeitado: { rotulo: 'Rejeitado', tag: 'red' },
}

export const revisaoDe = status => REVISAO[status] || REVISAO.pendente

// O item vale pela evidência mais forte. Mesma regra de `cobertura.py`: um
// parágrafo com uma fonte plena e outra parcial está sustentado.
export function tipoDeEvidencia(item) {
  const tipos = new Set((item?.evidencias || []).map(e => e.tipo_fonte))
  return ['fonte', 'atualizada', 'parcial'].find(t => tipos.has(t)) || 'nao_localizado'
}

// "ITR-2T26-ECORODOVIAS.pdf, p. 26 (Nota 16)"
export function rotuloEvidencia(evidencia) {
  if (!evidencia) return ''
  const partes = [evidencia.arquivo]
  if (evidencia.pagina) partes.push(`p. ${evidencia.pagina}`)
  const base = partes.filter(Boolean).join(', ')
  return evidencia.trecho ? `${base} (${evidencia.trecho})` : base
}

// Número no padrão brasileiro. A unidade vem do próprio dado: a API já
// converteu R$ mil para R$ mi onde fazia sentido, e guardou o valor de origem.
export function formatar(valor, unidade = '', casas) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const decimais = casas ?? (Math.abs(valor) >= 1000 ? 0 : 2)
  const texto = Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  })
  if (unidade === 'x') return `${texto}x`
  if (unidade === '%') return `${texto}%`
  return unidade ? `${texto} ${unidade}` : texto
}
