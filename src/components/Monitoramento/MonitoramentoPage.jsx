import { useCallback, useEffect, useState } from 'react'
import { InlineNotification, Loading } from '@carbon/react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useExecucao } from '../../hooks/useExecucao'
import {
  MODO_SIMULADO,
  listarAlertas,
  listarExecucoes,
  obterComparacao,
} from '../../services/monitorApi'
import { CICLO_SIMULADO } from '../../services/monitorMock'
import CabecalhoCiclo from './CabecalhoCiclo.jsx'
import CartoesKpi from './CartoesKpi.jsx'
import FeedAtividade from './FeedAtividade.jsx'
import HistoricoCiclos from './HistoricoCiclos.jsx'
import LinhaProcesso from './LinhaProcesso.jsx'
import PainelAprovacao from './PainelAprovacao.jsx'
import QuadroComparativo from './QuadroComparativo.jsx'
import VisualizadorFonte from './VisualizadorFonte.jsx'
import './MonitoramentoPage.scss'

// Aba Monitoramento, seção 11 do Handoff_Monitoramento_1.5_Bob.md.
//
// A tela acompanha o ciclo B1 a B8 em tempo real e é onde o analista aprova,
// edita ou rejeita a análise. O chat do Orchestrate continua disponível na aba
// Início, mas não é a tela principal do processo.

const EMISSOR = 'Ecorodovias'

function MonitoramentoPage() {
  const { user } = useAuth()
  const [execucaoId, setExecucaoId] = useState(null)
  const [comparacao, setComparacao] = useState(null)
  const [alerta, setAlerta] = useState(null)
  const [fonteAberta, setFonteAberta] = useState(null)
  const [etapaSelecionada, setEtapaSelecionada] = useState(null)
  const [aprovado, setAprovado] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [carregando, setCarregando] = useState(true)

  const { execucao, etapas, concluidas, total, aguardandoAprovacao, conectado, erro, simulado } =
    useExecucao(execucaoId, { aprovado })

  // Carrega o ciclo mais recente do emissor, a comparação e o alerta pendente.
  useEffect(() => {
    let ativo = true
    async function carregar() {
      try {
        const execucoes = await listarExecucoes(EMISSOR)
        if (!ativo) return
        if (!execucoes.length) {
          setErroCarga('Nenhum ciclo de monitoramento foi executado ainda.')
          return
        }
        setExecucaoId(execucoes[0].id)

        const alertas = await listarAlertas()
        if (!ativo) return
        const pendente = alertas.find(a => a.status_revisao === 'pendente') || alertas[0] || null
        setAlerta(pendente)

        if (pendente?.comparacao_id) {
          const comp = await obterComparacao(pendente.comparacao_id)
          if (ativo) setComparacao(comp)
        }
      } catch (e) {
        if (ativo) setErroCarga(e.message)
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    carregar()
    return () => {
      ativo = false
    }
  }, [])

  const abrirFonte = useCallback(fonte => setFonteAberta(fonte), [])

  if (carregando) {
    return (
      <main className="mon-pagina mon-pagina--vazia">
        <Loading withOverlay={false} description="Carregando o ciclo de monitoramento" />
      </main>
    )
  }

  if (erroCarga) {
    return (
      <main className="mon-pagina mon-pagina--vazia">
        <InlineNotification kind="info" lowContrast hideCloseButton
          title="Monitoramento indisponível" subtitle={erroCarga} />
      </main>
    )
  }

  const historico = simulado ? CICLO_SIMULADO.historico : []

  return (
    <main className="mon-pagina">
      <CabecalhoCiclo
        execucao={execucao}
        comparacao={comparacao}
        conectado={conectado}
        simulado={simulado}
      />

      {erro && (
        <InlineNotification kind="warning" lowContrast hideCloseButton
          title={erro} className="mon-pagina__aviso" />
      )}

      <p className="mon-pagina__progresso">
        {concluidas} de {total} etapas concluídas
      </p>

      <LinhaProcesso
        etapas={etapas}
        selecionada={etapaSelecionada}
        onSelecionar={setEtapaSelecionada}
      />

      <CartoesKpi comparacao={comparacao} execucao={execucao} />

      <div className="mon-pagina__colunas">
        <div className="mon-pagina__principal">
          <QuadroComparativo linhas={comparacao?.linhas} onAbrirFonte={abrirFonte} />

          {/* O painel só aparece quando o fluxo chega em B6, como manda a
              seção 11. Antes disso não há o que aprovar. */}
          {aguardandoAprovacao && alerta && (
            <PainelAprovacao
              alerta={alerta}
              usuario={user?.email || 'analista'}
              onDecidido={decisao => setAprovado(decisao !== 'rejeitado')}
            />
          )}
        </div>

        <aside className="mon-pagina__lateral">
          <FeedAtividade etapas={etapas} onAbrirFonte={abrirFonte} />
          <HistoricoCiclos ciclos={historico} />
        </aside>
      </div>

      <VisualizadorFonte
        fonte={fonteAberta}
        aberto={Boolean(fonteAberta)}
        onFechar={() => setFonteAberta(null)}
      />

      {MODO_SIMULADO && (
        <p className="mon-pagina__rodape">
          Modo simulado: o ciclo 2T26 roda sem backend, com os valores do caso de
          referência. Desligue com VITE_MONITOR_MOCK=false.
        </p>
      )}
    </main>
  )
}

export default MonitoramentoPage
