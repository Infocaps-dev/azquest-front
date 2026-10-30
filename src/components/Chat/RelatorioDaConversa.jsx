import { useEffect, useRef, useState } from 'react'
import { Button, InlineNotification, Tag } from '@carbon/react'
import { ArrowRight, DocumentPdf, Launch, Maximize, Unlink } from '@carbon/icons-react'
import { acordarPdf, enderecoHtml, enderecoRelatorio } from '../../services/resumosApi'
import { AVISO_LIGANDO_PDF, rotuloGerandoPdf, useBaixarPdf } from '../../hooks/useBaixarPdf'
import RelatorioCompleto from '../AnaliseCredito/RelatorioCompleto.jsx'
import RotuloFixo from '../Comum/RotuloFixo.jsx'

// Relatório desta conversa, no alto do painel da direita: a miniatura da versão atual, que troca sozinha quando o
// agente grava uma versão nova (a pessoa pede a alteração no chat e confere ali mesmo). "Ampliar" abre o relatório
// completo, com os botões "Editar" de cada trecho.
//
// A versão nova é percebida pelo estado do relatório (relatorios/<id>.json), consultado a cada 5 s enquanto o agente
// responde e uma vez no fim do turno: o agente grava a versão antes de terminar de responder.

const LARGURA_PAGINA = 794 // a página do relatório (CSS dele: --page-w)
const CONSULTA_MS = 5000
const DESTAQUE_MS = 8000

function RelatorioDaConversa({ vinculo, enviando, onAtualizar, onTrocar, onDesvincular, onAbrirAnalise }) {
  const [ampliado, setAmpliado] = useState(false)
  const [escala, setEscala] = useState(0.38)
  const [destaque, setDestaque] = useState(null)
  const caixa = useRef(null)
  const versaoVista = useRef(vinculo?.versao)
  const pdf = useBaixarPdf()

  useEffect(() => { acordarPdf() }, [])

  useEffect(() => {
    if (!enviando) return undefined
    const relogio = setInterval(onAtualizar, CONSULTA_MS)
    return () => clearInterval(relogio)
  }, [enviando, onAtualizar])

  // Versão nova: destaque por alguns segundos. A primeira versão vista (ao vincular) não conta como nova.
  useEffect(() => {
    const anterior = versaoVista.current
    versaoVista.current = vinculo?.versao
    if (!anterior || !vinculo?.versao || vinculo.versao <= anterior) return undefined
    setDestaque(vinculo.versao)
    const fim = setTimeout(() => setDestaque(null), DESTAQUE_MS)
    return () => clearTimeout(fim)
  }, [vinculo?.versao])

  useEffect(() => { versaoVista.current = vinculo?.versao }, [vinculo?.relatorio_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A miniatura é a página inteira reduzida à largura do painel.
  useEffect(() => {
    if (!caixa.current) return undefined
    const observador = new ResizeObserver(([e]) => setEscala(e.contentRect.width / LARGURA_PAGINA))
    observador.observe(caixa.current)
    return () => observador.disconnect()
  }, [vinculo?.relatorio_id])

  if (!vinculo) return null
  const { relatorio_id: id, versao, empresa, referencia } = vinculo
  const titulo = [empresa, referencia].filter(Boolean).join(' · ') || id

  return (
    <section className="chat-relatorio" aria-label="Relatório desta conversa">
      <div className="chat-relatorio__topo">
        <p className="chat-relatorio__rotulo">Relatório desta conversa</p>
        {versao && (
          <Tag size="sm" type={destaque ? 'green' : 'cool-gray'}>
            {destaque ? `Atualizado: versão ${versao}` : `Versão ${versao}`}
          </Tag>
        )}
      </div>
      <p className="chat-relatorio__titulo">{titulo}</p>

      <button type="button" ref={caixa} onClick={() => setAmpliado(true)} title="Ampliar o relatório"
        className={`chat-relatorio__mini${destaque ? ' chat-relatorio__mini--novo' : ''}`}>
        <iframe key={`${id}-${versao || 'atual'}`} title="Miniatura do relatório" src={enderecoHtml(id, versao)}
          sandbox="allow-same-origin" tabIndex={-1} loading="lazy"
          style={{ width: LARGURA_PAGINA, height: 400 / escala, transform: `scale(${escala})` }} />
      </button>

      <div className="chat-relatorio__acoes">
        <Button kind="tertiary" size="sm" renderIcon={Maximize} onClick={() => setAmpliado(true)}>
          Ampliar e editar
        </Button>
        <Button kind="ghost" size="sm" renderIcon={Launch} href={enderecoRelatorio(id, versao)} target="_blank"
          rel="noopener noreferrer">
          Nova aba
        </Button>
        <Button kind="ghost" size="sm" renderIcon={DocumentPdf} disabled={pdf.gerando !== null}
          onClick={() => pdf.baixar(id, versao)}>
          <RotuloFixo atual={pdf.gerando === null ? 'PDF' : rotuloGerandoPdf(pdf.gerando)} opcoes={['PDF', 'Gerando PDF… 888 s']} />
        </Button>
        <Button kind="ghost" size="sm" renderIcon={ArrowRight} onClick={() => onAbrirAnalise?.(id)}>
          Análise de Crédito
        </Button>
        <Button kind="ghost" size="sm" onClick={onTrocar}>Trocar relatório</Button>
        <Button kind="ghost" size="sm" renderIcon={Unlink} onClick={onDesvincular}>Desvincular</Button>
      </div>
      {pdf.ligando && (
        <InlineNotification kind="info" lowContrast hideCloseButton title="Gerando o PDF" subtitle={AVISO_LIGANDO_PDF} />
      )}
      {pdf.erro && (
        <InlineNotification kind="error" lowContrast title="O PDF não foi gerado" subtitle={pdf.erro}
          onClose={pdf.limparErro} />
      )}
      <p className="chat-relatorio__dica">
        Peça alterações aqui no chat (&ldquo;troque o ponto de atenção…&rdquo;, &ldquo;insira o gráfico…&rdquo;): cada
        uma vira uma versão nova deste relatório.
      </p>

      <RelatorioCompleto aberto={ampliado} onFechar={() => setAmpliado(false)} relatorioId={id} versao={versao}
        titulo={titulo} onVersaoNova={onAtualizar} />
    </section>
  )
}

export default RelatorioDaConversa
