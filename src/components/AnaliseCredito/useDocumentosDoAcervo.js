import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarDocumentos, urlDocumento } from '../../services/coletaApi'

const semAcento = texto => (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// A lista do acervo é a mesma para todas as telas que abrem fontes (Análise, painel de revisão, relatório completo,
// Referências): um pedido só por minuto, em vez de um por componente montado.
let lista = null
function documentosDoAcervo() {
  if (!lista || Date.now() - lista.quando > 60_000) {
    const pedido = listarDocumentos().then(r => r.empresas || [])
    pedido.catch(() => { lista = null })
    lista = { quando: Date.now(), pedido }
  }
  return lista.pedido
}

// Documentos do acervo por nome de arquivo, para abrir a fonte citada: devolve a função que dá o link do arquivo (já
// na página, se houver), null quando o arquivo não está no acervo e undefined enquanto a lista não chegou. Com o mesmo
// nome em duas empresas, vale o da empresa do relatório (ou a do próprio link de fonte, quando ele diz qual é).
export function useDocumentosDoAcervo(empresa) {
  const [acervo, setAcervo] = useState(null)
  useEffect(() => {
    let ativo = true
    documentosDoAcervo().then(r => { if (ativo) setAcervo(r) }).catch(() => { if (ativo) setAcervo([]) })
    return () => { ativo = false }
  }, [])

  // nome do arquivo -> [{ empresa, chave }], na ordem das empresas
  const porArquivo = useMemo(() => {
    const mapa = new Map()
    for (const e of acervo || []) {
      for (const t of e.tipos || []) {
        for (const d of t.documentos || []) {
          if (!mapa.has(d.nome)) mapa.set(d.nome, [])
          mapa.get(d.nome).push({ empresa: e.empresa, chave: d.chave })
        }
      }
    }
    return mapa
  }, [acervo])

  return useCallback((arquivo, pagina, empresaDoLink) => {
    if (acervo === null) return undefined
    const candidatos = porArquivo.get(arquivo) || []
    const preferida = semAcento(empresaDoLink || empresa)
    const doc = candidatos.find(c => semAcento(c.empresa) === preferida) || candidatos[0]
    return doc ? `${urlDocumento(doc.empresa, doc.chave)}${pagina ? `#page=${pagina}` : ''}` : null
  }, [acervo, porArquivo, empresa])
}

// Uma citação (evidência do resumo ou link de fonte do relatório) no formato do visualizador: o arquivo, a página do
// PDF e a aba/linha da planilha. `link` como em useDocumentosDoAcervo (null: fora do acervo; undefined: carregando).
export function documentoDaFonte({ arquivo, pagina, aba, linha, empresa } = {}, linkDoArquivo) {
  if (!arquivo) return null
  const numero = Number(pagina)
  return {
    arquivo,
    link: linkDoArquivo(arquivo, null, empresa),
    paginas: numero > 0 ? [numero] : [],
    linhas: aba ? [linha ? `aba "${aba}", linha ${linha}` : `aba "${aba}"`] : [],
  }
}
