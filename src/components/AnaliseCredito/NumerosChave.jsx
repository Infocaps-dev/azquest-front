import { Tile } from '@carbon/react'
import { WarningAlt } from '@carbon/icons-react'
import { formatar, rotuloEvidencia } from './vocabulario'
import { useDocumentosDoAcervo } from './useDocumentosDoAcervo'

// Números-chave: os cartões do topo da aba, um número por cartão.
//
// Nenhum destes números foi escrito por um modelo: saem do resumo montado por
// código (planilha de RI, documentos do período, escritura), com a fonte. O
// clique abre o relatório no trecho que cita o mesmo item do acervo (ou a
// mesma página); quando o relatório não cita a fonte do número, o clique abre
// o documento de origem. Nunca uma seção que não contém o número: com âncoras
// fixas, o lucro líquido da Motiva levava a uma seção fora do piloto.
//
// A ressalva viaja com o número, não numa nota de rodapé: o rating da Fitch
// disponível é da Ecovias Ponte, não do consolidado, e quem lê a nota precisa
// ler isso junto.

function NumerosChave({ numeros = [], empresa, onAbrir }) {
  const linkDoArquivo = useDocumentosDoAcervo(empresa)
  if (!numeros.length) return null

  return (
    <section className="ana-numeros" aria-label="Números-chave">
      <div className="ana-numeros__grade">
        {numeros.map(numero => (
          <Tile
            key={numero.id}
            className={[
              'ana-kpi',
              numero.ressalva ? 'ana-kpi--ressalva' : '',
              numero.fonte ? '' : 'ana-kpi--sem-fonte',
            ].join(' ').trim()}
          >
            <Gatilho numero={numero} onAbrir={onAbrir}
              link={numero.documento && linkDoArquivo(numero.documento.arquivo, numero.documento.pagina)}>
              <span className="ana-kpi__titulo">{numero.titulo}</span>
              <span className="ana-kpi__valor">{formatar(numero.valor, numero.unidade)}</span>
              {numero.periodo && <span className="ana-kpi__periodo">{numero.periodo}</span>}
              {numero.contexto && <span className="ana-kpi__contexto">{numero.contexto}</span>}
              {numero.valor_na_origem != null && (
                // O cartão mostra R$ mi; a planilha traz R$ mil. O valor de
                // origem fica à vista, para a conferência bater com o papel.
                <span className="ana-kpi__origem">
                  no documento: {formatar(numero.valor_na_origem, numero.unidade_na_origem, 0)}
                </span>
              )}
              {numero.ressalva && (
                <span className="ana-kpi__ressalva">
                  <WarningAlt size={14} /> {numero.ressalva}
                </span>
              )}
              {numero.fonte && (
                <span className="ana-kpi__rodape">
                  <span className="ana-fonte ana-fonte--estatica" title={rotuloEvidencia(numero.fonte)}>
                    {rotuloEvidencia(numero.fonte)}
                  </span>
                </span>
              )}
            </Gatilho>
          </Tile>
        ))}
      </div>
    </section>
  )
}

// No relatório, se ele cita a fonte do número; senão, o documento de origem;
// sem nenhum dos dois, o cartão não é clicável.
function Gatilho({ numero, link, onAbrir, children }) {
  if (numero.ancora) {
    return (
      <button type="button" className="ana-kpi__gatilho" onClick={() => onAbrir?.(numero.ancora)}
        title="Ver no relatório">
        {children}
      </button>
    )
  }
  if (link) {
    return (
      <a className="ana-kpi__gatilho" href={link} target="_blank" rel="noreferrer"
        title="Abrir o documento de origem (o relatório não cita esta fonte)">
        {children}
      </a>
    )
  }
  return <div className="ana-kpi__gatilho ana-kpi__gatilho--estatico">{children}</div>
}

export default NumerosChave
