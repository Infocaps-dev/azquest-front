// Relatório padrão sem passar pelo agente (27/10/2026) e o andamento de qualquer geração.
//
// gerarRelatorioPadrao()  a analise-api pede ao serviço de geração (mesmo código das tools, sem modelo): 2-7 s em
//                         vez dos 18-26 s do chat. Devolve a operação para acompanhar.
// andamentoRelatorio()    as etapas reais da geração (status/<operacao>.json), o relatório no fim e a versão 2
//                         (interpretação redigida). Vale para a operação do botão e para o pedido_id do chat.
//                         404 enquanto a geração não começou: devolve null.

const BASE = '/analise'

async function pedir(rota, opcoes = {}) {
  const resposta = await fetch(`${BASE}${rota}`, opcoes)
  if (resposta.status === 404) return null
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}))
    const erro = new Error(typeof corpo.detail === 'string' ? corpo.detail : `Falha em ${rota} (HTTP ${resposta.status})`)
    erro.status = resposta.status
    throw erro
  }
  return resposta.json()
}

export function gerarRelatorioPadrao({ empresa, periodo = '', valorEmissao = '', rating = '', rentabilidade = '' }) {
  return pedir('/api/relatorios/gerar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresa, periodo, valor_emissao: valorEmissao, rating, rentabilidade }),
  })
}

export function andamentoRelatorio(operacao) {
  return pedir(`/api/relatorios/operacoes/${encodeURIComponent(operacao)}`)
}
