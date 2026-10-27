import { useCallback, useEffect, useRef, useState } from 'react'
import { iniciarPesquisaAtuacao, verPesquisaAtuacao } from '../../services/coletaApi'

// Setores da lista fechada da coleta-api (coleta/perfil.py, SETORES): o perfil só é gravado com um deles.
export const SETORES = [
  'rodovias', 'concessões de transporte (trilhos, aeroportos, portos)', 'logística', 'saneamento', 'energia elétrica',
  'óleo e gás', 'telecomunicações', 'imobiliário e construção', 'varejo', 'agronegócio', 'alimentos e bebidas', 'saúde',
  'educação', 'financeiro', 'indústria', 'mineração e siderurgia', 'papel e celulose', 'tecnologia', 'outro',
]

const INTERVALO_MS = 3000
const LIMITE_MS = 180000

// A pesquisa roda na coleta-api em segundo plano (CVM, B3, site oficial e o resumo com fontes): a tela consulta até
// ela terminar. estado: ocioso | pesquisando | pronta | sem_evidencia | erro.
export function usePesquisaAtuacao() {
  const [estado, setEstado] = useState('ocioso')
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')
  const vez = useRef(0)

  useEffect(() => () => { vez.current += 1 }, [])

  const iniciar = useCallback(async dados => {
    const minha = ++vez.current // "Pesquisar de novo" invalida a resposta da pesquisa anterior
    setEstado('pesquisando')
    setResultado(null)
    setErro('')
    try {
      const { pesquisa_id: id } = await iniciarPesquisaAtuacao(dados)
      const fim = Date.now() + LIMITE_MS
      while (Date.now() < fim) {
        await new Promise(r => setTimeout(r, INTERVALO_MS))
        if (minha !== vez.current) return
        const r = await verPesquisaAtuacao(id)
        if (r.status !== 'em_andamento') {
          if (minha !== vez.current) return
          setResultado({ ...r, pesquisa_id: id })
          setEstado(r.status === 'pronta' ? 'pronta' : 'sem_evidencia')
          return
        }
      }
      setErro('A pesquisa não terminou a tempo.')
      setEstado('erro')
    } catch (e) {
      if (minha !== vez.current) return
      setErro(e.message || 'Não foi possível pesquisar a atuação.')
      setEstado('erro')
    }
  }, [])

  const limpar = useCallback(() => {
    vez.current += 1
    setEstado('ocioso')
    setResultado(null)
    setErro('')
  }, [])

  return { estado, resultado, erro, iniciar, limpar }
}

const LISTAS = ['resumo', 'segmentos', 'principais_ativos', 'regioes']
const linhas = itens => (itens || []).map(i => i.texto).join('\n')

// Proposta editável (texto, uma linha por item) a partir do perfil pesquisado.
export function propostaDe(perfil) {
  const p = { setor: perfil?.setor || '' }
  LISTAS.forEach(k => { p[k] = linhas(perfil?.[k]) })
  return p
}

// O que vai para a coleta-api: as linhas viram itens; a linha que não mudou mantém as fontes que a sustentam, a
// editada vai sem fonte (a coleta-api marca o perfil como editado).
export function perfilParaEnvio(proposta, perfil) {
  const saida = { setor: proposta.setor }
  LISTAS.forEach(k => {
    const originais = Object.fromEntries((perfil?.[k] || []).map(i => [i.texto, i.fontes || []]))
    saida[k] = (proposta[k] || '').split('\n').map(t => t.trim()).filter(Boolean)
      .map(texto => ({ texto, fontes: originais[texto] || [] }))
  })
  return saida
}

export const propostaValida = p => Boolean(p?.setor && (p.resumo || '').trim())
