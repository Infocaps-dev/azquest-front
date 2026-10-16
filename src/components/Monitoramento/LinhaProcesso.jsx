import { ProgressIndicator, ProgressStep } from '@carbon/react'
import { foraDoCaminho, nomeDaEtapa, semCodigos } from './niveis'

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

// A etapa do caminho que o ciclo não tomou. "Pendente" diria que ela ainda vem
// -- e ela não vem: o roteamento de B4 passou por fora dela.
const NAO_SE_APLICA = 'Não se aplica'

function LinhaProcesso({ etapas, destino, onSelecionar, selecionada }) {
  const pulada = etapa => foraDoCaminho(etapa, destino)

  // O ProgressIndicator do Carbon marca `complete: true` em todo passo antes
  // de `currentIndex`, sobrepondo o que cada passo declara. Com um ciclo
  // parado entre etapas -- quatro concluidas e quatro pendentes, sem nenhuma
  // em execucao -- a busca abaixo nao achava nada e o indice ia para o fim da
  // lista, pintando as oito como concluidas. A tela dizia que o ciclo tinha
  // terminado quando ele estava na metade.
  //
  // Por isso o indice e a primeira etapa que ainda nao concluiu: o que vem
  // antes dela esta feito, e e exatamente o que o Carbon marca.
  const emAndamento = etapas.findIndex(
    e => e.status === 'em_execucao' || e.status === 'aguardando_aprovacao',
  )
  // A etapa fora do caminho não conta como aberta. Sem isto o ciclo do 2T26,
  // com tudo feito e só o "Registrar sem impacto" por natureza nunca feito,
  // parava o indicador nela: a linha mostrava o ciclo em andamento numa etapa
  // que ele nunca ia percorrer.
  const primeiraAberta = etapas.findIndex(e => e.status !== 'concluido' && !pulada(e))
  const indiceAtual = emAndamento >= 0 ? emAndamento : primeiraAberta

  return (
    <section className="mon-processo" aria-label="Andamento do ciclo">
      <ProgressIndicator currentIndex={indiceAtual >= 0 ? indiceAtual : etapas.length}>
        {etapas.map(etapa => (
          <ProgressStep
            key={etapa.etapa}
            label={nomeDaEtapa(etapa.etapa)}
            title={nomeDaEtapa(etapa.etapa)}
            secondaryLabel={
              pulada(etapa) ? NAO_SE_APLICA : DESCRICAO[etapa.status] || etapa.status
            }
            description={semCodigos(etapa.mensagem) || ''}
            onClick={() => onSelecionar?.(etapa)}
            className={[
              'mon-processo__passo',
              pulada(etapa) ? 'mon-processo__passo--inaplicavel' : '',
              selecionada?.etapa === etapa.etapa ? 'mon-processo__passo--selecionado' : '',
            ].join(' ').trim()}
            {...(ESTADO[etapa.status] || {})}
            {...(pulada(etapa) ? { disabled: true } : {})}
          />
        ))}
      </ProgressIndicator>
    </section>
  )
}

export default LinhaProcesso
