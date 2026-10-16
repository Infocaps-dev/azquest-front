import { useCallback, useEffect, useState } from 'react'
import { Button, InlineNotification, Loading, Select, SelectItem, Tag } from '@carbon/react'
import { ChartLineData, Document, Renew, TaskApproved } from '@carbon/icons-react'
import {
  aplicarAjustes,
  decidirItem,
  decidirLote,
  devolver,
  listarResumos,
  obterResumo,
  obterRevisao,
  publicar,
} from '../../services/resumosApi'
import { conversar } from '../../services/chatApi'
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

function AnalisePage({ onTrocarAba, relatorioAlvo, sinalIndice }) {
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
        }
        else {
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
  }, [])

  // Relatório novo disponível (aviso do App): a lista do seletor se atualiza
  // sem trocar o que está aberto; o "Abrir" do aviso troca para ele.
  useEffect(() => {
    if (!sinalIndice) return
    listarResumos().then(indice => setRelatorios(indice.relatorios || [])).catch(() => {})
  }, [sinalIndice])

  useEffect(() => {
    if (!relatorioAlvo?.id) return
    setAviso(null)
    setRelatorioId(relatorioAlvo.id)
  }, [relatorioAlvo])

  const carregar = useCallback(async id => {
    const [novoResumo, novaRevisao] = await Promise.all([obterResumo(id), obterRevisao(id)])
    setResumo(novoResumo)
    setRevisao(novaRevisao)
  }, [])

  useEffect(() => {
    if (!relatorioId) return
    let ativo = true
    setCarregando(true)
    carregar(relatorioId)
      .catch(e => { if (ativo) setErroCarga(e.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [relatorioId, carregar])

  // Versão nova com os ajustes em geração: acompanha até ela chegar (o job do
  // monitor publica e refaz o resumo em segundos) e então recarrega a tela.
  const gerando = revisao?.ajustes?.pedido
  useEffect(() => {
    if (!gerando || !relatorioId) return
    const relogio = setInterval(async () => {
      try {
        const nova = await obterRevisao(relatorioId)
        if (nova.ajustes?.pedido) return
        clearInterval(relogio)
        await carregar(relatorioId)
        listarResumos().then(i => setRelatorios(i.relatorios || [])).catch(() => {})
        const erros = Object.values(nova.itens).filter(i => i.aplicacao?.status === 'erro').length
        setAviso(erros
          ? { kind: 'warning', title: `Versão ${nova.versao} gerada, mas ${erros} ajuste(s) não entraram`,
            subtitle: 'Veja o motivo em cada item no painel de revisão.' }
          : { kind: 'success', title: `Versão ${nova.versao} gerada com os ajustes`,
            subtitle: 'O relatório completo já mostra os textos ajustados.' })
      } catch {
        // falha de rede passageira: tenta de novo no próximo ciclo
      }
    }, 4000)
    return () => clearInterval(relogio)
  }, [gerando, relatorioId, carregar])

  async function gerarVersao() {
    setAviso(null)
    try {
      setRevisao(await aplicarAjustes(relatorioId))
    } catch (e) {
      setAviso({ kind: 'error', title: 'Não foi possível gerar a versão nova', subtitle: e.message })
    }
  }

  const abrirRelatorio = useCallback(ancora => setRelatorio({ aberto: true, ancora: ancora || null }), [])
  const abrirRevisao = useCallback(filtro => setPainel({ aberto: true, filtro: filtro || null }), [])

  async function decidir(itemId, decisao) {
    setRevisao(await decidirItem(relatorioId, itemId, decisao))
  }

  async function decidirVarios(ids, decisao) {
    setRevisao(await decidirLote(relatorioId, ids, decisao))
  }

  async function publicarVersao() {
    setAviso(null)
    try {
      const resultado = await publicar(relatorioId)
      setRevisao(resultado)
      setAviso({
        kind: 'success',
        title: `Versão ${resumo.versao} publicada`,
        subtitle: resultado.baseline?.enviado
          ? 'O baseline chegou ao Monitoramento.'
          : `Baseline não enviado ao Monitoramento: ${resultado.baseline?.motivo}`,
      })
    } catch (e) {
      setAviso({ kind: 'error', title: 'Não foi possível publicar', subtitle: e.message })
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
    if (!window.confirm(`Pedir ao Agente Analista de Crédito um relatório novo (${resumo.empresa}, ${resumo.periodo})?

`
      + 'Ele é gerado do zero, com os documentos atuais. A revisão e os ajustes desta versão continuam no relatório atual.')) return
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
    // O resumo chega em segundos pelo monitor; espera até 90 s antes de desistir.
    for (let tentativa = 0; tentativa < 30; tentativa++) {
      const indice = await listarResumos().catch(() => null)
      if (indice?.relatorios?.some(r => r.relatorio_id === novoId)) {
        setRelatorios(indice.relatorios)
        setRelatorioId(novoId)
        setReprocessando(false)
        setAviso({ kind: 'success', title: 'Relatório regerado pelo Agente Analista de Crédito',
          subtitle: `Relatório novo ${novoId}, versão 1.` })
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
    try {
      setRevisao(await devolver(relatorioId, justificativa))
      setAviso({ kind: 'info', title: 'Versão devolvida para ajuste',
        subtitle: 'Peça a correção ao agente no chat: a versão nova reabre a revisão dos itens que mudarem.' })
    } catch (e) {
      setAviso({ kind: 'error', title: 'Não foi possível devolver', subtitle: e.message })
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
          <Button kind="tertiary" size="sm" renderIcon={Renew} disabled={reprocessando || Boolean(gerando)}
            onClick={reprocessarRelatorio}>
            {reprocessando ? 'Agente gerando o relatório…' : 'Reprocessar'}
          </Button>
          {gerando && <Tag type="blue" size="md">Gerando a versão {resumo.versao + 1}…</Tag>}
          {!gerando && revisao?.ajustes?.aguardando > 0 && (
            <Button kind="secondary" size="sm" onClick={gerarVersao}>
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
              <Button kind="ghost" size="sm" onClick={devolverVersao}>Devolver para ajuste</Button>
              <Button kind="primary" size="sm" onClick={publicarVersao} disabled={bloqueios.length > 0}>
                Aprovar e publicar
              </Button>
            </>
          )}
        </div>
      </header>

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

      {resumo?.documentos?.length > 0 && (
        <section className="ana-fontes" aria-label="Documentos citados">
          <h2 className="ana-secao__titulo">Documentos citados</h2>
          <ul className="ana-fontes__lista">
            {resumo.documentos.map(d => (
              <li key={d.codigo}>
                <span className="ana-fontes__documento">{d.arquivo}</span>
                <span className="ana-fontes__origem">{d.tipo}</span>
                <span className="ana-fontes__referencias">
                  data-base {d.data_base || '—'}
                  {d.entidade === 'divergente' && ' · documento de outra entidade'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        titulo={`${resumo?.empresa || ''} · ${resumo?.referencia || ''}`}
      />
    </main>
  )
}

export default AnalisePage
