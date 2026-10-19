import { useCallback, useEffect, useRef, useState } from 'react'
import { listarResumos } from '../services/resumosApi'

// Relatórios novos (ou versões novas) que acabaram de ficar disponíveis.
//
// O analista pede o relatório no chat e quer abri-lo na hora; quem gera é o
// agente, e o relatório só aparece nas abas quando o monitor monta o resumo,
// segundos depois. Este hook acompanha a lista de resumos em qualquer aba e
// devolve um aviso para cada relatório que surgiu depois que a tela abriu.
//
// A primeira leitura só registra o que já existe: quem acabou de entrar não
// recebe aviso dos relatórios de ontem. Com a aba do navegador escondida a
// lista não é consultada; ao voltar, consulta na hora.

const INTERVALO_MS = 10000

export function useNovosRelatorios(ativo) {
  const vistos = useRef(null) // Map relatorio_id -> versão
  const [avisos, setAvisos] = useState([])
  const [sinal, setSinal] = useState(0) // muda a cada relatório novo: as abas recarregam a lista

  const consultar = useCallback(async () => {
    if (document.visibilityState === 'hidden') return
    let indice
    try {
      indice = await listarResumos()
    } catch {
      return // sessão expirada ou API fora do ar: tenta de novo no próximo ciclo
    }
    const relatorios = indice.relatorios || []
    if (!vistos.current) {
      vistos.current = new Map(relatorios.map(r => [r.relatorio_id, r.versao]))
      return
    }
    const novos = relatorios.filter(r => (vistos.current.get(r.relatorio_id) ?? 0) < r.versao)
    if (!novos.length) return
    novos.forEach(r => vistos.current.set(r.relatorio_id, r.versao))
    setSinal(s => s + 1)
    setAvisos(atuais => [
      ...novos.map(r => ({ ...r, chave: `${r.relatorio_id}-v${r.versao}`, em: Date.now() })),
      ...atuais.filter(a => !novos.some(n => n.relatorio_id === a.relatorio_id)),
    ].slice(0, 3))
  }, [])

  useEffect(() => {
    if (!ativo) return
    consultar()
    const relogio = setInterval(consultar, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') consultar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo, consultar])

  const dispensar = useCallback(chave => setAvisos(atuais => atuais.filter(a => a.chave !== chave)), [])

  // Versão que a própria tela criou (edição pelo botão "Editar" do relatório): ela já está aberta na frente do
  // analista, então não ganha aviso de "versão disponível". Registra antes de o índice mudar.
  const ignorar = useCallback((relatorioId, versao) => {
    vistos.current?.set(relatorioId, Math.max(vistos.current.get(relatorioId) ?? 0, versao))
    setAvisos(atuais => atuais.filter(a => !(a.relatorio_id === relatorioId && a.versao <= versao)))
  }, [])

  return { avisos, dispensar, sinal, ignorar }
}
