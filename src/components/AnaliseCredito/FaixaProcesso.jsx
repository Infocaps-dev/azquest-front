import { useState } from 'react'
import { Button, ProgressIndicator, ProgressStep } from '@carbon/react'
import { ChevronDown, ChevronUp } from '@carbon/icons-react'
import { ESTADO_DA_ETAPA, nomeDaEtapa } from './vocabulario'

// Faixa A1 a A6, item 3.2 do handoff. Fina e recolhível.
//
// Mesmo componente visual da aba Monitoramento, e com as mesmas duas correções
// que aquela tela precisou: o rótulo secundário sai do posicionamento absoluto
// (senão o nome em duas linhas cai em cima do status) e a etapa que ninguém
// vai executar não conta como "a atual".
//
// A2 é o caso dessa segunda correção aqui. O modelo financeiro segue no Excel
// do analista, por decisão de escopo: a etapa nunca vai rodar, e deixá-la
// parecer a etapa corrente faria a faixa dizer que o processo parou nela.

const ESTADO = {
  concluido: { complete: true },
  em_execucao: { current: true },
  aguardando_humano: { current: true },
  falhou: { invalid: true },
  fora_do_mvp: { disabled: true },
  pendente: {},
}

function FaixaProcesso({ etapas = [], onSelecionar, selecionada }) {
  const [aberta, setAberta] = useState(true)

  if (!etapas.length) return null

  const foraDoFluxo = etapa => etapa.status === 'fora_do_mvp'
  const emAndamento = etapas.findIndex(
    e => e.status === 'em_execucao' || e.status === 'aguardando_humano',
  )
  const primeiraAberta = etapas.findIndex(
    e => e.status !== 'concluido' && !foraDoFluxo(e),
  )
  const indiceAtual = emAndamento >= 0 ? emAndamento : primeiraAberta

  const concluidas = etapas.filter(e => e.status === 'concluido').length

  return (
    <section className="ana-faixa" aria-label="Andamento da construção da tese">
      <div className="ana-faixa__topo">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={aberta ? ChevronUp : ChevronDown}
          onClick={() => setAberta(a => !a)}
        >
          {aberta ? 'Recolher o processo' : `Processo: ${concluidas} de ${etapas.length} concluídas`}
        </Button>
      </div>

      {aberta && (
        <ProgressIndicator currentIndex={indiceAtual >= 0 ? indiceAtual : etapas.length}>
          {etapas.map(etapa => (
            <ProgressStep
              key={etapa.etapa}
              label={nomeDaEtapa(etapa.etapa)}
              title={nomeDaEtapa(etapa.etapa)}
              secondaryLabel={ESTADO_DA_ETAPA[etapa.status] || etapa.status}
              description={etapa.mensagem || ''}
              onClick={() => onSelecionar?.(etapa)}
              className={[
                'ana-faixa__passo',
                foraDoFluxo(etapa) ? 'ana-faixa__passo--inaplicavel' : '',
                selecionada?.etapa === etapa.etapa ? 'ana-faixa__passo--selecionado' : '',
              ].join(' ').trim()}
              {...(ESTADO[etapa.status] || {})}
            />
          ))}
        </ProgressIndicator>
      )}
    </section>
  )
}

export default FaixaProcesso
