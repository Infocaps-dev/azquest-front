import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, InlineNotification, Loading, Select, SelectItem, Tag } from '@carbon/react'
import { ChartLineData, Document, DocumentPdf, Renew, TaskApproved } from '@carbon/icons-react'
import {
  aplicarAjustes,
  decidirItem,
  decidirLote,
  acordarPdf,
  devolver,
  listarResumos,
  obterResumo,
  obterRevisao,
  publicar,
} from '../../services/resumosApi'
import { conversar } from '../../services/chatApi'
import { AVISO_LIGANDO_PDF, rotuloGerandoPdf, useBaixarPdf } from '../../hooks/useBaixarPdf'
import ReferenciasRelatorio from './ReferenciasRelatorio.jsx'
import NumerosChave from './NumerosChave.jsx'
import PainelRevisao from './PainelRevisao.jsx'
import RelatorioCompleto from './RelatorioCompleto.jsx'
import SecoesRelatorio from './SecoesRelatorio.jsx'
import SumarioTese from './SumarioTese.jsx'
import { STATUS_VERSAO, dataHora } from './vocabulario'
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

function AnalisePage({ onTrocarAba, relatorioAlvo, sinalIndice, onAlvoConsumido, onVersaoPropria, onConversar }) {
  const [relatorios, setRelatorios] = useState([])
  const [relatorioId, setRelatorioId] = useState('')
  const [resumo, setResumo] = useState(null)
  const [revisao, setRevisao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [aviso, setAviso] = useState(null)
  const [painel, setPainel] = useState({ aberto: false, filtro: null })
  const [relatorio, setRelatorio] = useState({ aberto: false, ancora: null })
  const [reprocessando, setReprocessando] = useState(false)
  const [enviando, setEnviando] = useState(false) // publicar, devolver, gerar versão: um clique só
  // O relatório que está na tela agora: respostas que chegam depois de o analista trocar de relatório são descartadas,
  // em vez de mostrar o relatório A com as decisões indo para o B.
  const atual = useRef('')
  // Versões criadas pela edição no próprio relatório: a tela já está nelas, então não ganham o aviso de "chegou a
  // versão N" (nem o do App, que é suprimido por onVersaoPropria).
  const versoesProprias = useRef(new Set())
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
        if (indice.relatorios?.length) {
          // Só na abertura da aba: chegando pelo "Abrir" do aviso, abre aquele relatório; senão, o mais recente.
          const pedido = relatorioAlvo?.id && indice.relatorios.some(r => r.relatorio_id === relatorioAlvo.id)
          setRelatorioId(pedido ? relatorioAlvo.id : indice.relatorios[0].relatorio_id)
          if (pedido) onAlvoConsumido?.()
        } else {
          setErroCarga('Nenhum relatório gerado ainda. Peça um relatório ao agente no chat.')
          setCarregando(false)
        }
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
    setCarregando(true)
    carregar(relatorioId)
      .catch(e => { if (atual.current === relatorioId) setErroCarga(e.message) })
      .finally(() => { if (atual.current === relatorioId) setCarregando(false) })
  }, [relatorioId, carregar])

  // Relatório novo disponível (aviso do App): a lista do seletor se atualiza. Se o relatório aberto ganhou versão nova
  // (edição pelo chat, por exemplo), a tela recarrega, para ninguém decidir sobre um texto que já mudou.
  useEffect(() => {
    if (!sinalIndice) return
    listarResumos().then(indice => {
      setRelatorios(indice.relatorios || [])
      const linha = (indice.relatorios || []).find(r => r.relatorio_id === atual.current)
      if (linha && resumo && linha.versao > resumo.versao) {
        const propria = versoesProprias.current.has(`${linha.relatorio_id}-v${linha.versao}`)
        carregar(atual.current).then(novo => novo && !propria && setAviso({ kind: 'info',
          title: `Chegou a versão ${novo.versao} deste relatório`,
          subtitle: 'A tela foi atualizada. Itens cujo texto mudou voltaram a pendente.' }))
      }
    }).catch(() => {})
  }, [sinalIndice]) // eslint-disable-line react-hooks/exhaustive-deps -- reage ao sinal, não ao resumo

  useEffect(() => {
    if (!relatorioAlvo?.id) return
    setAviso(null)
    setRelatorioId(relatorioAlvo.id)
    onAlvoConsumido?.()
  }, [relatorioAlvo]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const abrirRelatorio = useCallback(ancora => setRelatorio({ aberto: true, ancora: ancora || null }), [])

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

  // Reprocessar: pede ao Agente Analista de Crédito um relatório novo do mesmo
  // emissor e período, pela conversa da analise-api (é lá que a chave do
  // Orchestrate fica), e muda a tela para ele quando o resumo chegar. O agente
  // gera do zero, a partir dos documentos atuais: a revisão e os ajustes desta
  // versão continuam no relatório atual. O aviso diz o que de fato aconteceu:
  // dizer "reprocessado" sem relatório novo faria o analista crer que o
  // documento mudou.
  async function reprocessarRelatorio() {
    const pedido = `Gere o relatório de crédito da ${resumo.empresa} do ${resumo.periodo}.`
    if (!window.confirm(`Pedir ao Agente Analista de Crédito um relatório novo (${resumo.empresa}, ${resumo.periodo})?`
      + '\n\nEle é gerado do zero, com os documentos atuais. A revisão e os ajustes desta versão continuam no relatório atual.')) return
    const origem = relatorioId
    setAviso(null)
    setReprocessando(true)
    let fim = null
    let erro = null
    try {
      for await (const evento of conversar(pedido)) {
        if (evento.tipo === 'fim') fim = evento
        if (evento.tipo === 'erro') erro = evento.detalhe
      }
    } catch (e) {
      erro = e.message
    }
    const novoId = /relatorios\/([a-z0-9-]+)\.html/.exec(fim?.texto || '')?.[1]
    if (!novoId) {
      setReprocessando(false)
      setAviso({ kind: 'warning', title: 'O relatório não foi regerado',
        subtitle: erro || 'O agente respondeu sem o link de um relatório novo. Tente de novo ou peça pelo chat.' })
      return
    }
    // O resumo chega em segundos pelo monitor; espera até 90 s antes de desistir. Só troca a tela se o analista
    // continua no relatório de onde pediu; se mudou de relatório, o aviso do App leva ao novo.
    for (let tentativa = 0; tentativa < 30; tentativa++) {
      const indice = await listarResumos().catch(() => null)
      if (indice?.relatorios?.some(r => r.relatorio_id === novoId)) {
        setRelatorios(indice.relatorios)
        setReprocessando(false)
        if (atual.current === origem) {
          setRelatorioId(novoId)
          setAviso({ kind: 'success', title: 'Relatório regerado pelo Agente Analista de Crédito',
            subtitle: `Relatório novo ${novoId}, versão 1.` })
        }
        return
      }
      await new Promise(r => setTimeout(r, 3000))
    }
    setReprocessando(false)
    setAviso({ kind: 'warning', title: 'O agente gerou o relatório, mas o resumo ainda não chegou',
      subtitle: `Relatório ${novoId}. Ele aparece no seletor assim que o resumo for montado.` })
  }

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

  if (erroCarga && !resumo) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <InlineNotification kind="info" lowContrast hideCloseButton
          title="Análise de Crédito indisponível" subtitle={erroCarga} />
      </main>
    )
  }

  if (carregando && !resumo) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <Loading withOverlay={false} description="Carregando a análise de crédito" />
      </main>
    )
  }

  const pendentes = revisao?.contagem?.pendente || 0
  const status = STATUS_VERSAO[revisao?.status] || STATUS_VERSAO.em_revisao
  const bloqueios = revisao?.bloqueios_para_publicar || []
  const categorias = resumo?.categorias_revisao || []
  const rotulos = Object.fromEntries(categorias.map(c => [c.id, c.rotulo]))

  return (
    <main className="ana-pagina">
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
          <Select id="ana-relatorio" labelText="Relatório" hideLabel size="sm" value={relatorioId}
            onChange={e => { setAviso(null); setRelatorioId(e.target.value) }} className="ana-cabecalho__seletor">
            {relatorios.map(r => (
              <SelectItem key={r.relatorio_id} value={r.relatorio_id} text={rotuloRelatorio(r)} />
            ))}
          </Select>
          <Button kind="tertiary" size="sm" renderIcon={Document} onClick={() => abrirRelatorio(null)}>
            Relatório completo
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={DocumentPdf} disabled={pdf.gerando !== null}
            onClick={() => { setAviso(null); pdf.limparErro(); pdf.baixar(relatorioId, resumo?.versao) }}>
            {pdf.gerando === null ? 'Baixar PDF' : rotuloGerandoPdf(pdf.gerando)}
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Renew} disabled={reprocessando || Boolean(gerando)}
            onClick={reprocessarRelatorio}>
            {reprocessando ? 'Agente gerando o relatório…' : 'Reprocessar'}
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
              <Button kind="ghost" size="sm" onClick={() => abrirRevisao(null)}>Ver revisão</Button>
              {revisao?.status !== 'devolvida' && (
                <Button kind="ghost" size="sm" onClick={devolverVersao} disabled={enviando}>Devolver para ajuste</Button>
              )}
              <Button kind="primary" size="sm" onClick={publicarVersao} disabled={enviando || bloqueios.length > 0}>
                {enviando ? 'Enviando…' : 'Aprovar e publicar'}
              </Button>
            </>
          )}
        </div>
      </header>

      {pdf.ligando && (
        <InlineNotification kind="info" lowContrast hideCloseButton className="ana-aviso"
          title="Gerando o PDF" subtitle={AVISO_LIGANDO_PDF} />
      )}

      {aviso && (
        <InlineNotification kind={aviso.kind} lowContrast className="ana-aviso"
          title={aviso.title} subtitle={aviso.subtitle} onClose={() => setAviso(null)} />
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
        onRevisar={secao => abrirRevisao({ secao })} onVerNoRelatorio={abrirRelatorio} />

      {/* Os documentos que este relatório usou, como bibliografia. O envio de documentos fica em Coleta › Coleta manual e
          o acervo inteiro de cada empresa, na aba Documentos. */}
      <ReferenciasRelatorio resumo={resumo} />

      <PainelRevisao
        aberto={painel.aberto}
        filtroInicial={painel.filtro}
        onFechar={() => setPainel({ aberto: false, filtro: null })}
        resumo={resumo}
        revisao={revisao}
        categorias={categorias}
        onDecidir={decidir}
        onDecidirLote={decidirVarios}
        onVerNoRelatorio={abrirRelatorio}
        onGerarVersao={gerarVersao}
      />

      <RelatorioCompleto
        aberto={relatorio.aberto}
        ancora={relatorio.ancora}
        onFechar={() => setRelatorio({ aberto: false, ancora: null })}
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
  )
}

export default AnalisePage
