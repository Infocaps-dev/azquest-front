// Cliente da coleta-api: dispara o crawler de fontes públicas e acompanha o andamento.
//
// As chamadas vão para /coleta, que o nginx (produção) e o Vite (desenvolvimento) encaminham para a coleta-api com
// o prefixo retirado. A sessão é o cookie do BFF, que viaja junto por ser a mesma origem.
//
// Andamento por polling, não SSE: o ingress do Code Engine bufferiza o stream e entrega tudo no fim (ver README).

const BASE = '/coleta'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opcoes,
  })
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    throw new Error(corpo.detail || `Falha em ${rota} (HTTP ${resposta.status})`)
  }
  return resposta.json()
}

export const listarEmissores = () => pedir('/api/emissores')

export const listarColetas = emissor =>
  pedir(`/api/coletas${emissor ? `?emissor=${encodeURIComponent(emissor)}` : ''}`)

export const obterColeta = id => pedir(`/api/coletas/${encodeURIComponent(id)}`)

// A API recusa com 409 quando já há coleta em andamento: duas abas abertas são dois botões, e só o servidor vê os dois.
// `periodo` (2T26): o trimestre do kit; sem ele, o da configuração do emissor.
export const dispararColeta = ({ emissor, fontes, upload, periodo }) =>
  pedir('/api/coletas', { method: 'POST', body: JSON.stringify({ emissor, fontes, upload, periodo: periodo || null }) })

export const resumoExtracao = (emissor, chave) =>
  pedir(`/api/extracoes?emissor=${encodeURIComponent(emissor)}&chave=${encodeURIComponent(chave)}`)

export const urlArquivoExtracao = (emissor, chave) =>
  `${BASE}/api/extracoes/arquivo?emissor=${encodeURIComponent(emissor)}&chave=${encodeURIComponent(chave)}`

// Acervo dos buckets de entrada (aba Documentos), por empresa e tipo.
export const listarDocumentos = () => pedir('/api/documentos')

// Termo no conteúdo dos documentos, pelo texto que o extrator gravou (buckets de saída). Devolve páginas e trechos.
export const buscarConteudo = (termo, empresa) =>
  pedir(`/api/documentos/busca?q=${encodeURIComponent(termo)}${empresa ? `&empresa=${encodeURIComponent(empresa)}` : ''}`)

export const urlDocumento = (empresa, chave, { baixar = false } = {}) =>
  `${BASE}/api/documentos/arquivo?empresa=${encodeURIComponent(empresa)}&chave=${encodeURIComponent(chave)}`
  + (baixar ? '&baixar=true' : '')

// Rótulos das fontes, na ordem em que o crawler roda (a CVM primeiro: é dela que saem os códigos dos ativos).
export const FONTES = {
  cvm: 'CVM (ITR, DFP, escrituras, AF)',
  pentagono: 'Pentágono (agente fiduciário)',
  oliveira_trust: 'Oliveira Trust (agente fiduciário)',
  anbima: 'Características das emissões',
  ri_mz: 'Site de RI',
  moodys: "Moody's Local",
  sp: 'S&P',
  reguladores: 'ANTT e ARTESP',
}
