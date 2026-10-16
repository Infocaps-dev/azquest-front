import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  InlineNotification,
  Loading,
  OverflowMenu,
  OverflowMenuItem,
  Tag,
} from '@carbon/react'
import { ChartLineData, Document, Renew } from '@carbon/icons-react'
import {
  MODO_SIMULADO,
  decidirVersao,
  exportar,
  listarAnalises,
  listarFontes,
  listarItens,
  obterIndice,
  obterResumo,
  publicar,
  reprocessar,
  revisarItem,
} from '../../services/analiseApi'
import CoberturaPiloto from './CoberturaPiloto.jsx'
import DestaquesTema from './DestaquesTema.jsx'
import FaixaProcesso from './FaixaProcesso.jsx'
import GavetaItem from './GavetaItem.jsx'
import NumerosChave from './NumerosChave.jsx'
import RelatorioCompleto from './RelatorioCompleto.jsx'
import SumarioTese from './SumarioTese.jsx'
import './AnalisePage.scss'

// Aba Análise de Crédito, etapa 1.2 (Construção da Tese).
//
// O layout segue a seção 3 do handoff, e a ordem importa: quem abre a aba vê
// primeiro o que importa da tese -- sumário, números-chave, destaques por tema
// -- e o relatório completo fica um clique abaixo, nunca na frente do resumo.

const EMISSOR = 'Ecorodovias'

function AnalisePage({ onTrocarAba }) {
  const [analiseId, setAnaliseId] = useState(null)
  const [resumo, setResumo] = useState(null)
  const [itens, setItens] = useState([])
  const [indice, setIndice] = useState([])
  const [fontes, setFontes] = useState([])
  const [itemAberto, setItemAberto] = useState(null)
  const [emFila, setEmFila] = useState(false)
  const [relatorioAberto, setRelatorioAberto] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [aviso, setAviso] = useState(null)
  const [reprocessando, setReprocessando] = useState(false)

  const carregar = useCallback(async id => {
    const [novoResumo, novosItens, novoIndice, novasFontes] = await Promise.all([
      obterResumo(id),
      listarItens(id),
      obterIndice(id).catch(() => []),
      listarFontes(id).catch(() => []),
    ])
    setResumo(novoResumo)
    setItens(novosItens)
    setIndice(novoIndice)
    setFontes(novasFontes)
  }, [])

  useEffect(() => {
    let ativo = true
    async function abrir() {
      try {
        const analises = await listarAnalises(EMISSOR)
        if (!ativo) return
        if (!analises.length) {
          setErroCarga('Nenhuma análise foi construída ainda para este emissor.')
          return
        }
        setAnaliseId(analises[0].id)
        await carregar(analises[0].id)
      } catch (e) {
        if (ativo) setErroCarga(e.message)
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    abrir()
    return () => { ativo = false }
  }, [carregar])

  const pendentes = useMemo(
    () => itens.filter(i => (i.revisao?.status || 'pendente') === 'pendente'),
    [itens],
  )

  const porId = useMemo(
    () => Object.fromEntries(itens.map(i => [i.id, i])),
    [itens],
  )

  const abrirItem = useCallback(id => {
    const item = typeof id === 'string' ? porId[id] : id
    if (item) {
      setEmFila(false)
      setItemAberto(item)
    }
  }, [porId])

  function abrirFila() {
    if (!pendentes.length) return
    setEmFila(true)
    setItemAberto(pendentes[0])
  }

  async function revisar(itemId, decisao) {
    await revisarItem(analiseId, itemId, decisao)
    await carregar(analiseId)
  }

  function proximoDaFila() {
    const restantes = pendentes.filter(i => i.id !== itemAberto?.id)
    setItemAberto(restantes[0] || null)
    if (!restantes.length) setEmFila(false)
  }

  async function publicarVersao() {
    setAviso(null)
    try {
      const resultado = await publicar(analiseId)
      await carregar(analiseId)
      setAviso({
        kind: 'success',
        title: `Versão ${resultado.versao.versao} publicada`,
        subtitle: resultado.baseline.enviado
          ? 'O baseline chegou ao Monitoramento.'
          : `Baseline não entregue: ${resultado.baseline.motivo}`,
      })
    } catch (e) {
      setAviso({ kind: 'error', title: 'Não foi possível publicar', subtitle: e.message })
    }
  }

  async function reprocessarAnalise() {
    setAviso(null)
    setReprocessando(true)
    try {
      const { agente } = await reprocessar(analiseId)
      await carregar(analiseId)
      setAviso(
        agente.acionado && agente.concluido
          ? { kind: 'success',
              title: 'Relatório regerado pelo Agente Analista de Crédito',
              subtitle: `Execução ${agente.run_id}.` }
          // O agente é quem gera o relatório; o roteiro é quem monta a tela.
          // Dizer "reprocessado" quando só a segunda metade aconteceu faria o
          // analista crer que o relatório é novo.
          : { kind: 'warning',
              title: 'A tela foi remontada, mas o relatório não foi regerado',
              subtitle: agente.motivo },
      )
    } catch (e) {
      setAviso({ kind: 'error', title: 'Não foi possível reprocessar', subtitle: e.message })
    } finally {
      setReprocessando(false)
    }
  }

  function exportarComo(formato) {
    setAviso(null)
    try {
      exportar(analiseId, formato)
    } catch (e) {
      setAviso({ kind: 'info', title: 'Exportação indisponível', subtitle: e.message })
    }
  }

  async function devolver() {
    const justificativa = window.prompt('Por que a versão está sendo devolvida para ajuste?')
    if (!justificativa?.trim()) return
    setAviso(null)
    try {
      await decidirVersao(analiseId, { decisao: 'devolver', justificativa })
      await carregar(analiseId)
      setAviso({
        kind: 'info',
        title: 'Versão devolvida para ajuste',
        subtitle: 'O fluxo voltou para a etapa de tese e relatório.',
      })
    } catch (e) {
      setAviso({ kind: 'error', title: 'Não foi possível devolver', subtitle: e.message })
    }
  }

  if (carregando) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <Loading withOverlay={false} description="Carregando a análise de crédito" />
      </main>
    )
  }

  if (erroCarga) {
    return (
      <main className="ana-pagina ana-pagina--vazia">
        <InlineNotification kind="info" lowContrast hideCloseButton
          title="Análise de Crédito indisponível" subtitle={erroCarga} />
      </main>
    )
  }

  const analise = resumo?.analise
  const bloqueios = resumo?.bloqueios_para_publicar || []

  return (
    <main className="ana-pagina">
      <header className="ana-cabecalho">
        <div className="ana-cabecalho__identidade">
          <h1 className="ana-cabecalho__emissor">{analise?.emissor}</h1>
          <span className="ana-cabecalho__referencia">{analise?.referencia}</span>
          <Tag type={analise?.status === 'publicada' ? 'green' : 'blue'} size="sm">
            {analise?.versao} {analise?.status === 'publicada' ? 'publicada' : 'em revisão'}
          </Tag>
          {analise?.aprovador && (
            <span className="ana-cabecalho__aprovador">aprovada por {analise.aprovador}</span>
          )}
        </div>
        <div className="ana-cabecalho__acoes">
          <Button kind="tertiary" size="sm" renderIcon={Document}
            onClick={() => setRelatorioAberto(true)}>
            Relatório completo
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Renew}
            disabled={reprocessando} onClick={reprocessarAnalise}>
            {reprocessando ? 'Reprocessando…' : 'Reprocessar'}
          </Button>
          <OverflowMenu size="sm" flipped aria-label="Exportar" iconDescription="Exportar">
            <OverflowMenuItem itemText="Exportar .docx"
              onClick={() => exportarComo('docx')} />
            <OverflowMenuItem itemText="Exportar PDF (impressão)"
              onClick={() => exportarComo('pdf')} />
          </OverflowMenu>
          {pendentes.length > 0 && (
            <Button kind="primary" size="sm" renderIcon={Renew} onClick={abrirFila}>
              Revisar pendentes ({pendentes.length})
            </Button>
          )}
          {pendentes.length === 0 && analise?.status !== 'publicada' && (
            <>
              <Button kind="ghost" size="sm" onClick={devolver}>Devolver para ajuste</Button>
              <Button kind="primary" size="sm" onClick={publicarVersao}>
                Aprovar e publicar
              </Button>
            </>
          )}
        </div>
      </header>

      {aviso && (
        <InlineNotification kind={aviso.kind} lowContrast hideCloseButton
          title={aviso.title} subtitle={aviso.subtitle} className="ana-aviso" />
      )}

      {/* Selo da seção 3.8: a tese publicada vira o baseline que a 1.5 compara.
          Só aparece quando a publicação aconteceu, e leva até lá. */}
      {analise?.status === 'publicada' && (
        <div className="ana-selo">
          <Tag type="green" size="sm">Baseline disponível para o Monitoramento</Tag>
          <button type="button" className="ana-link" onClick={() => onTrocarAba?.('monitoramento')}>
            <ChartLineData size={14} /> Abrir a aba Monitoramento
          </button>
        </div>
      )}

      {bloqueios.length > 0 && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          className="ana-aviso"
          title="Publicação bloqueada"
          subtitle={bloqueios.join('; ')}
        />
      )}

      <FaixaProcesso etapas={resumo?.etapas} />

      <SumarioTese sumario={resumo?.sumario} onAbrirItem={abrirItem} />

      <NumerosChave numeros={resumo?.numeros_chave} onAbrir={abrirItem} />

      <DestaquesTema
        destaques={resumo?.destaques}
        onAbrirTema={abrirItem}
        onVerNoRelatorio={() => setRelatorioAberto(true)}
      />

      <CoberturaPiloto cobertura={resumo?.cobertura} />

      {fontes.length > 0 && (
        <section className="ana-fontes" aria-label="Kit de Fontes">
          <h2 className="ana-secao__titulo">Kit de Fontes</h2>
          <ul className="ana-fontes__lista">
            {fontes.map(fonte => (
              <li key={fonte.documento}>
                <span className="ana-fontes__documento">{fonte.documento}</span>
                <span className="ana-fontes__origem">{fonte.origem}</span>
                <span className="ana-fontes__referencias">
                  {fonte.referencias} {fonte.referencias === 1 ? 'referência' : 'referências'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GavetaItem
        item={itemAberto}
        aberta={Boolean(itemAberto)}
        onFechar={() => { setItemAberto(null); setEmFila(false) }}
        onRevisar={revisar}
        onProximo={emFila ? proximoDaFila : undefined}
        restantes={emFila ? Math.max(pendentes.length - 1, 0) : 0}
      />

      <RelatorioCompleto
        aberto={relatorioAberto}
        onFechar={() => setRelatorioAberto(false)}
        analise={analise}
        indice={indice}
        itens={itens}
        onAbrirItem={abrirItem}
      />

      {MODO_SIMULADO && (
        <p className="ana-rodape">
          Modo simulado: os dados são os do Piloto, servidos do arquivo, e as
          decisões de revisão não são gravadas em lugar nenhum. Desligue com
          VITE_ANALISE_MOCK=false.
        </p>
      )}
    </main>
  )
}

export default AnalisePage
