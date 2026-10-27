import { useEffect, useRef, useState } from 'react'
import { andamentoRelatorio } from '../services/relatoriosApi'

// Acompanha uma geração de relatório pela operação: a cada segundo enquanto gera, a cada 3 s depois, até a versão 2
// (interpretação redigida) sair, não se aplicar ou passarem 4 minutos. `inicial`: o que a tela já sabe (no chat, o
// andamento que veio pelo stream), para não piscar vazio. Sem operação, não consulta nada.
const TERMINAIS_V2 = ['pronta', 'nao_aplicavel', 'sem_texto']
const LIMITE_MS = 4 * 60 * 1000

export function acabou(andamento) {
  if (!andamento) return false
  if (andamento.estado === 'falhou') return true
  return andamento.estado === 'concluida' && TERMINAIS_V2.includes(andamento.versao_2?.estado)
}

export default function useAndamentoRelatorio(operacao, inicial = null) {
  const [andamento, setAndamento] = useState(inicial)
  const comeco = useRef(Date.now())

  // O stream do chat traz etapas mais novas que a última consulta: vale a de maior seq.
  useEffect(() => {
    if (inicial && (!andamento || (inicial.seq || 0) > (andamento.seq || 0))) setAndamento(inicial)
  }, [inicial]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!operacao) return undefined
    comeco.current = Date.now()
    let ativo = true
    let espera = null
    const consultar = async () => {
      let novo = null
      try {
        novo = await andamentoRelatorio(operacao)
      } catch {
        novo = null // fora do ar por um instante: tenta de novo
      }
      if (!ativo) return
      if (novo) setAndamento(atual => (!atual || (novo.seq || 0) >= (atual.seq || 0) ? novo : atual))
      if (acabou(novo) || Date.now() - comeco.current > LIMITE_MS) return
      espera = setTimeout(consultar, novo?.estado === 'concluida' ? 3000 : 1000)
    }
    consultar()
    return () => { ativo = false; clearTimeout(espera) }
  }, [operacao])

  return andamento
}
