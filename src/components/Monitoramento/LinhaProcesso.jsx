import { ProgressIndicator, ProgressStep } from '@carbon/react'

// Linha do processo B1 a B8, item 2 da seção 11 do handoff.
//
// O ProgressIndicator do Carbon tem quatro estados: complete, current, invalid
// e incomplete. O fluxo tem cinco, porque "aguardando aprovação" é diferente de
// "em execução": num o processo trabalha, no outro ele parou esperando a
// pessoa. A diferença aparece no rótulo secundário, já que o componente não
// tem um quinto estado visual.

const ESTADO = {
  concluido: { complete: true },
  em_execucao: { current: true },
  aguardando_aprovacao: { current: true },
  bloqueado: { invalid: true },
  falhou: { invalid: true },
  pendente: {},
}

const DESCRICAO = {
  concluido: 'Concluído',
  em_execucao: 'Em execução',
  aguardando_aprovacao: 'Aguardando aprovação',
  bloqueado: 'Bloqueado',
  falhou: 'Falhou',
  pendente: 'Pendente',
}

function LinhaProcesso({ etapas, onSelecionar, selecionada }) {
  const indiceAtual = etapas.findIndex(
    e => e.status === 'em_execucao' || e.status === 'aguardando_aprovacao',
  )

  return (
    <section className="mon-processo" aria-label="Andamento do ciclo">
      <ProgressIndicator currentIndex={indiceAtual >= 0 ? indiceAtual : etapas.length}>
        {etapas.map(etapa => (
          <ProgressStep
            key={etapa.etapa}
            label={etapa.etapa}
            secondaryLabel={DESCRICAO[etapa.status] || etapa.status}
            description={etapa.mensagem || ''}
            onClick={() => onSelecionar?.(etapa)}
            className={[
              'mon-processo__passo',
              selecionada?.etapa === etapa.etapa ? 'mon-processo__passo--selecionado' : '',
            ].join(' ').trim()}
            {...(ESTADO[etapa.status] || {})}
          />
        ))}
      </ProgressIndicator>
    </section>
  )
}

export default LinhaProcesso
