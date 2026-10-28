import { matchPath } from 'react-router'

// Endereços das telas (28/10/2026, decidido com o Kimi): a URL diz o que está aberto e pode ser copiada, favoritada
// ou aberta noutra aba. Substantivos em português, sem acento. Nenhum caminho de tela começa com um prefixo das APIs
// (/api/, /analise/, /monitor/, /resumos/, /coleta/), que o nginx e o Vite encaminham para os serviços.
//
//   /conversas                      conversa nova         /conversas/:conversaId          conversa salva
//   /relatorios                     o mais recente        /relatorios/:relatorioId        Análise de crédito dele
//   /relatorios/:relatorioId/completo                     o relatório completo aberto por cima da análise
//   /monitoramento  /desempenho  /coletas  /documentos  /conceitos
//
// "/" leva a /conversas mantendo a consulta: os links de fonte dos relatórios publicados são "/?fonte=1&…".

export const CAMINHO_DA_ABA = {
  inicio: '/conversas',
  analise: '/relatorios',
  monitoramento: '/monitoramento',
  desempenho: '/desempenho',
  coleta: '/coletas',
  documentos: '/documentos',
  conceitos: '/conceitos',
}

// A aba de um caminho; null quando nenhuma tela responde por ele (página não encontrada).
export function abaDoCaminho(caminho) {
  const raiz = `/${(caminho || '/').split('/')[1] || ''}`
  return Object.keys(CAMINHO_DA_ABA).find(aba => CAMINHO_DA_ABA[aba] === raiz) || null
}

export const caminhoDaConversa = id => (id ? `/conversas/${encodeURIComponent(id)}` : '/conversas')

export const caminhoDoRelatorio = (id, { completo = false } = {}) =>
  (id ? `/relatorios/${encodeURIComponent(id)}${completo ? '/completo' : ''}` : '/relatorios')

export function conversaDoCaminho(caminho) {
  return matchPath('/conversas/:conversaId', caminho)?.params.conversaId || null
}

// { id, completo } do caminho da Análise; id null em /relatorios.
export function relatorioDoCaminho(caminho) {
  const completo = matchPath('/relatorios/:relatorioId/completo', caminho)
  if (completo) return { id: completo.params.relatorioId, completo: true }
  return { id: matchPath('/relatorios/:relatorioId', caminho)?.params.relatorioId || null, completo: false }
}

// Título da aba do navegador: "<o que está aberto> | AZ Quest".
export function definirTitulo(...partes) {
  document.title = [...partes.filter(Boolean), 'AZ Quest'].join(' | ')
}

export const TITULO_DA_ABA = {
  inicio: 'Conversas',
  analise: 'Análise de crédito',
  monitoramento: 'Monitoramento',
  desempenho: 'Desempenho',
  coleta: 'Coleta',
  documentos: 'Documentos',
  conceitos: 'Conceitos',
}

// Clique comum navega dentro da tela; com Ctrl, Cmd, Shift ou o botão do meio, o navegador abre o link noutra aba.
export const cliqueComum = evento => evento.button === 0 && !evento.metaKey && !evento.ctrlKey && !evento.shiftKey
  && !evento.altKey
