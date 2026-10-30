import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Dropdown, InlineNotification, SkeletonPlaceholder, SkeletonText, Tag } from '@carbon/react'
import { Add, Catalog, ChartLineData, Document, DocumentPdf, Renew, TaskApproved } from '@carbon/icons-react'
import { useLocation, useNavigate } from 'react-router'
import {
  aplicarAjustes,
  decidirInconsistencia,
  decidirItem,
  decidirLote,
  acordarPdf,
  devolver,
  listarResumos,
  obterResumo,
  obterRevisao,
  publicar,
} from '../../services/resumosApi'
import { gerarRelatorioPadrao } from '../../services/relatoriosApi'
import useAndamentoRelatorio from '../../hooks/useAndamentoRelatorio'
import ProgressoRelatorio from '../Relatorio/ProgressoRelatorio.jsx'
import GerarRelatorio from '../Relatorio/GerarRelatorio.jsx'
import { AVISO_LIGANDO_PDF, rotuloGerandoPdf, useBaixarPdf } from '../../hooks/useBaixarPdf'
import ReferenciasRelatorio from './ReferenciasRelatorio.jsx'
import NumerosChave from './NumerosChave.jsx'
import PainelRevisao from './PainelRevisao.jsx'
import RelatorioCompleto from './RelatorioCompleto.jsx'
import SecoesRelatorio from './SecoesRelatorio.jsx'
import SumarioTese from './SumarioTese.jsx'
import { ProvedorDeFontes } from './FontesDoDocumento.jsx'
import Carregando from '../Comum/Carregando.jsx'
import { caminhoDoRelatorio, definirTitulo, relatorioDoCaminho } from '../../rotas'
import { STATUS_VERSAO, dataHora } from './vocabulario'
import RotuloFixo from '../Comum/RotuloFixo.jsx'
import './AnalisePage.scss'

// Aba Análise de Crédito: o relatório gerado pelo agente, resumido e revisável.
//
// Os dados vêm da resumos-api: o resumo de cada relatório é montado por código
// pelo monitor, a cada versão publicada no bucket. A ordem da tela segue o que
// importa para quem abre: números-chave no topo, sumário da tese, as seções do
// relatório com o que falta revisar, e o relatório completo a um clique, aberto
// sempre no lugar do que foi clicado.
//
// Cobertura e tempos de execução ficam na aba Desempenho: medem o sistema, não
// o emissor, e não fazem parte do relatório.

function rotuloRelatorio(r) {
  return `${r.empresa} · ${r.periodo} · versão ${r.versao} · ${dataHora(r.atualizado_em)}`
}

// Primeira carga da aba: o formato da página (cabeçalho, números-chave, sumário e seções) em esqueleto, em vez de um
// spinner solto. Trocar de relatório depois disso mostra o carregamento por cima da página atual.
function EsqueletoAnalise() {
  return (
    <main className="ana-pagina" aria-busy="true" aria-label="Carregando a análise de crédito">
      <header className="ana-cabecalho">
        <div className="ana-esqueleto__identidade">
          <SkeletonText heading width="16rem" />
          <SkeletonText width="10rem" />
        </div>
      </header>
      <section className="ana-numeros">
        <div className="ana-numeros__grade">
          {[0, 1, 2, 3].map(i => <SkeletonPlaceholder key={i} className="ana-esqueleto__kpi" />)}
        </div>
      </section>
      <section className="ana-esqueleto__bloco"><SkeletonText paragraph lineCount={4} /></section>
      <section className="ana-esqueleto__bloco"><SkeletonText paragraph lineCount={6} /></section>
    </main>
  )
}

// Seletor de relatórios: o primeiro item gera um relatório novo (abre o diálogo de empresa e período) em vez de
// selecionar; os demais são os relatórios disponíveis.
const GERAR_NOVO = { relatorio_id: '__gerar__' }
const textoDoItem = r => (!r ? '' : r === GERAR_NOVO ? 'Gerar novo relatório' : rotuloRelatorio(r))
const itemDoSeletor = r => (r === GERAR_NOVO
  ? <span className="ana-seletor__gerar"><Add size={16} /> Gerar novo relatório</span>
  : <span>{rotuloRelatorio(r)}</span>)

// Endereço (28/10/2026): /relatorios/<id> é o relatório na tela e /relatorios/<id>/completo, o relatório completo
// aberto por cima. A URL manda: escolher outro relatório navega (fica no histórico); as trocas que a tela faz sozinha
// (abrir o mais recente em /relatorios, abrir o recém-gerado) substituem o endereço. Id que não existe mostra "não
// encontrado" com a lista, em vez de abrir outro relatório no lugar.
function AnalisePage({ onTrocarAba, sinalIndice, onVersaoPropria, onConversar, onRelatorioAtual, conceitosPendentes = 0,
  onAbrirConceitos }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { id: relatorioDaUrl, completo } = relatorioDoCaminho(location.pathname)
  const relatorioId = relatorioDaUrl || ''
  const ir = useCallback((id, { replace = false } = {}) => navigate(caminhoDoRelatorio(id), { replace }), [navigate])
  const [naoEncontrado, setNaoEncontrado] = useState('')
  const [relatorios, setRelatorios] = useState([])
  const [resumo, setResumo] = useState(null)
  const [revisao, setRevisao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [aviso, setAviso] = useState(null)
  const [painel, setPainel] = useState({ aberto: false, filtro: null })
  const [ancoraCompleto, setAncoraCompleto] = useState(null) // onde o relatório completo abre
  const [reprocessando, setReprocessando] = useState(false)
  // Geração pelo botão Reprocessar: {operacao, origem (o relatório de onde pediu), esperando (o novo)}.
  const [geracao, setGeracao] = useState(null)
  const andamentoGeracao = useAndamentoRelatorio(geracao?.operacao || null)
  const [gerarAberto, setGerarAberto] = useState(false) // diálogo Gerar relatório (empresa e período)
  // Versão 2 automática (interpretação redigida pelo agente, só fora do piloto): depois da geração, a tela acompanha
  // o preparo dela no relatório aberto, em vez de deixar o diálogo aberto até ela chegar. {operacao, relatorioId}
  const [acompanhada, setAcompanhada] = useState(null)
  const andamentoV2 = useAndamentoRelatorio(acompanhada?.operacao || null)
  const estadoV2 = acompanhada?.relatorioId === relatorioId ? andamentoV2?.versao_2?.estado : null
  const [enviando, setEnviando] = useState(false) // publicar, devolver, gerar versão: um clique só
  // O relatório que está na tela agora: respostas que chegam depois de o analista trocar de relatório são descartadas,
  // em vez de mostrar o relatório A com as decisões indo para o B.
  const atual = useRef('')
  // Versões criadas pela edição no próprio relatório: a tela já está nelas, então não ganham o aviso de "chegou a
  // versão N" (nem o do App, que é suprimido por onVersaoPropria).
  const versoesProprias = useRef(new Set())
  // Relatório gerado pelo diálogo cujo resumo ainda não tinha chegado: abre quando aparecer na lista.
  const aguardado = useRef(null)
  // Relatório recém-gerado pelo diálogo (30/10/2026): a tela fica carregando até o resumo dele chegar, em vez de voltar
  // para o relatório que estava aberto e trocar de repente. {id, descricao}; escolher outro relatório cancela.
  const [abrindoNovo, setAbrindoNovo] = useState(null)
  const pdf = useBaixarPdf()

  // O serviço de PDF desliga quando fica parado: liga ao abrir a aba, para o "Baixar PDF" não esperar ele religar.
  useEffect(() => { acordarPdf() }, [])

  useEffect(() => {
    if (pdf.erro) setAviso({ kind: 'error', title: 'O PDF não foi gerado', subtitle: pdf.erro })
  }, [pdf.erro])

  useEffect(() => {
    let ativo = true
    listarResumos()
      .then(indice => {
        if (!ativo) return
        setRelatorios(indice.relatorios || [])
        if (relatorioDaUrl) return // o do endereço carrega sozinho (mesmo fora da lista: link antigo vira "não encontrado")
        // /relatorios sem relatório no endereço (29/10/2026): a tela abre sem nenhum, para o analista escolher qual ver;
        // antes ela abria sozinha o mais recente.
        if (!indice.relatorios?.length) setErroCarga('Nenhum relatório gerado ainda. Gere um aqui ou peça ao agente no chat.')
        setCarregando(false)
      })
      .catch(e => {
        if (ativo) {
          setErroCarga(e.message)
          setCarregando(false)
        }
      })
    return () => { ativo = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- só na abertura da aba

  const carregar = useCallback(async id => {
    const [novoResumo, novaRevisao] = await Promise.all([obterResumo(id), obterRevisao(id)])
    if (atual.current !== id) return null // o analista já trocou de relatório
    setResumo(novoResumo)
    setRevisao(novaRevisao)
    return novoResumo
  }, [])

  useEffect(() => {
    if (!relatorioId) return
    atual.current = relatorioId
    setNaoEncontrado('')
    setAviso(null)
    setCarregando(true)
    onRelatorioAtual?.(relatorioId)
    carregar(relatorioId)
      .catch(e => {
        if (atual.current !== relatorioId) return
        setResumo(null)
        setRevisao(null)
        setNaoEncontrado(e.message)
      })
      .finally(() => { if (atual.current === relatorioId) setCarregando(false) })
  }, [relatorioId, carregar]) // eslint-disable-line react-hooks/exhaustive-deps -- onRelatorioAtual é do App

  // /relatorios de novo (aba clicada estando num relatório, voltar do navegador): fica no relatório que já estava aberto.
  useEffect(() => {
    if (!relatorioDaUrl && atual.current) ir(atual.current, { replace: true })
  }, [relatorioDaUrl, ir])

  // Título da aba do navegador: o relatório aberto.
  useEffect(() => {
    if (naoEncontrado) definirTitulo('Relatório não encontrado')
    else if (resumo?.relatorio_id === relatorioId) {
      definirTitulo(`${resumo.empresa} · ${resumo.periodo}${completo ? ' — relatório completo' : ''}`, 'Análise de crédito')
    } else definirTitulo('Análise de crédito')
  }, [naoEncontrado, resumo, relatorioId, completo])

  // Relatório novo disponível (aviso do App): a lista do seletor se atualiza. Se o relatório aberto ganhou versão nova
  // (edição pelo chat, por exemplo), a tela recarrega, para ninguém decidir sobre um texto que já mudou.
  useEffect(() => {
    if (!sinalIndice) return
    listarResumos().then(indice => {
      setRelatorios(indice.relatorios || [])
      // Relatório gerado pelo diálogo à espera: o que chegou abre na hora. Sem relatório aberto (tela de escolha), nada
      // abre sozinho: o analista escolhe (29/10/2026).
      const lista = indice.relatorios || []
      const esperado = aguardado.current && lista.find(r => r.relatorio_id === aguardado.current)
      if (esperado) {
        aguardado.current = null
        setErroCarga('')
        ir(esperado.relatorio_id, { replace: true })
        return
      }
      const linha = (indice.relatorios || []).find(r => r.relatorio_id === atual.current)
      if (linha && resumo && linha.versao > resumo.versao) {
        const propria = versoesProprias.current.has(`${linha.relatorio_id}-v${linha.versao}`)
        carregar(atual.current).then(novo => {
          if (!novo || propria) return
          // Versão 2 que o job publica sozinho depois da 1 (execucao.operacao "redacao"): não é edição de ninguém.
          setAviso(novo.execucao?.operacao === 'redacao'
            ? { kind: 'success', title: `Versão ${novo.versao} pronta, com a interpretação automática`,
              subtitle: 'O agente redigiu a interpretação a partir dos documentos e ela passou na conferência dos '
                + 'números. Os trechos aparecem marcados como rascunho para a sua revisão.' }
            : { kind: 'info', title: `Chegou a versão ${novo.versao} deste relatório`,
              subtitle: 'A tela foi atualizada. Itens cujo texto mudou voltaram a pendente.' })
          if (acompanhada?.relatorioId === novo.relatorio_id) setAcompanhada(null)
        })
      }
    }).catch(() => {})
  }, [sinalIndice]) // eslint-disable-line react-hooks/exhaustive-deps -- reage ao sinal, não ao resumo

  // Erro de versão (409 com versao_atual): o relatório mudou enquanto a tela estava aberta. Recarrega e avisa.
  const tratarErro = useCallback(async (e, titulo) => {
    if (e.versaoAtual) {
      await carregar(atual.current).catch(() => {})
      setAviso({ kind: 'warning', title: `O relatório mudou para a versão ${e.versaoAtual}`, subtitle: e.message })
    } else {
      setAviso({ kind: 'error', title: titulo, subtitle: e.message })
    }
  }, [carregar])

  // Versão nova com os ajustes em geração: acompanha até o resumo da versão nova chegar (o job publica o relatório e,
  // num segundo evento, o monitor refaz o resumo). Desiste em 5 minutos, com aviso; o pedido sem resposta pode ser
  // refeito depois de 15 minutos.
  const gerando = revisao?.ajustes?.pedido
  useEffect(() => {
    if (!gerando || gerando.atrasado || !relatorioId) return
    const base = gerando.versao_base
    const limite = Date.now() + 5 * 60 * 1000
    const relogio = setInterval(async () => {
      try {
        if (Date.now() > limite) {
          clearInterval(relogio)
          setAviso({ kind: 'warning', title: 'A versão nova está demorando',
            subtitle: 'Recarregue a tela em alguns minutos. Se nada mudar, o pedido pode ser refeito depois de 15 minutos.' })
          return
        }
        const [nova, novoResumo] = await Promise.all([obterRevisao(relatorioId), obterResumo(relatorioId)])
        if (nova.ajustes?.pedido || novoResumo.versao <= base) return
        clearInterval(relogio)
        if (atual.current !== relatorioId) return
        setResumo(novoResumo)
        setRevisao(nova)
        listarResumos().then(i => setRelatorios(i.relatorios || [])).catch(() => {})
        const erros = Object.values(nova.itens).filter(i => i.aplicacao?.status === 'erro').length
        setAviso(erros
          ? { kind: 'warning', title: `Versão ${novoResumo.versao} gerada, mas ${erros} ajuste(s) não entraram`,
            subtitle: 'Veja o motivo em cada item no painel de revisão.' }
          : { kind: 'success', title: `Versão ${novoResumo.versao} gerada com os ajustes`,
            subtitle: 'O relatório completo já mostra os textos ajustados.' })
      } catch {
        // falha de rede passageira: tenta de novo no próximo ciclo
      }
    }, 4000)
    return () => clearInterval(relogio)
  }, [gerando, relatorioId])

  async function gerarVersao() {
    setAviso(null)
    setEnviando(true)
    try {
      setRevisao(await aplicarAjustes(relatorioId, resumo.versao))
    } catch (e) {
      await tratarErro(e, 'Não foi possível gerar a versão nova')
    } finally {
      setEnviando(false)
    }
  }

  // Relatório completo: endereço próprio (/completo), para o link levar direto a ele e o "voltar" do navegador fechá-lo.
  // Fechar volta no histórico quando foi aberto aqui; aberto por link, troca o endereço pelo do relatório.
  const abrirRelatorio = useCallback(ancora => {
    setAncoraCompleto(ancora || null)
    navigate(caminhoDoRelatorio(atual.current, { completo: true }), { state: { completoPelaTela: true } })
  }, [navigate])
  function fecharRelatorioCompleto() {
    setAncoraCompleto(null)
    if (location.state?.completoPelaTela) navigate(-1)
    else navigate(caminhoDoRelatorio(relatorioId), { replace: true })
  }

  // Versão nova feita pelo botão "Editar" do relatório completo. O relatório já está na tela nessa versão; o resumo
  // (cartões, revisão) chega quando o monitor o refaz, segundos depois, e a tela o acompanha em silêncio.
  const versaoDaEdicao = useCallback(versao => {
    const id = atual.current
    versoesProprias.current.add(`${id}-v${versao}`)
    onVersaoPropria?.(id, versao)
    const limite = Date.now() + 3 * 60 * 1000
    const relogio = setInterval(async () => {
      if (atual.current !== id || Date.now() > limite) {
        clearInterval(relogio)
        return
      }
      try {
        const novo = await obterResumo(id)
        if (novo.versao < versao) return
        clearInterval(relogio)
        await carregar(id)
        listarResumos().then(i => setRelatorios(i.relatorios || [])).catch(() => {})
      } catch {
        // resumo ainda não refeito ou rede: tenta no próximo ciclo
      }
    }, 4000)
  }, [carregar, onVersaoPropria])
  const abrirRevisao = useCallback(filtro => setPainel({ aberto: true, filtro: filtro || null }), [])

  // Decisões do painel: levam a versão que está na tela. Se ela mudou, a tela recarrega e o erro sobe para o painel.
  async function decidir(itemId, decisao) {
    try {
      setRevisao(await decidirItem(relatorioId, itemId, { ...decisao, versao: resumo.versao }))
    } catch (e) {
      if (e.versaoAtual) await carregar(atual.current).catch(() => {})
      throw e
    }
  }

  async function inconsistencia(itemId, acao, texto) {
    try {
      setRevisao(await decidirInconsistencia(relatorioId, { itemId, acao, texto, versao: resumo.versao }))
    } catch (e) {
      if (e.versaoAtual) await carregar(atual.current).catch(() => {})
      throw e
    }
  }

  async function decidirVarios(ids, decisao) {
    try {
      setRevisao(await decidirLote(relatorioId, ids, { ...decisao, versao: resumo.versao }))
    } catch (e) {
      if (e.versaoAtual) await carregar(atual.current).catch(() => {})
      throw e
    }
  }

  async function publicarVersao() {
    setAviso(null)
    setEnviando(true)
    try {
      const resultado = await publicar(relatorioId, resumo.versao)
      setRevisao(resultado)
      setAviso({
        kind: 'success',
        title: `Versão ${resumo.versao} publicada`,
        subtitle: resultado.baseline?.enviado
          ? 'O baseline chegou ao Monitoramento.'
          : `Baseline não enviado ao Monitoramento: ${resultado.baseline?.motivo}`,
      })
    } catch (e) {
      await tratarErro(e, 'Não foi possível publicar')
    } finally {
      setEnviando(false)
    }
  }

  // Reprocessar (27/10/2026): o relatório padrão do mesmo emissor e período pelo serviço de geração, sem o agente
  // (2-7 s em vez dos 18-26 s do chat), com as etapas reais na tela. Ele é gerado do zero, a partir dos documentos
  // atuais: a revisão e os ajustes desta versão continuam no relatório atual. Personalização: pelo chat. O aviso diz
  // o que de fato aconteceu: dizer "reprocessado" sem relatório novo faria o analista crer que o documento mudou.
  async function reprocessarRelatorio() {
    if (!window.confirm(`Gerar um relatório novo (${resumo.empresa}, ${resumo.periodo})?`
      + '\n\nEle é gerado do zero, com os documentos atuais. A revisão e os ajustes desta versão continuam no relatório atual.')) return
    setAviso(null)
    setReprocessando(true)
    try {
      const pedido = await gerarRelatorioPadrao({ empresa: resumo.empresa, periodo: resumo.periodo })
      setGeracao({ operacao: pedido.operacao_id, origem: relatorioId })
    } catch (e) {
      setReprocessando(false)
      setAviso({ kind: 'warning', title: 'O relatório não foi regerado', subtitle: e.message })
    }
  }

  // Fim da geração: espera o resumo do relatório novo chegar (o monitor monta em segundos) e muda a tela para ele,
  // se o analista continua no relatório de onde pediu; se mudou, o aviso do App leva ao novo.
  useEffect(() => {
    if (!geracao || !andamentoGeracao) return undefined
    if (andamentoGeracao.estado === 'falhou') {
      setReprocessando(false)
      setAviso({ kind: 'warning', title: 'O relatório não foi regerado', subtitle: andamentoGeracao.erro || '' })
      return undefined
    }
    const novoId = andamentoGeracao.estado === 'concluida' && andamentoGeracao.relatorio_id
    if (!novoId || geracao.esperando === novoId) return undefined
    setGeracao(g => ({ ...g, esperando: novoId }))
    let ativo = true
    ;(async () => {
      for (let tentativa = 0; tentativa < 30 && ativo; tentativa++) {
        const indice = await listarResumos().catch(() => null)
        if (indice?.relatorios?.some(r => r.relatorio_id === novoId)) {
          setRelatorios(indice.relatorios)
          setReprocessando(false)
          setAcompanhada({ operacao: geracao.operacao, relatorioId: novoId })
          if (atual.current === geracao.origem) ir(novoId, { replace: true })
          return
        }
        await new Promise(r => setTimeout(r, 2000))
      }
      if (ativo) {
        setReprocessando(false)
        setAviso({ kind: 'warning', title: 'O relatório foi gerado, mas o resumo ainda não chegou',
          subtitle: `Relatório ${novoId}. Ele aparece no seletor assim que o resumo for montado.` })
      }
    })()
    return () => { ativo = false }
  }, [andamentoGeracao, geracao])

  async function devolverVersao() {
    const justificativa = window.prompt('Por que a versão está sendo devolvida para ajuste?')
    if (!justificativa?.trim()) return
    setAviso(null)
    setEnviando(true)
    try {
      setRevisao(await devolver(relatorioId, justificativa, resumo.versao))
      setAviso({ kind: 'info', title: 'Versão devolvida para ajuste',
        subtitle: 'Peça a correção ao agente no chat: a versão nova reabre a revisão dos itens que mudarem.' })
    } catch (e) {
      await tratarErro(e, 'Não foi possível devolver')
    } finally {
      setEnviando(false)
    }
  }

  // Relatório novo pelo diálogo: entra na tela assim que o resumo dele chega (o monitor monta em segundos).
  // Relatório novo pelo diálogo: o diálogo fecha assim que a versão 1 fica pronta (ficar aberto fazia ele voltar ao
  // formulário quando a tela trocava para o relatório, com o "Gerar" de novo à mão) e a versão 2 é acompanhada aqui.
  async function abrirQuandoResumir(novoId, operacao) {
    setGerarAberto(false)
    setAbrindoNovo({ id: novoId, descricao: 'Relatório gerado. Abrindo o relatório novo…' })
    if (operacao) setAcompanhada({ operacao, relatorioId: novoId })
    aguardado.current = novoId
    for (let tentativa = 0; tentativa < 30 && aguardado.current === novoId; tentativa++) {
      const indice = await listarResumos().catch(() => null)
      if (indice?.relatorios?.some(r => r.relatorio_id === novoId)) {
        aguardado.current = null
        setErroCarga('')
        setRelatorios(indice.relatorios)
        ir(novoId, { replace: true })
        return
      }
      await new Promise(r => setTimeout(r, 2000))
    }
    // Resumo demorando: a tela continua carregando e o aviso de relatório novo (sinalIndice) abre o relatório quando
    // ele chegar.
    if (aguardado.current === novoId) {
      setAbrindoNovo(atual => (atual?.id === novoId
        ? { id: novoId, descricao: 'Relatório gerado. O resumo ainda está sendo montado: ele abre aqui assim que ficar pronto.' }
        : atual))
    }
  }

  // Carregando até o resumo do novo estar na tela (escolher outro relatório limpa abrindoNovo).
  const esperandoNovo = Boolean(abrindoNovo) && resumo?.relatorio_id !== abrindoNovo.id && !naoEncontrado

  function escolherRelatorio(id) {
    aguardado.current = null // escolher outro cancela a espera pelo recém-gerado
    setAbrindoNovo(null)
    ir(id)
  }

  const dialogoGerar = (
    <GerarRelatorio aberto={gerarAberto} empresaInicial={resumo?.empresa || ''}
      onFechar={() => setGerarAberto(false)} onPronto={abrirQuandoResumir} />
  )

  // Conceitos (qual linha das planilhas é cada indicador) dentro da Análise, com o número pendente (29/10/2026).
  const botaoConceitos = (
    <Button kind="ghost" size="sm" renderIcon={Catalog} onClick={onAbrirConceitos} className="com-contador">
      Conceitos
      {conceitosPendentes > 0 && (
        <span className="contador-notificacao" title={`${conceitosPendentes} conceito(s) para revisar`}>
          {conceitosPendentes}
        </span>
      )}
    </Button>
  )

  const seletor = (
    <Dropdown id="ana-relatorio" titleText="Relatório" hideLabel size="sm" label="Escolha um relatório"
      className="ana-cabecalho__seletor" items={[GERAR_NOVO, ...relatorios]}
      selectedItem={relatorios.find(r => r.relatorio_id === relatorioId) || null}
      itemToString={textoDoItem} itemToElement={itemDoSeletor}
      onChange={({ selectedItem }) => {
        if (!selectedItem) return
        if (selectedItem === GERAR_NOVO) {
          setGerarAberto(true)
          return
        }
        setAviso(null)
        if (selectedItem.relatorio_id !== relatorioId) escolherRelatorio(selectedItem.relatorio_id)
      }} />
  )

  // Relatório recém-gerado a caminho: só o carregamento, sem o relatório anterior na tela.
  if (esperandoNovo) {
    return (
      <>
        <EsqueletoAnalise />
        <Carregando pagina descricao={abrindoNovo.descricao} />
        {dialogoGerar}
      </>
    )
  }

  // Endereço de um relatório que não existe (apagado, link antigo): o aviso e a lista, sem abrir outro no lugar.
  if (naoEncontrado && !carregando) {
    return (
      <main className="ana-pagina">
        <InlineNotification kind="warning" lowContrast hideCloseButton className="ana-aviso"
          title="Relatório não encontrado"
          subtitle="Este endereço aponta para um relatório que não existe mais. Escolha outro na lista." />
        <div className="ana-cabecalho__acoes">{seletor}</div>
        {dialogoGerar}
      </main>
    )
  }

  if (erroCarga && !resumo) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <InlineNotification kind="info" lowContrast hideCloseButton
          title="Análise de Crédito indisponível" subtitle={erroCarga} />
        <Button kind="primary" size="md" renderIcon={Add} onClick={() => setGerarAberto(true)}>Gerar relatório</Button>
        {dialogoGerar}
      </main>
    )
  }

  // Nenhum relatório escolhido: a lista dos mais recentes para abrir um, ou gerar outro.
  if (!relatorioId && !carregando) {
    return (
      <main className="ana-pagina">
        <header className="ana-cabecalho">
          <div className="ana-cabecalho__identidade">
            <h1 className="ana-cabecalho__emissor">Análise de crédito</h1>
            <span className="ana-cabecalho__referencia">escolha um relatório para revisar</span>
          </div>
          <div className="ana-cabecalho__acoes">
            {botaoConceitos}
            {seletor}
            <Button kind="primary" size="sm" renderIcon={Add} onClick={() => setGerarAberto(true)}>Gerar relatório</Button>
          </div>
        </header>
        <section className="des-secao" aria-label="Relatórios recentes">
          <h2 className="ana-secao__titulo">Relatórios recentes</h2>
          <ul className="ana-escolha">
            {relatorios.slice(0, 12).map(r => (
              <li key={r.relatorio_id}>
                <button type="button" className="ana-escolha__item" onClick={() => escolherRelatorio(r.relatorio_id)}>
                  <span className="ana-escolha__empresa">{r.empresa}</span>
                  <span className="ana-escolha__detalhe">
                    {r.referencia || r.periodo} · versão {r.versao}
                    {r.atualizado_em ? ` · ${dataHora(r.atualizado_em)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {dialogoGerar}
      </main>
    )
  }

  if (carregando && !resumo) return <EsqueletoAnalise />

  const pendentes = revisao?.contagem?.pendente || 0
  const status = STATUS_VERSAO[revisao?.status] || STATUS_VERSAO.em_revisao
  const bloqueios = revisao?.bloqueios_para_publicar || []
  const categorias = resumo?.categorias_revisao || []
  const rotulos = Object.fromEntries(categorias.map(c => [c.id, c.rotulo]))

  return (
    // As fontes dos números-chave e das seções abrem o documento original (FontesDoDocumento.jsx).
    <ProvedorDeFontes empresa={resumo?.empresa}>
    <main className="ana-pagina">
      {carregando && <Carregando pagina descricao="Abrindo o relatório" />}
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">{resumo?.empresa}</h1>
          <span className="ana-cabecalho__referencia">{resumo?.referencia}</span>
          <Tag type={status.tag} size="sm">versão {resumo?.versao} {status.rotulo}</Tag>
          {revisao?.decisao?.usuario && (
            <span className="ana-cabecalho__aprovador">
              {revisao.status === 'publicada' ? 'publicada' : 'devolvida'} por {revisao.decisao.usuario}
              {' '}em {dataHora(revisao.decisao.em)}
            </span>
          )}
        </div>
        <div className="ana-cabecalho__acoes">
          {botaoConceitos}
          {seletor}
          <Button kind="tertiary" size="sm" renderIcon={Document} onClick={() => abrirRelatorio(null)}>
            Relatório completo
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={DocumentPdf} disabled={pdf.gerando !== null}
            onClick={() => { setAviso(null); pdf.limparErro(); pdf.baixar(relatorioId, resumo?.versao) }}>
            <RotuloFixo atual=<RotuloFixo atual={pdf.gerando === null ? 'Baixar PDF' : rotuloGerandoPdf(pdf.gerando)} opcoes={['Baixar PDF', 'Gerando PDF… 888 s']} /> opcoes={['Baixar PDF', 'Gerando PDF… 888 s']} />
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Renew} disabled={reprocessando || Boolean(gerando)}
            onClick={reprocessarRelatorio}>
            <RotuloFixo atual=<RotuloFixo atual={reprocessando ? 'Gerando o relatório…' : 'Reprocessar'} opcoes={['Reprocessar', 'Gerando o relatório…']} /> opcoes={['Reprocessar', 'Gerando o relatório…']} />
          </Button>
          {gerando && !gerando.atrasado && <Tag type="blue" size="md">Gerando a versão {resumo.versao + 1}…</Tag>}
          {gerando?.atrasado && (
            <Button kind="secondary" size="sm" onClick={gerarVersao} disabled={enviando}>
              Versão nova sem resposta: pedir de novo
            </Button>
          )}
          {!gerando && revisao?.ajustes?.aguardando > 0 && (
            <Button kind="secondary" size="sm" onClick={gerarVersao} disabled={enviando}>
              Gerar versão {resumo.versao + 1} ({revisao.ajustes.aguardando} ajuste(s))
            </Button>
          )}
          {pendentes > 0 && (
            <Button kind="primary" size="sm" renderIcon={TaskApproved} onClick={() => abrirRevisao(null)}>
              Revisar ({pendentes} pendentes)
            </Button>
          )}
          {pendentes === 0 && revisao?.status !== 'publicada' && (
            <>
              <Button kind="ghost" size="sm" onClick={() => abrirRevisao({ todos: true })}>Ver revisão</Button>
              {revisao?.status !== 'devolvida' && (
                <Button kind="ghost" size="sm" onClick={devolverVersao} disabled={enviando}>Devolver para ajuste</Button>
              )}
              <Button kind="primary" size="sm" onClick={publicarVersao} disabled={enviando || bloqueios.length > 0}>
                <RotuloFixo atual=<RotuloFixo atual={enviando ? 'Enviando…' : 'Aprovar e publicar'} opcoes={['Aprovar e publicar', 'Enviando…']} /> opcoes={['Aprovar e publicar', 'Enviando…']} />
              </Button>
            </>
          )}
          {/* Versão publicada (29/10/2026): o lugar do "Revisar" ficava vazio e a linha de botões, desalinhada. A
              revisão abre só para leitura: mudar exige uma versão nova. */}
          {pendentes === 0 && revisao?.status === 'publicada' && (
            <Button kind="primary" size="sm" renderIcon={TaskApproved} onClick={() => abrirRevisao({ todos: true })}>
              Ver revisão
            </Button>
          )}
        </div>
      </header>

      {pdf.ligando && (
        <InlineNotification kind="info" lowContrast hideCloseButton className="ana-aviso"
          title="Gerando o PDF" subtitle={AVISO_LIGANDO_PDF} />
      )}

      {dialogoGerar}
      {geracao && reprocessando && (
        <ProgressoRelatorio andamento={andamentoGeracao} solicitado mostrarLink={false} />
      )}
      {aviso && (
        <InlineNotification kind={aviso.kind} lowContrast className="ana-aviso"
          title={aviso.title} subtitle={aviso.subtitle} onClose={() => setAviso(null)} />
      )}
      {estadoV2 === 'em_preparo' && (
        <InlineNotification kind="info" lowContrast hideCloseButton className="ana-aviso"
          title="Interpretação automática em preparo (versão 2)"
          subtitle={'Esta é a versão 1. Em alguns segundos o agente redige a interpretação a partir dos documentos e, '
            + 'se ela passar na conferência dos números, a versão 2 entra aqui sozinha.'} />
      )}
      {estadoV2 === 'bloqueada' && (
        <InlineNotification kind="info" lowContrast hideCloseButton className="ana-aviso"
          title="Interpretação automática aguardando a atualização do sistema"
          subtitle="Esta é a versão 1. A versão 2 entra aqui sozinha assim que a atualização terminar." />
      )}
      {estadoV2 === 'sem_texto' && (
        <InlineNotification kind="info" lowContrast className="ana-aviso" onClose={() => setAcompanhada(null)}
          title="Interpretação automática não entrou"
          subtitle="O texto redigido pelo agente não passou na conferência dos números: o relatório fica na versão 1." />
      )}

      {revisao?.status === 'publicada' && (
        <div className="ana-selo">
          <Tag type="green" size="sm">
            {revisao.decisao?.baseline?.enviado ? 'Baseline enviado ao Monitoramento' : 'Versão publicada'}
          </Tag>
          <button type="button" className="ana-link" onClick={() => onTrocarAba?.('monitoramento')}>
            <ChartLineData size={14} /> Abrir a aba Monitoramento
          </button>
        </div>
      )}

      {pendentes === 0 && bloqueios.length > 0 && (
        <InlineNotification kind="warning" lowContrast hideCloseButton className="ana-aviso"
          title="Publicação bloqueada" subtitle={bloqueios.join('; ')} />
      )}

      <NumerosChave numeros={resumo?.numeros_chave} onAbrir={abrirRelatorio} />

      <SumarioTese resumo={resumo} onAbrirRelatorio={abrirRelatorio}
        onAbrirItem={itemId => abrirRevisao(itemId ? { itemId } : null)} />

      <SecoesRelatorio itens={resumo?.itens} revisao={revisao} rotulos={rotulos}
        onRevisar={(secao, todos) => abrirRevisao({ secao, todos })} onVerNoRelatorio={abrirRelatorio} />

      {/* Os documentos que este relatório usou, como bibliografia. O envio de documentos fica em Coleta › Coleta manual e
          o acervo inteiro de cada empresa, na aba Documentos. */}
      <ReferenciasRelatorio resumo={resumo} />

      <PainelRevisao
        aberto={painel.aberto}
        filtroInicial={painel.filtro}
        onFechar={() => setPainel({ aberto: false, filtro: null })}
        resumo={resumo}
        revisao={revisao}
        somenteLeitura={revisao?.status === 'publicada'}
        onInconsistencia={inconsistencia}
        categorias={categorias}
        onDecidir={decidir}
        onDecidirLote={decidirVarios}
        onVerNoRelatorio={abrirRelatorio}
        onGerarVersao={gerarVersao}
      />

      <RelatorioCompleto
        aberto={completo && Boolean(resumo)}
        ancora={ancoraCompleto}
        onFechar={fecharRelatorioCompleto}
        relatorioId={relatorioId}
        versao={resumo?.versao}
        versaoResumo={resumo?.versao}
        itens={resumo?.itens}
        indice={resumo?.indice}
        onVersaoNova={versaoDaEdicao}
        onConversar={onConversar}
        titulo={`${resumo?.empresa || ''} · ${resumo?.referencia || ''}`}
      />
    </main>
    </ProvedorDeFontes>
  )
}

export default AnalisePage
