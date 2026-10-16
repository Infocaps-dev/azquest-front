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

// Nome de cada etapa do ciclo, como na proposta (Fluxo do Ciclo de Crédito).
//
// Fica aqui, e não em cada componente, porque três telas mostram as mesmas
// etapas -- a linha do processo, o feed de atividade e o cartão de destino --
// e um nome divergente entre elas seria lido como etapa diferente.
//
// O código B1 a B8 continua sendo a chave: é assim que o handoff, a API, o
// banco e o agente do Orchestrate se referem a cada passo. O que sai é o
// código no texto que uma pessoa lê -- "destino B6" não diz nada a quem não
// decorou a lista.
export const ETAPAS_DO_FLUXO = {
  B1: 'Capturar eventos',
  B2: 'Classificar e relacionar',
  B3: 'Comparar com o baseline',
  B4: 'Mudança material?',
  B5: 'Registrar sem impacto',
  B6: 'Análise de impacto',
  B7: 'Revisão extraordinária?',
  B8: 'Emitir alerta',
}

export const nomeDaEtapa = codigo => ETAPAS_DO_FLUXO[codigo] || codigo || ''

// Troca o código do passo pelo nome dentro de um texto já escrito.
//
// As mensagens de etapa ficam gravadas no banco, e as de ciclos anteriores
// foram escritas quando o texto ainda dizia "destino B6". Corrigir a origem
// resolve dali para a frente; isto resolve o que já está gravado, sem reescrever
// o registro -- o que a API devolve continua sendo o que foi gravado.
//
// Só troca o código isolado: "ERDVB3" não tem fronteira de palavra antes do
// B3 e fica intacto.
// Código de passo isolado: precedido de início de texto ou de um caractere
// que não é letra nem dígito, e não seguido de letra ou dígito. É o que
// separa "destino B3" de "ERDVB3 - Escritura.pdf", que tem de ficar intacto.
const CODIGO_ISOLADO = /(^|[^0-9A-Za-z])B([1-8])(?![0-9A-Za-z])/g

export function semCodigos(texto) {
  if (!texto) return texto || ''
  return String(texto).replace(CODIGO_ISOLADO, (todo, antes, n) =>
    antes + (ETAPAS_DO_FLUXO['B' + n] || 'B' + n))
}


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

// Normaliza a lista de fontes, qualquer que seja a forma que chegou.
//
// A monitor-api guarda `fontes` numa coluna JSON do MySQL, e o PyMySQL a
// entregava como texto: a API prometia uma lista e devolvia uma string. O
// guard anterior era `(etapa.fontes || []).length > 0`, que uma string passa,
// porque string tem length -- e o `.map` seguinte derrubava a aba inteira com
// tela em branco, por nao haver error boundary.
//
// A API foi corrigida na origem. Esta funcao fica porque a tela que mostra o
// andamento de um ciclo de credito nao deve desaparecer por causa do tipo de
// um campo: sem fonte legivel, mostra-se o resto.
export function listaDeFontes(valor) {
  if (Array.isArray(valor)) return valor
  if (!valor) return []
  if (typeof valor === 'string') {
    try {
      const lido = JSON.parse(valor)
      return Array.isArray(lido) ? lido : [lido]
    } catch {
      return []
    }
  }
  if (typeof valor === 'object') return [valor]
  return []
}

// "ITR-2T26-ECORODOVIAS.pdf, p. 26"
export function rotuloFonte(fonte) {
  if (!fonte?.documento) return ''
  if (fonte.pagina) return `${fonte.documento}, p. ${fonte.pagina}`
  if (fonte.aba) return `${fonte.documento}, aba "${fonte.aba}", linha ${fonte.linha}`
  return fonte.documento
}

// Etapas que o roteamento não vai percorrer neste ciclo.
//
// O fluxo se divide em B4: havendo impacto material ele segue pela análise,
// não havendo ele termina no registro. A etapa do caminho que não foi tomado
// nunca vai acontecer -- e chamá-la de "pendente" diz o contrário, que ela
// ainda está por vir. Num ciclo já fechado, era a única coisa na tela que
// parecia inacabada.
const FORA_DO_CAMINHO = {
  // Houve impacto material: não há o que registrar como evento sem impacto.
  B6: ['B5'],
  // Não houve: o ciclo termina no registro, sem análise, sem revisão
  // extraordinária e sem alerta para a Gestão.
  B5: ['B6', 'B7', 'B8'],
}

// Verdadeiro quando o roteamento deste ciclo passou por fora da etapa.
//
// Só vale para etapa que continua pendente: se ela chegou a rodar -- um ciclo
// recalculado que mudou de caminho, por exemplo -- o que aconteceu de fato
// vale mais do que o roteamento atual.
export function foraDoCaminho(etapa, destino) {
  if (!destino || etapa?.status !== 'pendente') return false
  return (FORA_DO_CAMINHO[destino] || []).includes(etapa.etapa)
}
