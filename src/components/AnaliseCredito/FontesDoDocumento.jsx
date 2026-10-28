import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { documentoDaFonte, useDocumentosDoAcervo } from './useDocumentosDoAcervo'
import VisualizadorDocumento, { PainelDocumento } from './VisualizadorDocumento.jsx'

// Fonte citada que abre o documento original (28/10/2026): na aba Análise, cada linha de fonte (seções, números-chave,
// painel de revisão) abre o arquivo na página citada, ou a planilha na aba e linha citadas, no mesmo visualizador da
// lista de Referências. Um provedor por tela: na página, o documento abre numa janela; dentro de uma janela (painel
// de revisão, relatório completo), num painel por cima dela, porque uma janela sobre outra fica com o foco preso na
// de baixo.

const FontesDoDocumento = createContext(null)

// A fonte aberta fica guardada crua ({ arquivo, pagina, aba, linha, empresa }) e vira documento a cada render: se o
// clique vem antes da lista do acervo chegar, o visualizador mostra "procurando" e depois o arquivo.
export function useVisualizadorDeFontes(empresa) {
  const linkDoArquivo = useDocumentosDoAcervo(empresa)
  const [fonte, setFonte] = useState(null)
  const valor = useMemo(() => ({
    documento: f => documentoDaFonte(f, linkDoArquivo),
    abrir: setFonte,
  }), [linkDoArquivo])
  const fechar = useCallback(() => setFonte(null), [])
  return { valor, aberto: fonte ? documentoDaFonte(fonte, linkDoArquivo) : null, fechar }
}

export function ProvedorDeFontes({ empresa, embutido = false, children }) {
  const { valor, aberto, fechar } = useVisualizadorDeFontes(empresa)
  return (
    <FontesDoDocumento.Provider value={valor}>
      {children}
      {embutido
        ? aberto && <PainelDocumento documento={aberto} onFechar={fechar} />
        : <VisualizadorDocumento documento={aberto} onFechar={fechar} />}
    </FontesDoDocumento.Provider>
  )
}

// O texto da fonte como botão com cara de link. Sem arquivo na citação (notícia, cálculo) ou fora do acervo, fica o
// texto, como antes. `evidencia`: { arquivo, pagina, aba, linha } do resumo.
export function FonteClicavel({ evidencia, className = 'ana-fonte', title, children }) {
  const fontes = useContext(FontesDoDocumento)
  const documento = fontes?.documento(evidencia)
  if (!documento?.link) {
    return <span className={`${className} ana-fonte--estatica`} title={title}>{children}</span>
  }
  return (
    <button type="button" className={className} title={title || `Abrir ${documento.arquivo}`}
      onClick={evento => { evento.stopPropagation(); fontes.abrir(evidencia) }}>
      {children}
    </button>
  )
}

// Link de fonte do relatório aberto fora da tela (nova aba, PDF): a tela abre com ?fonte=1&arquivo=…&pagina=… e
// mostra o documento, depois do login se for preciso.
const CAMPOS_DA_FONTE = ['empresa', 'arquivo', 'pagina', 'aba', 'linha']

export function fonteDaUrl() {
  const parametros = new URLSearchParams(window.location.search)
  if (!parametros.get('fonte') || !parametros.get('arquivo')) return null
  return Object.fromEntries(CAMPOS_DA_FONTE.map(k => [k, parametros.get(k) || undefined]))
}

export function FonteDaUrl({ fonte, onFechar }) {
  const linkDoArquivo = useDocumentosDoAcervo(fonte.empresa)
  return <VisualizadorDocumento documento={documentoDaFonte(fonte, linkDoArquivo)} onFechar={onFechar} />
}
