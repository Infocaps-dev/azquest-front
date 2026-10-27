import { useEffect, useMemo, useState } from 'react'
import { listarDocumentos, urlDocumento } from '../../services/coletaApi'

const semAcento = texto => (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Documentos do acervo por nome de arquivo, para abrir a fonte citada: devolve a função que dá o link do arquivo (já
// na página, se houver) ou null quando o arquivo não está no acervo. Com o mesmo nome em duas empresas, vale o da
// empresa do relatório.
export function useDocumentosDoAcervo(empresa) {
  const [acervo, setAcervo] = useState(null)
  useEffect(() => {
    let ativo = true
    listarDocumentos().then(r => { if (ativo) setAcervo(r.empresas || []) }).catch(() => { if (ativo) setAcervo([]) })
    return () => { ativo = false }
  }, [])

  const porArquivo = useMemo(() => {
    const mapa = new Map()
    const daEmpresa = e => semAcento(e.empresa) === semAcento(empresa)
    for (const e of [...(acervo || [])].sort((a, b) => daEmpresa(b) - daEmpresa(a))) {
      for (const t of e.tipos || []) {
        for (const d of t.documentos || []) {
          if (!mapa.has(d.nome)) mapa.set(d.nome, { empresa: e.empresa, chave: d.chave })
        }
      }
    }
    return mapa
  }, [acervo, empresa])

  return (arquivo, pagina) => {
    const doc = porArquivo.get(arquivo)
    return doc ? `${urlDocumento(doc.empresa, doc.chave)}${pagina ? `#page=${pagina}` : ''}` : null
  }
}
