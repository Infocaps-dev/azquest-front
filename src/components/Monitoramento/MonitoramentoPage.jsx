import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, InlineNotification, Loading, Select, SelectItem, Tag } from '@carbon/react'
import { Renew, Warning } from '@carbon/icons-react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useExecucao } from '../../hooks/useExecucao'
import {
  MODO_SIMULADO,
  comparacaoDoPeriodo,
  executarCiclo,
  historicoDeAprovacoes,
  historicoDeCiclos,
  listarAlertas,
  listarEmissores,
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
import PainelAprovacao from './PainelAprovacao.jsx'
import QuadroComparativo from './QuadroComparativo.jsx'
import VisualizadorFonte from './VisualizadorFonte.jsx'
import { nivelDe } from './niveis'
import './MonitoramentoPage.scss'

// Aba Monitoramento, seção 11 do Handoff_Monitoramento_1.5_Bob.md.
//
// A tela acompanha o ciclo B1 a B8 em tempo real e é onde o analista aprova,
// edita ou rejeita a análise. O chat do Orchestrate continua disponível na aba
// Início, mas não é a tela principal do processo.

// Emissor que abre a aba. A lista vem da monitor-api (/api/emissores): hoje
// Ecorodovias, do Piloto, e Motiva, da contraprova.
const EMISSOR_INICIAL = 'Ecorodovias'

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
//
// O emissor tambem filtra: Ecorodovias e Motiva tem o mesmo 2T26, e sem isso o
// alerta de uma aparecia para aprovacao na outra.
function alertaDoCiclo(alertas, periodo, emissor) {
  const doEmissor = alertas.filter(a => !emissor || !a.emissor || a.emissor === emissor)
  const doPeriodo = doEmissor.filter(a => !periodo || a.periodo === periodo)
  return doPeriodo[0] || doEmissor[0] || null
}

function MonitoramentoPage() {
  const { user } = useAuth()
  const [execucaoId, setExecucaoId] = useState(null)
  const [comparacao, setComparacao] = useState(null)
  const [alerta, setAlerta] = useState(null)
  const [fonteAberta, setFonteAberta] = useState(null)
  const [etapaSelecionada, setEtapaSelecionada] = useState(null)
  const [decisao, setDecisao] = useState(null)
  // Fechado ao abrir a aba: o ciclo pode estar parado na revisão humana desde
  // ontem, e a tela começa pelo processo, não pela decisão. O botão "Analisar
  // o impacto" abre; e abre sozinho quando um ciclo rodado aqui chega nela.
  const [aprovacaoAberta, setAprovacaoAberta] = useState(false)
  const [desvioAberto, setDesvioAberto] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [historico, setHistorico] = useState([])
  const [decisoes, setDecisoes] = useState([])
  const [rodando, setRodando] = useState(false)
  const [erroCiclo, setErroCiclo] = useState('')
  const [baseline, setBaseline] = useState(null)
  const [emissor, setEmissor] = useState(EMISSOR_INICIAL)
  const [emissores, setEmissores] = useState([])
  // Período escolhido para rodar. Vazio: o do ciclo aberto.
  const [periodoEscolhido, setPeriodoEscolhido] = useState('')
  // Emissor sem nenhum ciclo ainda (a Motiva, na primeira vez): a tela mostra
  // o processo zerado e o botão para rodar o primeiro, em vez de travar.
  const [semCiclo, setSemCiclo] = useState(false)

  const acompanhamento = useExecucao(execucaoId, { decisao, acompanhar: rodando })
  // O hook guarda a última execução que carregou. Logo depois de trocar de
  // emissor ela ainda é a do anterior, e as etapas dele apareceriam sob o nome
  // do novo: só vale a execução do emissor escolhido.
  const doEmissor = !acompanhamento.execucao?.emissor || acompanhamento.execucao.emissor === emissor
  const execucao = doEmissor ? acompanhamento.execucao : null
  const etapas = useMemo(() => (doEmissor ? acompanhamento.etapas : []), [doEmissor, acompanhamento.etapas])
  const aguardandoAprovacao = doEmissor && acompanhamento.aguardandoAprovacao
  const { erro } = acompanhamento
  // Só conta como terminado depois de ter visto o ciclo andando: a primeira
  // consulta pode trazer ainda o estado anterior ao clique.
  const vistoAndando = useRef(false)

  // Carrega o ciclo mais recente do emissor, a comparação e o alerta pendente.
  useEffect(() => {
    listarEmissores().then(setEmissores).catch(() => setEmissores([]))
  }, [])

  useEffect(() => {
    let ativo = true
    async function carregar() {
      try {
        const execucoes = await listarExecucoes(emissor)
        if (!ativo) return
        if (!execucoes.length) {
          const vigente = await obterBaseline(emissor).catch(() => null)
          if (!ativo) return
          setBaseline(vigente?.baseline ?? vigente)
          setSemCiclo(true)
          return
        }
        const ciclo = execucoes[0]
        setExecucaoId(ciclo.id)

        const alertas = await listarAlertas()
        if (!ativo) return
        const pendente = alertaDoCiclo(alertas, ciclo.periodo, emissor)
        setAlerta(pendente)

        // A comparação vem pelo período do ciclo, não pelo alerta: ciclo sem
        // impacto material não gera alerta e mesmo assim tem comparação.
        const comp =
          (await comparacaoDoPeriodo(emissor, ciclo.periodo)) ||
          (pendente?.comparacao_id ? await obterComparacao(pendente.comparacao_id) : null)
        if (ativo) setComparacao(comp)

        const [ciclos, decididas, vigente] = await Promise.all([
          historicoDeCiclos(emissor),
          historicoDeAprovacoes(emissor).catch(() => []),
          obterBaseline(emissor).catch(() => null),
        ])
        if (!ativo) return
        setHistorico(ciclos)
        setDecisoes(decididas)
        setBaseline(vigente?.baseline ?? vigente)
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
  }, [emissor])

  // Trocar de emissor zera a tela antes de carregar o outro: comparação,
  // alerta e histórico de um emissor não podem aparecer sob o nome do outro.
  function trocarEmissor(novo) {
    if (novo === emissor) return
    setCarregando(true)
    setErroCarga('')
    setSemCiclo(false)
    setExecucaoId(null)
    setComparacao(null)
    setAlerta(null)
    setHistorico([])
    setDecisoes([])
    setBaseline(null)
    setPeriodoEscolhido('')
    setAprovacaoAberta(false)
    setEmissor(novo)
  }

  const abrirFonte = useCallback(fonte => setFonteAberta(fonte), [])

  // O ciclo esta andando quando alguma etapa o diz. A desativacao do botao vem
  // do estado no banco, nao de um sinalizador local: quem roda o ciclo pode
  // ser o agente do Orchestrate, de fora desta tela.
  //
  // `aguardando_aprovacao` nao conta: ali o processo esta parado esperando uma
  // pessoa, e reiniciar e justamente o que ela pode querer fazer.
  const cicloEmAndamento = etapas.some(e => e.status === 'em_execucao')

  // Roda o ciclo do início, mesmo que o período já tenha passado por todas as
  // etapas: a API zera as oito, devolve na hora e segue em segundo plano. A
  // tela acompanha B1 a B6 andando pelo `acompanhar` do useExecucao.
  const periodosDoEmissor = emissores.find(e => e.emissor === emissor)?.periodos || []
  const periodoAlvo = periodoEscolhido || execucao?.periodo || periodosDoEmissor[0] || ''

  async function rodarCiclo() {
    if (!periodoAlvo) return
    // Limpa a tela antes de rodar: o ciclo recomeça na captura, e o que é da
    // rodada anterior (linha do processo, atividade, cartões, quadro
    // comparativo, alerta) não pode ficar à vista como se fosse da nova. Os
    // históricos ficam: são de todos os ciclos, e se atualizam no fim.
    acompanhamento.limpar()
    setComparacao(null)
    setAlerta(null)
    setEtapaSelecionada(null)
    setErroCiclo('')
    setAprovacaoAberta(false)
    vistoAndando.current = false
    setRodando(true)
    try {
      // O ciclo de outro período (ou o primeiro do emissor) tem outro id: a
      // tela passa a acompanhar o que a API acabou de semear.
      const semeada = await executarCiclo(emissor, periodoAlvo)
      if (semeada?.id) {
        setExecucaoId(semeada.id)
        setSemCiclo(false)
      }
    } catch (e) {
      setErroCiclo(e.message)
      setRodando(false)
    }
  }

  // Fim do ciclo rodado aqui: comparação, histórico e alerta são buscados uma
  // vez, e a decisão abre se o ciclo parou nela.
  useEffect(() => {
    if (!rodando || !etapas.length) return
    if (cicloEmAndamento) {
      vistoAndando.current = true
      return
    }
    if (!vistoAndando.current) return
    const periodo = execucao?.periodo
    const falhou = etapas.find(e => e.status === 'falhou')
    const parouNaDecisao = etapas.some(e => e.status === 'aguardando_aprovacao')
    let ativo = true
    Promise.all([
      comparacaoDoPeriodo(emissor, periodo),
      historicoDeCiclos(emissor),
      historicoDeAprovacoes(emissor).catch(() => []),
      listarAlertas(),
    ]).then(([comp, ciclos, decididas, alertas]) => {
      if (!ativo) return
      if (comp) setComparacao(comp)
      setHistorico(ciclos)
      setDecisoes(decididas)
      const pendente = alertaDoCiclo(alertas, periodo, emissor)
      setAlerta(pendente)
      if (falhou) setErroCiclo(`${falhou.etapa}: ${falhou.mensagem || 'falhou'}`)
      else if (parouNaDecisao && pendente) setAprovacaoAberta(true)
    }).catch(e => {
      if (ativo) setErroCiclo(e.message)
    }).finally(() => {
      if (ativo) setRodando(false)
    })
    return () => { ativo = false }
  }, [rodando, etapas, cicloEmAndamento, execucao?.periodo, emissor])

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

  // O aviso de desvio só abre fora de uma rodada e se o desvio durar: um
  // estado de passagem (ou atrasado no stream) não pode abrir modal sobre a
  // tela. Desvio de verdade persiste; 3 s bastam para separar os dois.
  const [desvioEstavel, setDesvioEstavel] = useState(false)
  const desvioAgora = temDesvio && !rodando
  useEffect(() => {
    if (!desvioAgora) {
      const zera = setTimeout(() => setDesvioEstavel(false), 0)
      return () => clearTimeout(zera)
    }
    const timer = setTimeout(() => setDesvioEstavel(true), 3000)
    return () => clearTimeout(timer)
  }, [desvioAgora])

  // O nível máximo do ciclo, para a etiqueta do cabeçalho. Sem comparação
  // ainda, cai em "informativo": dizer "Relevante" antes de comparar seria
  // anunciar um achado que não existe.
  const nivel = nivelDe(comparacao?.nivel_maximo)

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

      {/* Cabeçalho no mesmo padrão da aba Análise de Crédito: identidade à
          esquerda, ações à direita. As duas abas são o mesmo processo em
          momentos diferentes, e abrir uma depois da outra não deveria exigir
          reaprender onde ficam as coisas. */}
      <header className="mon-cabecalho">
        <div className="mon-cabecalho__identidade">
          <h1 className="mon-cabecalho__emissor">{emissor}</h1>
          <span className="mon-cabecalho__evento">
            {semCiclo ? 'Nenhum ciclo rodado ainda' : (execucao?.evento || `Ciclo ${execucao?.periodo || ''}`)}
          </span>
          {!semCiclo && <Tag type={nivel.tag} size="sm">{nivel.rotulo}</Tag>}
          {aguardandoAprovacao && (
            <span className="mon-cabecalho__estado">aguardando sua decisão</span>
          )}
        </div>
        <div className="mon-cabecalho__acoes">
          {/* Emissor e período do ciclo a rodar. Trocar o emissor recarrega a
              tela inteira; o período só vale para o próximo "Rodar". */}
          {emissores.length > 1 && (
            <Select id="mon-emissor" size="sm" labelText="Emissor" hideLabel inline
              value={emissor} disabled={rodando || cicloEmAndamento}
              onChange={e => trocarEmissor(e.target.value)}>
              {emissores.map(e => <SelectItem key={e.emissor} value={e.emissor} text={e.emissor} />)}
            </Select>
          )}
          {periodosDoEmissor.length > 0 && (
            <Select id="mon-periodo" size="sm" labelText="Período" hideLabel inline
              value={periodoAlvo} disabled={rodando || cicloEmAndamento}
              onChange={e => setPeriodoEscolhido(e.target.value)}>
              {periodosDoEmissor.map(p => <SelectItem key={p} value={p} text={p} />)}
            </Select>
          )}
          {/* "Analisar o impacto" aparece quando o ciclo chega nessa etapa, e
              some quando passa dela. Antes só existia como caminho de volta,
              depois de o modal ser fechado: quem fechasse e rolasse a tela não
              tinha como voltar à decisão sem recarregar. */}
          {aguardandoAprovacao && alerta && (
            <Button kind="primary" size="sm" renderIcon={Warning}
              onClick={() => setAprovacaoAberta(true)}>
              Analisar o impacto
            </Button>
          )}
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Renew}
            disabled={rodando || cicloEmAndamento || !periodoAlvo}
            onClick={rodarCiclo}
          >
            {rodando ? 'Rodando…'
              : periodoAlvo && periodoAlvo !== execucao?.periodo ? `Rodar ciclo do ${periodoAlvo}` : 'Rodar ciclo do início'}
          </Button>
        </div>
      </header>

      {/* Baseline em uso: a referência das comparações. Vem da última versão
          publicada na Análise de Crédito; o que ainda é do relatório de
          referência antigo aparece contado, para não ser lido como novo. */}
      {baseline?.versao && (
        <p className="mon-pagina__baseline">
          Baseline {baseline.versao}
          {baseline.relatorio_id
            ? ` · relatório publicado${baseline.publicado_por ? ` por ${baseline.publicado_por}` : ''}`
              + `${baseline.publicado_em ? ` em ${new Date(baseline.publicado_em).toLocaleString('pt-BR')}` : ''}`
            : ` · ${baseline.origem || 'relatório de referência'}`}
          {baseline.herdados_da_referencia?.length > 0
            && ` · ${baseline.herdados_da_referencia.length} item(ns) ainda do relatório de referência anterior`}
          {baseline.publicado_em && execucao?.inicio && baseline.publicado_em > execucao.inicio
            && ' · publicado depois deste ciclo: reprocesse para comparar com ele'}
          {baseline.a_validar_pelo_analista
            && ' · montado de documentos públicos, sem relatório interno: a validar pelo analista'}
        </p>
      )}

      {semCiclo && !rodando && (
        <InlineNotification kind="info" lowContrast hideCloseButton className="mon-pagina__aviso"
          title={`${emissor} ainda não tem ciclo de monitoramento.`}
          subtitle={periodosDoEmissor.length
            ? `Escolha o período e clique em "Rodar ciclo" para começar pela captura dos documentos (${periodosDoEmissor.join(', ')} disponíveis no acervo).`
            : 'Nenhum período com documento extraído no acervo deste emissor.'} />
      )}

      <LinhaProcesso
        etapas={etapas}
        destino={destino}
        selecionada={etapaSelecionada}
        onSelecionar={setEtapaSelecionada}
      />

      {erroCiclo && (
        <InlineNotification kind="error" lowContrast hideCloseButton
          title="Não foi possível rodar o ciclo" subtitle={erroCiclo}
          className="mon-pagina__aviso" />
      )}

      {/* Fechar o modal nao faz o assunto sumir: o ciclo continua parado ou
          aguardando decisao, e precisa de um caminho de volta. */}
      {desvioEstavel && !desvioAberto && (
        <p className="mon-pagina__retomar">
          <Button kind="tertiary" size="sm" onClick={() => setDesvioAberto(true)}>
            O ciclo segue por outro caminho
          </Button>
        </p>
      )}

      <CartoesKpi comparacao={comparacao} execucao={execucao} />

      {/* O quadro comparativo ocupa a largura toda: é a tabela que o analista
          lê linha a linha. Abaixo, duas colunas alinhadas no topo: à esquerda
          a atividade do ciclo corrente; à direita os dois históricos, o de
          ciclos em cima e o de aprovação embaixo. */}
      <QuadroComparativo linhas={comparacao?.linhas} onAbrirFonte={abrirFonte} />

      <div className="mon-pagina__historicos">
        <FeedAtividade etapas={etapas} onAbrirFonte={abrirFonte} />
        <div className="mon-pagina__coluna">
          <HistoricoCiclos ciclos={historico} />
          <HistoricoAprovacoes decisoes={decisoes} />
        </div>
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
            setDecisoes(await historicoDeAprovacoes(emissor).catch(() => []))
          }}
        />
      )}

      {desvioEstavel && (
        <ModalDesvio
          emissor={emissor}
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
