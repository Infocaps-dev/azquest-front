// Nome com que cada documento entra no bucket de entrada.
//
// O nome não é detalhe: a extração grava o JSON com o nome do arquivo, e as tools do acervo (gerar relatório,
// consultas do chat) reconhecem o documento por ele. Um ITR só conta como trimestre se chamar ITR-3T26-<EMISSOR>,
// a DFP só vira o 4T se chamar DFP-2025-<EMISSOR>, o release é RR-<tri>, a apresentação AR-<tri> e a planilha de RI
// Balanco-DRE-FC-<aaaa>-<mm>. Fora desse padrão o documento é extraído, mas nenhum relatório o usa.
//
// O tipo (a pasta) vem da analise-api, que lê a capa; daqui só saem o período e o nome. Escritura, agente fiduciário
// e rating mantêm o nome do arquivo: o código do documento sai dele (série da emissão, agência).

const PERIODO_DO_TIPO = {
  itr: 'trimestre', dfp: 'ano', release: 'trimestre', apresentacao: 'trimestre', institucional: 'mes', ri: 'mes',
  escritura: 'livre', af: 'ano', rating: 'mes',
}

// Tipos cujo nome é montado aqui, e por isso pedem o período.
const PADRONIZADOS = new Set(['itr', 'dfp', 'release', 'apresentacao', 'institucional', 'ri'])

const FORMATOS = {
  trimestre: { re: /^[1-4]T\d{2}$/, exemplo: '3T26' },
  ano: { re: /^(19|20)\d{2}$/, exemplo: '2025' },
  mes: { re: /^(19|20)\d{2}-(0[1-9]|1[0-2])$/, exemplo: '2026-09' },
  livre: { re: /^.{0,40}$/, exemplo: 'ERDVB3' },
}

// Tipo lido do nome, no padrão dos documentos que já estão no acervo. Aceita variações ("ITR 3T26", "itr_3t2026",
// "1Q26", "2º tri 2026", "2026_06").
const TIPO_NO_NOME = [
  ['itr', /^itr\b|\bitr[\s_-]/i],
  ['dfp', /^dfp\b|\bdfp[\s_-]/i],
  ['apresentacao', /^ar[\s_-]|apresenta/i],
  ['release', /^rr[\s_-]|release/i],
  ['ri', /balan[cç]o[\s_-]*dre|planilha[\s_-]*(?:de[\s_-]*)?ri\b|^ri[\s_-]/i],
  ['escritura', /escritura/i],
  ['af', /relat[oó]rio[\s_-]*af\b|agente[\s_-]*fiduci/i],
  ['rating', /^(?:sp|s&p|fitch|moody)\b|rating/i],
]

export function pedePeriodo(tipo) {
  return PADRONIZADOS.has(tipo)
}

export function formatoDoPeriodo(tipo) {
  return FORMATOS[PERIODO_DO_TIPO[tipo] || 'livre']
}

export function periodoValido(tipo, periodo) {
  return formatoDoPeriodo(tipo).re.test((periodo || '').trim().toUpperCase())
}

function anoCurto(ano) {
  return String(ano).slice(-2)
}

// Período que o nome do arquivo diz, no formato do tipo; '' quando não diz.
// O trimestre ("2T26") no formato de período do tipo: ITR, release e apresentação "2T26"; DFP o exercício fechado
// ("2025"; no 4T, o do próprio ano); planilha de RI o mês do fim do trimestre ("2026-06"). '' nos demais tipos.
export function periodoDoTrimestre(tipo, trimestre) {
  const m = /^([1-4])T(\d{2})$/.exec(trimestre || '')
  // A institucional sai todo mês: o mês do fim do trimestre seria um chute; fica para quem envia dizer o mês.
  if (!m || !PADRONIZADOS.has(tipo) || tipo === 'institucional') return ''
  const tri = Number(m[1])
  const ano = 2000 + Number(m[2])
  const formato = PERIODO_DO_TIPO[tipo]
  if (formato === 'trimestre') return trimestre
  if (formato === 'ano') return String(tri === 4 ? ano : ano - 1)
  if (formato === 'mes') return `${ano}-${String(tri * 3).padStart(2, '0')}`
  return ''
}

// O trimestre a que o período do tipo se refere: a DFP de 2025 é o 4T25; a planilha de 2026-05, o 2T26. '' se não der.
export function trimestreDoPeriodo(tipo, periodo) {
  const p = (periodo || '').trim().toUpperCase()
  if (!periodoValido(tipo, p) || !PADRONIZADOS.has(tipo)) return ''
  const formato = PERIODO_DO_TIPO[tipo]
  if (formato === 'trimestre') return p
  if (formato === 'ano') return `4T${p.slice(2)}`
  if (formato === 'mes') return `${Math.ceil(Number(p.slice(5)) / 3)}T${p.slice(2, 4)}`
  return ''
}

export function periodoDoNome(nome, tipo) {
  const base = nome.replace(/\.[a-z0-9]+$/i, '')
  const formato = PERIODO_DO_TIPO[tipo]
  const trimestre = /(?:^|[^a-z0-9])([1-4])\s*[TQ]\s*((?:20)?\d{2})(?![0-9])/i.exec(base)
    || /([1-4])\s*[ºo°]?\s*tri\w*\s*(?:de\s*)?((?:20)?\d{2})(?![0-9])/i.exec(base)
  if (formato === 'trimestre') return trimestre ? `${trimestre[1]}T${anoCurto(trimestre[2])}` : ''
  if (formato === 'mes') {
    // "2026-08" ou, no nome do site de RI, a data inteira ("20260813_ecorodovias_apresentacao_mercado").
    const m = /((?:19|20)\d{2})[\s_.-](0[1-9]|1[0-2])(?![0-9])/.exec(base)
      || /(?:^|[^0-9])((?:19|20)\d{2})(0[1-9]|1[0-2])(?:[0-3]\d)?(?![0-9])/.exec(base)
    return m ? `${m[1]}-${m[2]}` : ''
  }
  if (formato === 'ano') {
    const anos = base.match(/(?:19|20)\d{2}(?![0-9])/g)
    if (anos) return anos[anos.length - 1]
    // "ITR-4T25-ECORODOVIAS.pdf" que a capa mostra ser DFP: o 4T25 é o exercício de 2025.
    return trimestre && trimestre[1] === '4' ? `20${anoCurto(trimestre[2])}` : ''
  }
  return ''
}

// Release, apresentação de resultados ou apresentação institucional: a pasta é a mesma (release/), o prefixo do
// nome não (RR-, AR- ou AP-). A institucional ("Apresentação da Companhia", que o site de RI publica todo mês) tem o
// mês no nome, não o trimestre; tratada como AR- ela sobrescreveria a apresentação de resultados (30/10/2026).
export function subtipoDoNome(nome) {
  if (/^ap[\s_-]\d{4}|apresenta[cç][aã]o[\s_-]*(?:da[\s_-]*companhia|institucional|(?:de[\s_-]*)?mercado)|apresentacao_mercado/i
    .test(nome)) return 'institucional'
  return /^ar[\s_-]|apresenta/i.test(nome) ? 'apresentacao' : 'release'
}

export function tipoDoNome(nome) {
  return (TIPO_NO_NOME.find(([, re]) => re.test(nome)) || [''])[0]
}

export function nomePadronizado({ arquivo, tipo, periodo, emissor }) {
  const extensao = (arquivo.split('.').pop() || '').toLowerCase()
  const empresa = (emissor || '').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const p = (periodo || '').trim().toUpperCase()
  if (!p || !PADRONIZADOS.has(tipo)) return arquivo
  if (tipo === 'itr') return `ITR-${p}-${empresa}.${extensao}`
  if (tipo === 'dfp') return `DFP-${p}-${empresa}.${extensao}`
  if (tipo === 'release') return `RR-${p}-${empresa}.${extensao}`
  if (tipo === 'apresentacao') return `AR-${p}-${empresa}.${extensao}`
  if (tipo === 'institucional') return `AP-${p}-${empresa}.${extensao}`
  return `Balanco-DRE-FC-${p}.${extensao}`
}
