import { useMemo } from 'react'
import { Launch } from '@carbon/icons-react'
import { useDocumentosDoAcervo } from './useDocumentosDoAcervo'

// Referências do relatório: os documentos que ESTE relatório usou, como uma bibliografia. Cada documento com o tipo,
// a data-base, as páginas (ou abas e linhas da planilha) citadas e quantas vezes, e o link para abrir o arquivo no
// acervo da empresa, já na primeira página citada. Sai das evidências dos itens do resumo, não do acervo inteiro: o
// acervo de cada empresa fica na aba Documentos.

const ORDEM_TIPO = ['ITR', 'DFP', 'Release', 'Planilha', 'Escritura', 'Relatório do agente fiduciário', 'Rating']
const posicao = tipo => {
  const i = ORDEM_TIPO.findIndex(t => (tipo || '').toLowerCase().startsWith(t.toLowerCase()))
  return i < 0 ? ORDEM_TIPO.length : i
}

// Uma entrada por arquivo: o que o resumo diz do documento mais as páginas e linhas das evidências.
function referenciasDoResumo(resumo) {
  const porArquivo = new Map()
  const entrada = arquivo => {
    if (!porArquivo.has(arquivo)) {
      porArquivo.set(arquivo, { arquivo, tipo: '', dataBase: '', divergente: false, paginas: new Set(), linhas: new Set(), citacoes: 0 })
    }
    return porArquivo.get(arquivo)
  }
  for (const d of resumo?.documentos || []) {
    if (!d.arquivo) continue
    Object.assign(entrada(d.arquivo), { tipo: d.tipo || '', dataBase: d.data_base || '', divergente: d.entidade === 'divergente' })
  }
  for (const item of resumo?.itens || []) {
    for (const e of item.evidencias || []) {
      if (!e?.arquivo) continue
      const r = entrada(e.arquivo)
      r.citacoes += 1
      if (typeof e.pagina === 'number') r.paginas.add(e.pagina)
      if (e.aba) r.linhas.add(e.linha ? `aba "${e.aba}", linha ${e.linha}` : `aba "${e.aba}"`)
      if (e.entidade_divergente) r.divergente = true
    }
  }
  return [...porArquivo.values()]
    .map(r => ({ ...r, paginas: [...r.paginas].sort((a, b) => a - b), linhas: [...r.linhas] }))
    .sort((a, b) => posicao(a.tipo) - posicao(b.tipo) || a.arquivo.localeCompare(b.arquivo))
}

function ReferenciasRelatorio({ resumo }) {
  const linkDoArquivo = useDocumentosDoAcervo(resumo?.empresa)
  const referencias = useMemo(() => referenciasDoResumo(resumo), [resumo])

  if (!referencias.length) return null
  return (
    <section className="ana-fontes" aria-label="Referências do relatório">
      <h2 className="ana-secao__titulo">Referências</h2>
      <p className="ana-fontes__intro">
        Documentos usados nesta versão do relatório, com as páginas citadas.
      </p>
      <ol className="ana-fontes__lista">
        {referencias.map(r => {
          const link = linkDoArquivo(r.arquivo, r.paginas[0])
          const local = [
            r.paginas.length ? `${r.paginas.length === 1 ? 'p.' : 'pp.'} ${r.paginas.join(', ')}` : '',
            r.linhas.join('; '),
          ].filter(Boolean).join('; ')
          return (
            <li key={r.arquivo}>
              <span className="ana-fontes__documento">{r.arquivo}</span>
              <span className="ana-fontes__origem">
                {[r.tipo, r.dataBase && `data-base ${r.dataBase}`, r.divergente && 'documento de outra entidade']
                  .filter(Boolean).join(' · ')}
              </span>
              <span className="ana-fontes__referencias">
                {local || 'sem página citada'}
                {r.citacoes ? ` · ${r.citacoes} ${r.citacoes === 1 ? 'citação' : 'citações'}` : ''}
              </span>
              {link && (
                <a className="ana-fontes__abrir" target="_blank" rel="noreferrer" href={link}>
                  Abrir <Launch size={12} />
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default ReferenciasRelatorio
