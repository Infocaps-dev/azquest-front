// Cliente das rotas de documentos da analise-api.
//
// Duas chamadas, e o arquivo sobe uma vez só:
//
//   enviarParaIdentificacao()  o anexo vai para uma área de recebimento que o
//                              extrator ignora, e volta com o tipo que a API
//                              identificou lendo a capa do PDF.
//   confirmarDocumentos()      grava em <tipo>/ dentro do bucket. É essa
//                              gravação que dispara a extração.
//
// A confirmação no meio existe porque errar a pasta custa uma extração inteira
// — até 10 minutos de 2 vCPU — e o erro só apareceria no JSON de saída.
//
// O emissor vai nas três chamadas: o anexo entra no bucket de entrada dele (o
// mesmo da aba Coleta), e a confirmação e o descarte procuram o recebimento lá.
//
// Não há `Content-Type` nas chamadas de upload de propósito: com FormData o
// navegador precisa montar o cabeçalho sozinho, porque é ele que escolhe o
// `boundary`. Defini-lo à mão quebra o parse no servidor.

const BASE = '/analise'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, opcoes)
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    const detalhe = corpo.detail
    throw new Error(
      typeof detalhe === 'string'
        ? detalhe
        : detalhe?.falhas?.[0]?.motivo
          || detalhe?.mensagem
          || `Falha em ${rota} (HTTP ${resposta.status})`,
    )
  }
  return resposta.json()
}

/**
 * O catálogo dos documentos extraídos da empresa (30/10/2026): tipo, período, evidência e alertas lidos do
 * conteúdo, nunca do nome do arquivo. `empresa` é a pasta da empresa (ex.: motiva).
 */
export function lerCatalogo(empresa) {
  return pedir(`/api/documentos/catalogo?empresa=${encodeURIComponent(empresa)}`)
}

/** As pastas que o extrator conhece. Alimenta o seletor de correção. */
export async function listarTiposDeDocumento() {
  return pedir('/api/documentos/tipos')
}

/**
 * Sobe os anexos e devolve o palpite de tipo de cada um.
 * Nenhum documento entra na pasta definitiva nesta chamada.
 */
export async function enviarParaIdentificacao(arquivos, emissor) {
  const corpo = new FormData()
  for (const arquivo of arquivos) corpo.append('arquivos', arquivo)
  // Sem emissor, a analise-api grava no bucket de sempre (o da Ecorodovias).
  if (emissor) corpo.append('emissor', emissor)
  return pedir('/api/documentos', { method: 'POST', body: corpo })
}

/** Grava cada documento na pasta confirmada e dispara a extração. */
export async function confirmarDocumentos(documentos, emissor) {
  return pedir('/api/documentos/confirmar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentos, emissor }),
  })
}

/** Apaga recebimentos que o analista anexou e decidiu não enviar. */
export async function descartarDocumentos(chaves, emissor) {
  if (!chaves.length) return { descartados: [] }
  return pedir('/api/documentos/descartar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chaves, emissor }),
  })
}
