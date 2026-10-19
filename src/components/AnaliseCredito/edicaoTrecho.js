// Edição de um trecho do relatório pelo botão "Editar": a referência do campo clicado e a mensagem para o agente.
//
// O relatório tem uma âncora antes de cada bloco (#item-E-070, #item-s10e-2) e de cada seção (#secao-10-e). O resumo
// da mesma versão traz, para cada âncora, o texto-fonte exato do bloco (`bruto`, com as marcações de fonte {A:ID}),
// que é o que a tool de edição do agente precisa receber como `trecho_atual`: com ele o agente troca exatamente aquele
// trecho, sem procurar no relatório. Se o resumo for de outra versão (o monitor ainda não refez), vai só o texto
// como aparece na tela e o agente procura.
//
// Funções puras: a tela chama, e dá para testar sem navegador.

// O que o botão escreve no hash do iframe ao ser clicado: #azq-editar=<âncora>. O relatório não roda script (CSP e
// sandbox), então o clique vira navegação para um fragmento, que a tela lê.
export const PREFIXO_EDICAO = 'azq-editar='

const CAMPOS_QUADRO = {
  valoremissao: 'Valor da emissão',
  rating: 'Rating',
  rentabilidade: 'Rentabilidade',
  observacoes: 'Observações',
  pontosatencao: 'Pontos de atenção',
  pontosfortes: 'Pontos fortes',
}

function normal(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
}

// Âncora da seção (ou subseção) de um item: a que continua valendo em qualquer versão. A âncora do item pode mudar
// de número quando a subseção ganha ou perde um bloco; a da seção não.
export function ancoraDaSecaoDoItem(item) {
  if (!item?.secao) return null
  if (item.secao === 'S') return 'sumario'
  return item.subsecao ? `secao-${item.secao}-${item.subsecao}` : `secao-${item.secao}`
}

function tituloDaSecao(indice, secao, subsecao) {
  const da = (s, sub) => (indice || []).find(e => String(e.secao) === String(s) && (e.subsecao || '') === (sub || ''))
  const sec = da(secao, '')
  const sub = subsecao ? da(secao, subsecao) : null
  const semNumero = t => String(t || '').replace(/^\s*[\dA-Za-z]{1,3}\.\s+/, '') // "10. Endividamento" -> "Endividamento"
  const nome = [sec?.titulo, sub?.titulo].map(semNumero).filter(Boolean).join(' › ')
  const numero = subsecao ? `${secao}.${subsecao}` : `${secao}`
  return nome ? `Seção ${numero} — ${nome}` : `Seção ${numero}`
}

function campoDoQuadro(item, ancora) {
  const chave = normal(item?.subsecao) || normal(ancora.replace(/^item-(?:sS|campo-)?/, '').replace(/-\d+$/, ''))
  const achado = Object.keys(CAMPOS_QUADRO).find(c => chave.startsWith(c))
  return achado ? CAMPOS_QUADRO[achado] : null
}

// Referência do trecho clicado: o que a janela de edição mostra e o que vai para o agente.
//   ancora        a âncora clicada (item ou seção)
//   tipo          'item' (um bloco) ou 'secao' (a seção inteira)
//   rotulo        "Seção 10.e — Endividamento › Covenants apurados" ou "Quadro-resumo — Pontos de atenção"
//   bruto         texto-fonte exato do bloco (só quando o resumo é da versão que está na tela)
//   textoNaTela   o texto como o analista vê
//   ancorasFoco   onde a tela se posiciona na versão nova: o próprio item, senão a seção, senão o quadro
export function referenciaDoTrecho({ ancora, itens, indice, textoNaTela, resumoDaVersaoNaTela }) {
  const secaoClicada = /^secao-([^-]+)(?:-(.+))?$/.exec(ancora)
  if (secaoClicada) {
    const [, secao, subsecao] = secaoClicada
    return {
      ancora, tipo: 'secao', secao, subsecao: subsecao || '',
      rotulo: tituloDaSecao(indice, secao, subsecao),
      bruto: '', textoNaTela: textoNaTela || '',
      ancorasFoco: [ancora],
    }
  }
  const item = (itens || []).find(i => i.ancora === ancora)
  const quadro = item?.secao === 'S' || /^item-(?:S-|sS|campo-)/.test(ancora)
  const campo = quadro ? campoDoQuadro(item, ancora) : null
  const rotulo = quadro
    ? `Quadro-resumo${campo ? ` — ${campo}` : ''}`
    : item ? tituloDaSecao(indice, item.secao, item.subsecao) : 'Trecho do relatório'
  const secaoDoItem = ancoraDaSecaoDoItem(item) || (quadro ? 'sumario' : null)
  return {
    ancora, tipo: 'item', secao: item?.secao || (quadro ? 'S' : ''), subsecao: item?.subsecao || '', campo,
    rotulo,
    bruto: resumoDaVersaoNaTela && item?.bruto ? item.bruto : '',
    textoNaTela: textoNaTela || item?.texto || '',
    ancorasFoco: [ancora, secaoDoItem].filter(Boolean),
  }
}

// Mensagem para o Analista, que a repassa como está ao Agente de Relatório. A primeira linha é o relatorio_id (o
// formato que o Agente de Relatório espera) e a linha "Origem" diz que veio da tela do relatório: é o que autoriza a
// edição fora da conversa em que o relatório foi gerado. O agente não vê as mensagens anteriores, então cada envio leva
// o diálogo inteiro desta edição.
export function mensagemDeEdicao({ relatorioId, versao, referencia, dialogo }) {
  const linhas = [
    `relatorio_id: ${relatorioId}`,
    `Origem: tela do relatório (botão Editar), versão ${versao} na tela`,
    `Campo: ${referencia.rotulo}${referencia.tipo === 'secao' ? ' (a seção inteira)' : ''}`,
    `Âncora: ${referencia.ancora}`,
  ]
  if (referencia.bruto) {
    linhas.push('Trecho atual (exato, com as marcações de fonte; use como trecho_atual):', '<<<', referencia.bruto, '>>>')
  } else if (referencia.textoNaTela) {
    linhas.push('Trecho como aparece na tela (sem as marcações de fonte; localize com ler_relatorio):', '<<<',
      referencia.textoNaTela.slice(0, 1500), '>>>')
  }
  const falas = dialogo.filter(m => m.texto?.trim())
  if (falas.length === 1) {
    linhas.push(`Alteração pedida: ${falas[0].texto.trim()}`)
  } else {
    linhas.push('Alteração pedida (diálogo desta edição, em ordem):')
    for (const m of falas) {
      linhas.push(`${m.papel === 'usuario' ? 'Analista' : 'Agente'}: ${m.texto.trim()}`)
    }
  }
  return linhas.join('\n')
}

// Texto visível de um bloco do relatório, sem os botões de edição que a tela pôs nele.
export function textoVisivel(elemento) {
  if (!elemento) return ''
  const copia = elemento.cloneNode(true)
  copia.querySelectorAll?.('.azq-editar').forEach(b => b.remove())
  return (copia.textContent || '').replace(/\s+/g, ' ').trim()
}
