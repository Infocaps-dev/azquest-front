import { useCallback, useEffect, useState } from 'react'
import { Button, InlineNotification, Loading } from '@carbon/react'
import { Renew } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useExecucao } from '../../hooks/useExecucao'
import {
  MODO_SIMULADO,
  comparacaoDoPeriodo,
  executarCiclo,
  historicoDeAprovacoes,
  historicoDeCiclos,
  listarAlertas,
  listarExecucoes,
  obterBaseline,
  obterComparacao,
} from '../../services/monitorApi'
import CartoesKpi from './CartoesKpi.jsx'
import FeedAtividade from './FeedAtividade.jsx'
import HistoricoAprovacoes from './HistoricoAprovacoes.jsx'
import HistoricoCiclos from './HistoricoCiclos.jsx'
import LinhaProcesso from './LinhaProcesso.jsx'
import ModalDesvio from './ModalDesvio.jsx'
import SeloBaseline from './SeloBaseline.jsx'
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

// O alerta da rodada atual, não o primeiro pendente da lista.
//
// Cada rodada do ciclo grava um alerta novo. Rodar o 2T26 cinco vezes deixou
// cinco alertas do mesmo período, e os de rodadas anteriores que ninguém
// decidiu continuam "pendente" para sempre. Escolher "o primeiro pendente"
// trazia justamente o mais velho deles: a tela mostrava, para aprovação, a
// análise de uma rodada que não era a que estava em cima da mesa.
//
// A API devolve do mais recente para o mais antigo, então o primeiro alerta do
// período é o da rodada corrente, decidido ou não.
function alertaDoCiclo(alertas, periodo) {
  const doPeriodo = alertas.filter(a => !periodo || a.periodo === periodo)
  return doPeriodo[0] || alertas[0] || null
}

function MonitoramentoPage({ onTrocarAba }) {
  const { user } = useAuth()
  const [execucaoId, setExecucaoId] = useState(null)
  const [comparacao, setComparacao] = useState(null)
  const [alerta, setAlerta] = useState(null)
  const [fonteAberta, setFonteAberta] = useState(null)
  const [etapaSelecionada, setEtapaSelecionada] = useState(null)
  const [decisao, setDecisao] = useState(null)
  const [aprovacaoAberta, setAprovacaoAberta] = useState(true)
  const [desvioAberto, setDesvioAberto] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [historico, setHistorico] = useState([])
  const [decisoes, setDecisoes] = useState([])
  const [baseline, setBaseline] = useState(null)
  const [rodando, setRodando] = useState(false)
  const [erroCiclo, setErroCiclo] = useState('')

  const { execucao, etapas, aguardandoAprovacao, erro } =
    useExecucao(execucaoId, { decisao })

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
        const ciclo = execucoes[0]
        setExecucaoId(ciclo.id)

        const alertas = await listarAlertas()
        if (!ativo) return
        const pendente = alertaDoCiclo(alertas, ciclo.periodo)
        setAlerta(pendente)

        // A comparação vem pelo período do ciclo, não pelo alerta: ciclo sem
        // impacto material não gera alerta e mesmo assim tem comparação.
        const comp =
          (await comparacaoDoPeriodo(EMISSOR, ciclo.periodo)) ||
          (pendente?.comparacao_id ? await obterComparacao(pendente.comparacao_id) : null)
        if (ativo) setComparacao(comp)

        const [ciclos, decididas, tese] = await Promise.all([
          historicoDeCiclos(EMISSOR),
          historicoDeAprovacoes(EMISSOR).catch(() => []),
          // O baseline diz contra que tese o ciclo compara. Falhar aqui não
          // derruba a tela: o ciclo continua legível sem o selo.
          obterBaseline(EMISSOR).catch(() => null),
        ])
        if (!ativo) return
        setHistorico(ciclos)
        setDecisoes(decididas)
        setBaseline(tese)
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

  // O ciclo esta andando quando alguma etapa o diz. A desativacao do botao vem
  // do estado no banco, nao de um sinalizador local: quem roda o ciclo pode
  // ser o agente do Orchestrate, de fora desta tela.
  //
  // `aguardando_aprovacao` nao conta: ali o processo esta parado esperando uma
  // pessoa, e reiniciar e justamente o que ela pode querer fazer.
  const cicloEmAndamento = etapas.some(e => e.status === 'em_execucao')

  async function rodarCiclo() {
    if (!execucao?.periodo) return
    setErroCiclo('')
    setRodando(true)
    try {
      await executarCiclo(EMISSOR, execucao.periodo)
      // O stream empurra as etapas conforme elas mudam; a comparacao e o
      // historico sao buscados uma vez, ao fim.
      const [comp, ciclos, decididas] = await Promise.all([
        comparacaoDoPeriodo(EMISSOR, execucao.periodo),
        historicoDeCiclos(EMISSOR),
        historicoDeAprovacoes(EMISSOR).catch(() => []),
      ])
      if (comp) setComparacao(comp)
      setHistorico(ciclos)
      setDecisoes(decididas)
      const alertas = await listarAlertas()
      setAlerta(alertaDoCiclo(alertas, execucao.periodo))
    } catch (e) {
      setErroCiclo(e.message)
    } finally {
      setRodando(false)
    }
  }

  // Desvio de roteamento: o ciclo esta parado numa etapa que nao vai rodar.
  //
  // O fluxo se divide em B4. Quando o roteamento aponta uma etapa adiante e as
  // etapas entre ela e a atual continuam pendentes, o ciclo nao vai sair do
  // lugar sozinho -- e sem aviso o analista so ve um processo travado.
  const destino = comparacao?.roteamento?.destino
  const indiceDestino = destino ? etapas.findIndex(e => e.etapa === destino) : -1
  const primeiraAberta = etapas.findIndex(e => e.status !== 'concluido')
  const temDesvio =
    indiceDestino >= 0 &&
    primeiraAberta >= 0 &&
    primeiraAberta < indiceDestino &&
    etapas[indiceDestino]?.status === 'pendente' &&
    !etapas.some(e => e.status === 'em_execucao' || e.status === 'aguardando_aprovacao')
  const etapaApontada = temDesvio ? etapas[primeiraAberta]?.etapa : null

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

  return (
    <main className="mon-pagina">
      {erro && (
        <InlineNotification kind="warning" lowContrast hideCloseButton
          title={erro} className="mon-pagina__aviso" />
      )}

      {/* O botão fica ao lado da linha do processo, não acima: acrescentar uma
          ação não deve custar uma faixa inteira da primeira tela. */}
      <div className="mon-pagina__topo">
        <LinhaProcesso
          etapas={etapas}
          destino={destino}
          selecionada={etapaSelecionada}
          onSelecionar={setEtapaSelecionada}
        />
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Renew}
          disabled={rodando || cicloEmAndamento}
          onClick={rodarCiclo}
          className="mon-pagina__reiniciar"
        >
          {rodando ? 'Rodando…' : 'Reiniciar'}
        </Button>
      </div>

      {erroCiclo && (
        <InlineNotification kind="error" lowContrast hideCloseButton
          title="Não foi possível rodar o ciclo" subtitle={erroCiclo}
          className="mon-pagina__aviso" />
      )}

      {/* Fechar o modal nao faz o assunto sumir: o ciclo continua parado ou
          aguardando decisao, e precisa de um caminho de volta. */}
      {(temDesvio && !desvioAberto) || (aguardandoAprovacao && alerta && !aprovacaoAberta) ? (
        <p className="mon-pagina__retomar">
          {temDesvio && !desvioAberto && (
            <Button kind="tertiary" size="sm" onClick={() => setDesvioAberto(true)}>
              O ciclo segue por outro caminho
            </Button>
          )}
          {aguardandoAprovacao && alerta && !aprovacaoAberta && (
            <Button kind="primary" size="sm" onClick={() => setAprovacaoAberta(true)}>
              Revisar a análise de impacto
            </Button>
          )}
        </p>
      ) : null}

      <SeloBaseline baseline={baseline} onTrocarAba={onTrocarAba} />

      <CartoesKpi comparacao={comparacao} execucao={execucao} />

      <div className="mon-pagina__colunas">
        <div className="mon-pagina__principal">
          <QuadroComparativo linhas={comparacao?.linhas} onAbrirFonte={abrirFonte} />


        </div>

        <aside className="mon-pagina__lateral">
          {/* O historico vem antes da atividade: ele situa o ciclo de hoje
              contra os anteriores, e e essa comparacao que o analista procura
              ao abrir a tela. A atividade e o detalhe do ciclo corrente. */}
          <HistoricoCiclos ciclos={historico} />
          <FeedAtividade etapas={etapas} onAbrirFonte={abrirFonte} />
          <HistoricoAprovacoes decisoes={decisoes} />
        </aside>
      </div>

      {/* A decisão e o aviso de desvio vêm como modal: numa tela que rola, o
          que trava o ciclo não pode ficar no rodapé, fora do campo de visão. */}
      {aguardandoAprovacao && alerta && (
        <PainelAprovacao
          alerta={alerta}
          usuario={user?.email || 'analista'}
          aberto={aprovacaoAberta}
          onFechar={() => setAprovacaoAberta(false)}
          onDecidido={async tomada => {
            setDecisao(tomada)
            // A decisão que acabou de ser assinada entra no histórico sem
            // precisar recarregar a aba.
            setDecisoes(await historicoDeAprovacoes(EMISSOR).catch(() => []))
          }}
        />
      )}

      {temDesvio && (
        <ModalDesvio
          emissor={EMISSOR}
          periodo={execucao?.periodo}
          comparacao={comparacao}
          etapaApontada={etapaApontada}
          destino={destino}
          aberto={desvioAberto}
          onFechar={() => setDesvioAberto(false)}
        />
      )}

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
