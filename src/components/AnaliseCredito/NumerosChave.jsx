import { Tag, Tile } from '@carbon/react'
import { WarningAlt } from '@carbon/icons-react'
import { formatar, revisaoDe, rotuloEvidencia } from './vocabulario'

// Números-chave, item 3.4: oito cartões, um número por cartão.
//
// Nenhum destes números foi escrito por um modelo. A folga do covenant e a
// distância ao gatilho são subtrações feitas no serviço determinístico, e o
// cartão só exibe. Na etapa 1.5 os dois modelos testados escreveram "a
// distância ao gatilho foi de 4,1x" quando a distância era 0,4x.
//
// A ressalva viaja com o número, não numa nota de rodapé: o gatilho da Fitch
// vem de um relatório da Ecovias Ponte, não do consolidado, e quem lê 4,5x
// precisa ler isso junto.

function NumerosChave({ numeros = [], onAbrir }) {
  if (!numeros.length) return null

  return (
    <section className="ana-numeros" aria-label="Números-chave">
      <h2 className="ana-secao__titulo">Números-chave</h2>
      <div className="ana-numeros__grade">
        {numeros.map(numero => {
          const revisao = revisaoDe(numero.revisao?.status)
          const semFonte = !(numero.evidencias || []).length
          return (
            <Tile
              key={numero.id}
              className={[
                'ana-kpi',
                numero.ressalva ? 'ana-kpi--ressalva' : '',
                semFonte ? 'ana-kpi--sem-fonte' : '',
              ].join(' ').trim()}
            >
              <button type="button" className="ana-kpi__gatilho" onClick={() => onAbrir?.(numero)}>
                <span className="ana-kpi__titulo">{numero.titulo}</span>
                <span className="ana-kpi__valor">
                  {formatar(numero.valor, numero.unidade)}
                </span>
                {numero.periodo && <span className="ana-kpi__periodo">{numero.periodo}</span>}
                {numero.contexto && <span className="ana-kpi__contexto">{numero.contexto}</span>}

                {numero.valor_na_origem && (
                  // O cartão mostra R$ 1.769 mi; a nota do documento trazia
                  // 1.769.284 em R$ mil. A conversão é por mil e o valor de
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

                <span className="ana-kpi__rodape">
                  {semFonte ? (
                    <Tag type="red" size="sm">Não localizado</Tag>
                  ) : (
                    <span className="ana-fonte ana-fonte--estatica">
                      {rotuloEvidencia(numero.evidencias[0])}
                      {numero.evidencias.length > 1 && ` +${numero.evidencias.length - 1}`}
                    </span>
                  )}
                  <Tag type={revisao.tag} size="sm">{revisao.rotulo}</Tag>
                </span>
              </button>
            </Tile>
          )
        })}
      </div>
    </section>
  )
}

export default NumerosChave
