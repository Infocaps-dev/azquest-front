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
    // status e corpo viajam no erro: o cadastro de emissor precisa do 409 com o emissor que já existe.
    // 422 de validação do FastAPI traz a lista de campos em detail; a mensagem é a do primeiro.
    const detalhe = Array.isArray(corpo.detail) ? corpo.detail.map(d => d.msg).filter(Boolean).join('; ') : corpo.detail
    const erro = new Error(detalhe || `Falha em ${rota} (HTTP ${resposta.status})`)
    erro.status = resposta.status
    erro.corpo = corpo
    throw erro
  }
  return resposta.json()
}

export const listarEmissores = () => pedir('/api/emissores')

// Cadastro de emissor pela tela. A sugestão vem do cadastro aberto da CVM pelo CNPJ: 404 quando o CNPJ não é de
// companhia aberta, e então o usuário preenche à mão (devolve null, não é erro).
export async function sugestaoEmissor(cnpj) {
  try {
    return await pedir(`/api/emissores/sugestao?cnpj=${encodeURIComponent(cnpj)}`)
  } catch (erro) {
    if (erro.status === 404) return null
    throw erro
  }
}

// 201: o registro novo (com reativado: true quando era um removido). 409: o CNPJ já está cadastrado
// (erro.corpo.existente; removido: true quando dá para reativar mandando reativar: true). 422: validação.
export const criarEmissor = dados => pedir('/api/emissores', { method: 'POST', body: JSON.stringify(dados) })

// Remoção lógica de emissor cadastrado pela tela: some das listas, os documentos ficam. 409: configuração fixa,
// coleta em andamento ou já removido.
// Atuação da empresa (perfil): a pesquisa roda em segundo plano na coleta-api (CVM, B3, site oficial, resumo com
// fontes); a tela consulta até terminar e a pessoa confirma antes de gravar.
export const iniciarPesquisaAtuacao = dados =>
  pedir('/api/emissores/pesquisa', { method: 'POST', body: JSON.stringify(dados) })
export const verPesquisaAtuacao = id => pedir(`/api/emissores/pesquisa/${encodeURIComponent(id)}`)
export const confirmarAtuacao = (emissor, perfil, pesquisaId) =>
  pedir(`/api/emissores/${encodeURIComponent(emissor)}/perfil`,
    { method: 'PUT', body: JSON.stringify({ perfil, pesquisa_id: pesquisaId || null }) })

export const removerEmissor = emissor =>
  pedir(`/api/emissores/${encodeURIComponent(emissor)}`, { method: 'DELETE' })

export const listarColetas = emissor =>
  pedir(`/api/coletas${emissor ? `?emissor=${encodeURIComponent(emissor)}` : ''}`)

export const obterColeta = id => pedir(`/api/coletas/${encodeURIComponent(id)}`)

// A API recusa com 409 quando já há coleta em andamento: duas abas abertas são dois botões, e só o servidor vê os dois.
// `periodo` (2T26): o trimestre do kit, ou o início do intervalo que termina em `periodoAte`; sem ele, o da
// configuração do emissor.
export const dispararColeta = ({ emissor, fontes, upload, periodo, periodoAte }) =>
  pedir('/api/coletas', {
    method: 'POST',
    body: JSON.stringify({ emissor, fontes, upload, periodo: periodo || null, periodo_ate: periodoAte || null }),
  })

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
