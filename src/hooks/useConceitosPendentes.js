import { useCallback, useEffect, useState } from 'react'
import { filaDeConceitos } from '../services/conceitosApi'

// Quantas perguntas de conceito esperam o analista (29/10/2026): os Conceitos ficam dentro da Análise de Crédito,
// com o número como notificação na aba e no botão. Atualiza ao entrar, a cada 2 minutos e quando a tela dos
// conceitos grava uma resposta (`atualizar`). Falha de leitura não zera nem inventa número: fica o último lido.
const INTERVALO_MS = 120000

export function useConceitosPendentes(ativo) {
  const [pendentes, setPendentes] = useState(0)
  const atualizar = useCallback(() => filaDeConceitos()
    .then(fila => setPendentes((fila.empresas || []).reduce((n, e) => n + (e.itens || []).length, 0)))
    .catch(() => {}), [])
  useEffect(() => {
    if (!ativo) return undefined
    atualizar()
    const relogio = setInterval(atualizar, INTERVALO_MS)
    return () => clearInterval(relogio)
  }, [ativo, atualizar])
  return [pendentes, atualizar]
}
