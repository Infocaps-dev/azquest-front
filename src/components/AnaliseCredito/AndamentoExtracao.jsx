import { useEffect, useState } from 'react'
import { CheckmarkFilled, CircleDash, ErrorFilled, InProgress, WarningAltFilled } from '@carbon/icons-react'
import { InlineNotification } from '@carbon/react'
import { andamentoExtracao } from '../../services/coletaApi'
import './AndamentoExtracao.scss'

// Andamento real da extração de cada documento enviado (30/10/2026): o extrator grava cada etapa que de fato
// aconteceu (job.py, Andamento) e a coleta-api devolve por chave (/api/extracoes/andamento). Nada é estimado: sem
// a etapa gravada, o documento está na fila; a hora de cada etapa é a do servidor. Consulta a cada 3 s e para
// quando todos terminam (concluído ou falhou).

const ETAPAS = [
  ['na_fila', 'Na fila do extrator'],
  ['iniciado', 'Extrator iniciou'],
  ['baixado', 'Arquivo lido'],
  ['extraindo', 'Extraindo o conteúdo'],
  ['gravando_imagens', 'Gravando imagens'],
  ['concluido', 'Concluído'],
]
const INTERVALO_MS = 3000
const LIMITE_MS = 45 * 60 * 1000 // depois disso a tela para de perguntar; o documento continua no extrator

const hora = iso => (iso ? new Date(iso).toLocaleTimeString('pt-BR') : '')
const segundos = (de, ate) => Math.max(0, Math.round((new Date(ate) - new Date(de)) / 1000))
function duracao(s) {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
}
const mb = bytes => `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

function detalhe(etapa, doc, agora) {
  if (etapa === 'baixado') {
    return [doc.paginas && `${doc.paginas.toLocaleString('pt-BR')} páginas`, doc.bytes && mb(doc.bytes)]
      .filter(Boolean).join(' · ')
  }
  if (etapa === 'extraindo' && doc.etapa === 'extraindo' && doc.marcos?.extraindo) {
    return `há ${duracao(segundos(doc.marcos.extraindo, agora))}`
  }
  if (etapa === 'gravando_imagens' && doc.imagens != null) return `${doc.imagens} imagens`
  if (etapa === 'concluido' && doc.estado === 'concluido') {
    return [doc.itens != null && `${doc.itens.toLocaleString('pt-BR')} trechos e tabelas`,
      doc.imagens != null && `${doc.imagens} imagens`].filter(Boolean).join(' · ')
  }
  return ''
}

function Documento({ arquivo, doc, desde, agora }) {
  const naFila = !doc || doc.estado === 'na_fila'
  const falhou = doc?.estado === 'falhou'
  const atual = naFila ? 'na_fila' : doc.etapa
  const marcos = { na_fila: desde, ...(doc?.marcos || {}) }
  // A imagem só existe em documento com figura: sem a etapa gravada, ela não é mostrada como pendente no fim.
  const etapas = ETAPAS.filter(([e]) => e !== 'gravando_imagens' || marcos.gravando_imagens || atual === e)
  const indiceAtual = etapas.findIndex(([e]) => e === atual)

  return (
    <li className="andamento__doc">
      <p className="andamento__arquivo">{arquivo}</p>
      <ol className="andamento__etapas">
        {etapas.map(([etapa, rotulo], i) => {
          const feita = Boolean(marcos[etapa]) && (i < indiceAtual || etapa === 'concluido' || (falhou && i <= indiceAtual))
          const corrente = i === indiceAtual && !falhou && doc?.estado !== 'concluido'
          const Icone = falhou && i === indiceAtual ? ErrorFilled : feita ? CheckmarkFilled : corrente ? InProgress : CircleDash
          const classe = falhou && i === indiceAtual ? 'erro' : feita ? 'feita' : corrente ? 'corrente' : 'pendente'
          const extra = detalhe(etapa, doc || {}, agora)
          return (
            <li key={etapa} className={`andamento__etapa andamento__etapa--${classe}`}>
              <Icone size={16} aria-hidden="true" />
              <span className="andamento__rotulo">{rotulo}</span>
              {marcos[etapa] && (feita || corrente) && <span className="andamento__hora">{hora(marcos[etapa])}</span>}
              {extra && <span className="andamento__detalhe">{extra}</span>}
            </li>
          )
        })}
      </ol>
      {falhou && <p className="andamento__aviso andamento__aviso--erro">Falhou: {doc.erro || 'motivo não informado'}</p>}
      {naFila && doc?.nao_iniciou && (
        <p className="andamento__aviso"><WarningAltFilled size={16} aria-hidden="true" /> O extrator não começou
          depois de 10 minutos. Verificar a extração deste documento.</p>
      )}
      {doc?.sem_atualizacao && (
        <p className="andamento__aviso"><WarningAltFilled size={16} aria-hidden="true" /> Sem atualização do extrator
          desde {hora(doc.atualizado_em)}.</p>
      )}
      {doc?.estado === 'concluido' && (doc.alertas || []).includes('entidade_divergente') && (
        <p className="andamento__aviso"><WarningAltFilled size={16} aria-hidden="true" /> O extrator leu no documento
          outra empresa ({doc.entidade_lida}): confira se é do emissor.</p>
      )}
    </li>
  )
}

export default function AndamentoExtracao({ emissor, desde, documentos }) {
  const [resposta, setResposta] = useState(null)
  const [erro, setErro] = useState('')
  const chaves = documentos.map(d => d.chave)

  useEffect(() => {
    let vivo = true
    let espera = null
    const inicio = Date.now()
    async function perguntar() {
      try {
        const r = await andamentoExtracao(emissor, chaves, desde)
        if (!vivo) return
        setResposta(r)
        setErro('')
        const terminou = r.documentos.every(d => d.estado === 'concluido' || d.estado === 'falhou')
        if (terminou || Date.now() - inicio > LIMITE_MS) return
      } catch (falha) {
        if (!vivo) return
        setErro(falha.message)
      }
      espera = setTimeout(perguntar, INTERVALO_MS)
    }
    perguntar()
    return () => { vivo = false; clearTimeout(espera) }
    // As chaves mudam só num envio novo, que monta o componente de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emissor, desde, chaves.join('|')])

  const porChave = Object.fromEntries((resposta?.documentos || []).map(d => [d.chave, d]))
  const agora = resposta?.agora || desde
  const prontos = (resposta?.documentos || []).filter(d => d.estado === 'concluido').length

  return (
    <section className="andamento" aria-live="polite">
      <h4 className="andamento__titulo">
        Extração: {prontos} de {documentos.length} concluída(s)
      </h4>
      {erro && (
        <InlineNotification kind="warning" lowContrast hideCloseButton title="Sem resposta do acompanhamento"
          subtitle={`${erro}. Tentando de novo.`} />
      )}
      <ul className="andamento__lista">
        {documentos.map(d => (
          <Documento key={d.chave} arquivo={d.arquivo} doc={porChave[d.chave]} desde={desde} agora={agora} />
        ))}
      </ul>
    </section>
  )
}
