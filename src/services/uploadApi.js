// Cliente do serviço de envio de documentos (upload para o Cloud Object Storage).
//
// As chamadas vão para /upload, que o Vite encaminha ao serviço em desenvolvimento (VITE_UPLOAD_TARGET, ver
// vite.config.js) e o nginx em produção, quando o serviço existir. A sessão é a do BFF: o cookie vai junto por ser a
// mesma origem, e o serviço confere quem enviou (como a resumos-api faz).
//
// Contrato que a tela espera do serviço:
//   GET  /upload/api/health
//        200 {"status": "ok"}                      (qualquer outra coisa: "serviço não conectado")
//   POST /upload/api/arquivos                      multipart/form-data
//        campos: arquivo (o arquivo), emissor, tipo (itr | dfp | release | apresentacao | ri | escritura | af |
//                rating), pasta (a pasta no bucket, ver TIPOS), periodo (ex.: 3T26, 2025, 2026-09),
//                nome_destino (nome padronizado, ver nomePadronizado)
//        201 {"id", "chave": "<pasta>/<nome>", "status": "recebido", "enviado_em", "usuario"}
//        4xx {"detail": "motivo"}                   (a tela mostra o motivo no arquivo)
//   GET  /upload/api/arquivos?limite=20
//        200 {"arquivos": [{"id", "nome", "chave", "tipo", "emissor", "periodo", "tamanho", "enviado_em",
//                           "usuario", "status": "recebido" | "extraindo" | "no_acervo" | "erro", "detalhe"?}]}
// A pasta no bucket (itr/, dfp/, release/, ri/, escritura/, af/, rating/) é onde a extração procura cada tipo.
//
// Modo simulado: com VITE_UPLOAD_MOCK=true a tela simula o envio (progresso e resposta), sem serviço, para
// demonstração. Sem ele e sem o serviço no ar, a tela avisa que o envio não está conectado e não envia nada.

export const MODO_SIMULADO = import.meta.env.VITE_UPLOAD_MOCK === 'true'

const BASE = '/upload'

// Tipos de documento que o acervo lê, com a pasta no bucket, as extensões aceitas e o formato do período.
export const TIPOS = [
  { id: 'itr', pasta: 'itr', nome: 'ITR trimestral', extensoes: ['pdf'], periodo: 'trimestre' },
  { id: 'dfp', pasta: 'dfp', nome: 'DFP anual', extensoes: ['pdf'], periodo: 'ano' },
  { id: 'release', pasta: 'release', nome: 'Release de resultados', extensoes: ['pdf'], periodo: 'trimestre' },
  { id: 'apresentacao', pasta: 'release', nome: 'Apresentação de resultados', extensoes: ['pdf'], periodo: 'trimestre' },
  { id: 'ri', pasta: 'ri', nome: 'Planilha de RI', extensoes: ['xlsx', 'xls'], periodo: 'mes' },
  { id: 'escritura', pasta: 'escritura', nome: 'Escritura de emissão', extensoes: ['pdf'], periodo: 'livre' },
  { id: 'af', pasta: 'af', nome: 'Relatório do agente fiduciário', extensoes: ['pdf'], periodo: 'ano' },
  { id: 'rating', pasta: 'rating', nome: 'Relatório de rating', extensoes: ['pdf'], periodo: 'mes' },
]

export const TAMANHO_MAXIMO = 50 * 1024 * 1024 // 50 MB por arquivo

const FORMATOS = {
  trimestre: { re: /^[1-4]T\d{2}$/, exemplo: '3T26' },
  ano: { re: /^(19|20)\d{2}$/, exemplo: '2025' },
  mes: { re: /^(19|20)\d{2}-(0[1-9]|1[0-2])$/, exemplo: '2026-09' },
  livre: { re: /^.{0,40}$/, exemplo: 'ERDVB3' },
}

export function formatoDoPeriodo(tipo) {
  return FORMATOS[TIPOS.find(t => t.id === tipo)?.periodo || 'livre']
}

// Tipo e período lidos do nome do arquivo, no padrão dos documentos que já estão no acervo:
//   itr/ ITR-2T26-ECORODOVIAS.pdf          dfp/ DFP-2025-ECORODOVIAS.pdf
//   release/ RR-2T26-ECORODOVIAS.pdf (release), AR-2T26-ECORODOVIAS.pdf (apresentação)
//   ri/ Balanco-DRE-FC-2026-06.xlsx         escritura/ ERDVB3-Escritura.pdf
//   af/ ERDVB3-Relatorio-AF-2025.pdf        rating/ SP-17a-emissao-2026-08.pdf, Fitch - ... - 2026-08.pdf
// Aceita variações ("ITR 3T26", "itr_3t2026", "1Q26", "2º tri 2026", "2026_06"). O que o nome não diz fica vazio.
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

function anoCurto(ano) {
  return String(ano).slice(-2)
}

export function periodoDoNome(nome, tipo) {
  const base = nome.replace(/\.[a-z0-9]+$/i, '')
  const formato = TIPOS.find(t => t.id === tipo)?.periodo
  if (formato === 'trimestre') {
    const t = /(?:^|[^a-z0-9])([1-4])\s*[TQ]\s*((?:20)?\d{2})(?![0-9])/i.exec(base)
      || /([1-4])\s*[ºo°]?\s*tri\w*\s*(?:de\s*)?((?:20)?\d{2})(?![0-9])/i.exec(base)
    return t ? `${t[1]}T${anoCurto(t[2])}` : ''
  }
  if (formato === 'mes') {
    const m = /((?:19|20)\d{2})[\s_.-](0[1-9]|1[0-2])(?![0-9])/.exec(base)
    return m ? `${m[1]}-${m[2]}` : ''
  }
  if (formato === 'ano') {
    const anos = base.match(/(?:19|20)\d{2}(?![0-9])/g)
    return anos ? anos[anos.length - 1] : ''
  }
  if (tipo === 'escritura') {
    const serie = /^([A-Z0-9]{4,8})[\s_-]/.exec(base)
    return serie ? serie[1] : ''
  }
  return ''
}

// {tipo, periodo}: o que o nome diz (vazio no que não diz).
export function lerNomeDoArquivo(nome) {
  const tipo = (TIPO_NO_NOME.find(([, re]) => re.test(nome)) || [''])[0]
  return { tipo, periodo: tipo ? periodoDoNome(nome, tipo) : '' }
}

export function periodoValido(tipo, periodo) {
  return formatoDoPeriodo(tipo).re.test((periodo || '').trim().toUpperCase())
}

// Problema do arquivo para o tipo escolhido, ou '' se está tudo certo.
export function validarArquivo(arquivo, tipo) {
  const t = TIPOS.find(x => x.id === tipo)
  const extensao = (arquivo.name.split('.').pop() || '').toLowerCase()
  if (t && !t.extensoes.includes(extensao)) return `${t.nome} aceita ${t.extensoes.map(e => `.${e}`).join(' ou ')}`
  if (arquivo.size > TAMANHO_MAXIMO) return `Arquivo maior que ${TAMANHO_MAXIMO / 1024 / 1024} MB`
  if (arquivo.size === 0) return 'Arquivo vazio'
  return ''
}

// Nome com que o arquivo entra no bucket, no padrão dos documentos que a extração já lê
// (ITR-2T26-ECORODOVIAS.pdf, DFP-2025-ECORODOVIAS.pdf, Balanco-DRE-FC-2026-06.xlsx). Escritura, agente fiduciário e
// rating mantêm o nome do arquivo: o código do documento sai dele (série da emissão, agência).
export function nomePadronizado({ arquivo, tipo, periodo, emissor }) {
  const extensao = (arquivo.name.split('.').pop() || '').toLowerCase()
  const empresa = (emissor || '').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const p = (periodo || '').trim().toUpperCase()
  if (tipo === 'itr' && p) return `ITR-${p}-${empresa}.${extensao}`
  if (tipo === 'dfp' && p) return `DFP-${p}-${empresa}.${extensao}`
  if (tipo === 'release' && p) return `RR-${p}-${empresa}.${extensao}`
  if (tipo === 'apresentacao' && p) return `AR-${p}-${empresa}.${extensao}`
  if (tipo === 'ri' && p) return `Balanco-DRE-FC-${p}.${extensao}`
  return arquivo.name
}

const esperar = ms => new Promise(resolve => { setTimeout(resolve, ms) })

// {conectado, simulado, motivo}
export async function situacao() {
  if (MODO_SIMULADO) return { conectado: true, simulado: true }
  try {
    const resposta = await fetch(`${BASE}/api/health`, { headers: { Accept: 'application/json' } })
    const tipo = resposta.headers.get('content-type') || ''
    // Sem o serviço, o /upload cai na própria página (HTML): isso não é "conectado".
    if (!resposta.ok || !tipo.includes('application/json')) return { conectado: false, motivo: `HTTP ${resposta.status}` }
    const corpo = await resposta.json()
    return { conectado: corpo?.status === 'ok', motivo: corpo?.status }
  } catch (e) {
    return { conectado: false, motivo: e.message }
  }
}

// Envia um arquivo; onProgresso(0..100) durante o envio. XMLHttpRequest e não fetch: é o que dá o progresso do envio.
export function enviarArquivo({ arquivo, emissor, tipo, periodo }, onProgresso, sinal) {
  const nome = nomePadronizado({ arquivo, tipo, periodo, emissor })
  if (MODO_SIMULADO) return simularEnvio({ arquivo, emissor, tipo, periodo, nome }, onProgresso, sinal)
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('arquivo', arquivo, arquivo.name)
    form.append('emissor', emissor)
    form.append('tipo', tipo)
    form.append('pasta', TIPOS.find(t => t.id === tipo)?.pasta || tipo)
    form.append('periodo', periodo)
    form.append('nome_destino', nome)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/arquivos`)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgresso?.(Math.round((100 * e.loaded) / e.total)) }
    xhr.onload = () => {
      let corpo = {}
      try { corpo = JSON.parse(xhr.responseText || '{}') } catch { /* resposta sem JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(corpo)
      else reject(new Error(corpo.detail || `Falha no envio (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Sem resposta do serviço de envio'))
    xhr.onabort = () => reject(Object.assign(new Error('Envio cancelado'), { name: 'AbortError' }))
    sinal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

// Envios recentes (os do serviço; no modo simulado, os desta sessão).
const simulados = []

export async function listarEnvios(limite = 20) {
  if (MODO_SIMULADO) return { arquivos: simulados.slice(0, limite) }
  const resposta = await fetch(`${BASE}/api/arquivos?limite=${limite}`, { headers: { Accept: 'application/json' } })
  if (!resposta.ok) throw new Error(`Falha ao listar os envios (HTTP ${resposta.status})`)
  return resposta.json()
}

async function simularEnvio({ arquivo, emissor, tipo, periodo, nome }, onProgresso, sinal) {
  for (let p = 0; p <= 100; p += 10) {
    if (sinal?.aborted) throw Object.assign(new Error('Envio cancelado'), { name: 'AbortError' })
    onProgresso?.(p)
    await esperar(120)
  }
  const registro = {
    id: `sim-${Date.now()}`, nome, chave: `${TIPOS.find(t => t.id === tipo)?.pasta || tipo}/${nome}`, tipo, emissor, periodo, tamanho: arquivo.size,
    enviado_em: new Date().toISOString(), usuario: 'simulação', status: 'recebido',
  }
  simulados.unshift(registro)
  return registro
}
