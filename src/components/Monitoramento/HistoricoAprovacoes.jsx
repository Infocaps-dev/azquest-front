import { Accordion, AccordionItem, Tag } from '@carbon/react'
import { nivelDe } from './niveis'

// Histórico de aprovação: o que cada pessoa decidiu, e sobre o que decidiu.
//
// A aba mostrava o que o ciclo fez e não mostrava o que as pessoas decidiram.
// Aprovada, a análise sumia da tela: ficava num alerta antigo que nenhuma
// tela abria. Quem precisasse reler o que assinou no trimestre passado não
// tinha onde -- e é isso que uma decisão de crédito precisa ter.
//
// Fechado, cada item diz período, decisão e quem assinou. Aberto, mostra o
// texto que foi decidido e a justificativa. O texto é o ponto: "aprovado" sem
// o que foi aprovado não é registro de nada.

const DECISAO = {
  aprovado: { rotulo: 'Aprovado', tag: 'green' },
  // "Editado" e nao "Editado e aprovado": o rotulo longo empurrava o e-mail
  // para uma segunda linha e deixava a lista serrilhada. O que a edicao
  // significa -- texto do analista no lugar do texto do modelo -- aparece
  // escrito quando o item abre.
  editado: { rotulo: 'Editado', tag: 'blue' },
  rejeitado: { rotulo: 'Rejeitado', tag: 'red' },
}

const decisaoDe = d => DECISAO[d] || { rotulo: d || 'Decidido', tag: 'gray' }

function quando(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function HistoricoAprovacoes({ decisoes }) {
  return (
    <section className="mon-decisoes" aria-label="Histórico de aprovação">
      <h3 className="mon-secao__titulo">Histórico de aprovação</h3>

      {!decisoes?.length ? (
        <p className="mon-vazio">Nenhuma análise foi decidida ainda.</p>
      ) : (
        <Accordion size="sm">
          {decisoes.map(decisao => {
            const d = decisaoDe(decisao.decisao)
            const nivel = nivelDe(decisao.nivel)
            return (
              <AccordionItem
                key={decisao.id}
                title={
                  <span className="mon-decisoes__titulo">
                    <span className="mon-decisoes__periodo">{decisao.periodo}</span>
                    <Tag type={d.tag} size="sm">{d.rotulo}</Tag>
                    <span className="mon-decisoes__quem">{decisao.usuario}</span>
                  </span>
                }
              >
                <p className="mon-decisoes__meta">
                  {quando(decisao.criado_em)}
                  {decisao.nivel && ` · nível ${nivel.rotulo.toLowerCase()}`}
                </p>

                {decisao.recomendacao && (
                  <p className="mon-decisoes__campo">
                    <strong>Recomendação:</strong> {decisao.recomendacao}
                  </p>
                )}

                <p className="mon-decisoes__rotulo">
                  {decisao.editado ? 'Texto aprovado, revisado pelo analista' : 'Texto decidido'}
                </p>
                {/* Alerta sem texto existe: os primeiros ciclos foram
                    decididos antes de a análise passar a ser redigida. Dizer
                    isso é melhor do que um travessão, que parece defeito. */}
                <p className="mon-decisoes__texto">
                  {decisao.texto || (
                    <span className="mon-decisoes__ausente">
                      Este alerta foi registrado sem texto de análise.
                    </span>
                  )}
                </p>

                {/* A diferença entre o que o modelo escreveu e o que a pessoa
                    assinou é o registro mais útil daqui: é o que mostra onde o
                    modelo erra sempre. Por isso o original não é descartado. */}
                {decisao.editado && decisao.texto_original && (
                  <>
                    <p className="mon-decisoes__rotulo">Texto original, antes da edição</p>
                    <p className="mon-decisoes__texto mon-decisoes__texto--original">
                      {decisao.texto_original}
                    </p>
                  </>
                )}

                <p className="mon-decisoes__rotulo">Justificativa</p>
                <p className="mon-decisoes__texto">
                  {decisao.justificativa || (
                    <span className="mon-decisoes__ausente">
                      {decisao.decisao === 'rejeitado'
                        ? 'Sem justificativa registrada.'
                        : 'Aprovado sem comentário.'}
                    </span>
                  )}
                </p>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </section>
  )
}

export default HistoricoAprovacoes
