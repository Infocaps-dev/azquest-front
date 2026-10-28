// Fila de confirmação de conceitos (28/10/2026): as séries que o classificador deixou pendentes ou em conflito, e a
// decisão do analista. A analise-api confere a sessão e o papel de quem decide; o autor vem da sessão.

const BASE = '/analise'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, opcoes)
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    const erro = new Error(typeof corpo.detail === 'string' ? corpo.detail : `Falha em ${rota} (HTTP ${resposta.status})`)
    erro.status = resposta.status
    throw erro
  }
  return resposta.json()
}

// {catalogo: [{conceito, nome, unidade}], escopos: [...], empresas: [{empresa, empresa_id, versao, itens: [...]}],
//  pode_decidir}
export function filaDeConceitos() {
  return pedir('/api/conceitos/fila')
}

// estado: liberado (com conceito e escopo), sem_conceito ou descartada. versao: a da empresa quando a fila foi lida;
// 409 se outra decisão foi gravada depois.
export function decidirConceito({ empresaId, serie, estado, conceito = '', escopo = '', versao }) {
  return pedir('/api/conceitos/decisao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresa_id: empresaId, serie, estado, conceito, escopo, versao }),
  })
}
