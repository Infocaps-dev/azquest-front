import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  ComposedModal,
  ContentSwitcher,
  InlineNotification,
  ModalBody,
  ModalHeader,
  ProgressBar,
  Search,
  Select,
  SelectItem,
  Switch,
  Tag,
  TextArea,
} from '@carbon/react'
import { ArrowRight, Checkmark, ChevronDown, ChevronUp, Close, Edit } from '@carbon/icons-react'
import {
  caminhoDoItem,
  corDaCategoria,
  dataHora,
  evidenciaDe,
  revisaoDe,
  rotuloEvidencia,
} from './vocabulario'
import { FonteClicavel, ProvedorDeFontes } from './FontesDoDocumento.jsx'
import './PainelRevisao.scss'

// Painel de revisão: os ~50 itens do relatório numa tela só.
//
// A fila antiga abria um item por vez num modal; com 50 itens isso são 50
// aberturas, sem visão do todo. Aqui a lista fica à esquerda, agrupada por
// seção do relatório, e o detalhe do item à direita. Os filtros são os dois
// eixos em que a revisão se organiza:
//
// - categoria: o que precisa ser revisado (fonte faltando, número sem origem,
//   informação incompleta...). Vem do resumo, calculada por código;
// - seção do relatório.
//
// Depois de cada decisão o painel avança para o próximo pendente do filtro.
// Itens de baixo risco (categoria "Conferir fonte", uma seção inteira já lida)
// podem ser aprovados em lote, com confirmação em dois cliques. Ajuste e
// rejeição são sempre item a item: exigem texto e motivo.

const STATUS = ['pendente', 'revisado', 'todos']
const AJUSTAVEIS = ['texto', 'lista', 'campo'] // tabela, gráfico e imagem se corrigem pelo agente

const APLICACAO = {
  aguardando: 'O ajuste entra no relatório quando você gerar a versão nova.',
  enviado: 'Versão nova com este ajuste em geração.',
  aplicado: 'Ajuste aplicado no relatório',
  erro: 'O ajuste não entrou no relatório',
}

function Detalhe({ item, decisao, rotulos, onDecidir, onVerNoRelatorio, onAnterior, onProximo, gerando }) {
  const [modo, setModo] = useState(null) // null | 'ajustar' | 'rejeitar'
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // Trocar de item zera o formulário: sem isto, o motivo digitado num item
  // apareceria no seguinte e seria gravado como se fosse dele.
  useEffect(() => {
    setModo(null)
    setTexto(item?.texto || '')
    setMotivo('')
    setErro('')
  }, [item?.id, item?.texto])

  if (!item) {
    return <div className="rev-detalhe rev-detalhe--vazio">Nenhum item neste filtro.</div>
  }

  const evidencia = evidenciaDe(item.tipo_fonte)
  const status = revisaoDe(decisao?.status)
  const ajustavel = AJUSTAVEIS.includes(item.tipo) && item.bruto && !gerando
  const aplicacao = decisao?.status === 'ajustado' ? decisao.aplicacao : null

  async function decidir(tipo) {
    setErro('')
    setEnviando(true)
    try {
      await onDecidir(item.id, { decisao: tipo, motivo, textoAjustado: tipo === 'ajustado' ? texto : undefined })
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="rev-detalhe">
      <div className="rev-detalhe__topo">
        <span className="rev-detalhe__caminho">{caminhoDoItem(item)}</span>
        <span className="rev-detalhe__navegar">
          <Button kind="ghost" size="sm" hasIconOnly renderIcon={ChevronUp} iconDescription="Item anterior"
            tooltipPosition="bottom" onClick={onAnterior} disabled={!onAnterior} />
          <Button kind="ghost" size="sm" hasIconOnly renderIcon={ChevronDown} iconDescription="Próximo item"
            tooltipPosition="bottom" onClick={onProximo} disabled={!onProximo} />
        </span>
      </div>

      <div className="rev-detalhe__selos">
        <Tag type={status.tag} size="md">{status.rotulo}</Tag>
        <Tag type={evidencia.tag} size="md">{evidencia.rotulo}</Tag>
        {item.origem === 'analista' && <Tag type="green" size="md">Texto do relatório anterior</Tag>}
        {item.origem === 'casa' && <Tag type="blue" size="md">Informado pela casa</Tag>}
        <span className="rev-detalhe__tipo">{item.tipo} · {item.id}</span>
      </div>

      <ul className="rev-detalhe__motivos" aria-label="Por que revisar">
        {item.categorias.map(c => (
          <li key={c}>
            <Tag type={corDaCategoria(c)} size="sm">{rotulos[c]?.rotulo || c}</Tag>
            <span>{rotulos[c]?.descricao}</span>
          </li>
        ))}
      </ul>

      {modo === 'ajustar' ? (
        <TextArea id="rev-texto" labelText="Texto ajustado" rows={6} value={texto}
          helperText={'Entra no relatório na versão nova, como você escreveu, com as fontes do item e a marca '
            + '"Ajustado pelo analista". Os números não são conferidos com os documentos.'}
          onChange={e => setTexto(e.target.value)} />
      ) : (
        <p className={`rev-detalhe__texto${item.tipo_fonte === 'nao_localizado' ? ' rev-detalhe__texto--ausente' : ''}`}>
          {item.texto || '—'}
        </p>
      )}

      <h4 className="rev-detalhe__subtitulo">
        Evidências {item.evidencias.length > 0 && `(${item.evidencias.length})`}
      </h4>
      {item.evidencias.length ? (
        <ul className="rev-detalhe__evidencias">
          {item.evidencias.map((e, i) => (
            <li key={i}>
              <span className={`ana-rotulo ana-rotulo--${evidenciaDe(e.tipo_fonte).classe}`}>
                {evidenciaDe(e.tipo_fonte).rotulo}
              </span>
              <FonteClicavel evidencia={e} className="ana-fonte rev-detalhe__fonte">{rotuloEvidencia(e)}</FonteClicavel>
              {e.nota && <span className="rev-detalhe__nota">{e.nota}</span>}
              {e.entidade_divergente && (
                <span className="rev-detalhe__nota rev-detalhe__nota--alerta">Documento de {e.entidade}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ana-vazio">Sem fonte nos documentos do período.</p>
      )}

      {item.nao_localizado?.length > 0 && (
        <InlineNotification kind="warning" lowContrast hideCloseButton title="Não localizado"
          subtitle={item.nao_localizado.join(' · ')} />
      )}
      {item.numeros_removidos?.length > 0 && (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Números removidos do texto"
          subtitle={`${item.numeros_removidos.join(', ')}: não estão nos itens citados.`} />
      )}
      {item.avisos?.length > 0 && (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Problema na montagem"
          subtitle={item.avisos.join(' · ')} />
      )}

      {decisao?.status && decisao.status !== 'pendente' && (
        <p className="rev-detalhe__decisao">
          {revisaoDe(decisao.status).rotulo} por {decisao.usuario} em {dataHora(decisao.em)}
          {decisao.motivo && `: ${decisao.motivo}`}
          {decisao.texto_ajustado && <span className="rev-detalhe__ajuste">Texto ajustado: {decisao.texto_ajustado}</span>}
        </p>
      )}
      {aplicacao && (
        <p className={`rev-detalhe__aplicacao rev-detalhe__aplicacao--${aplicacao.status}`}>
          {APLICACAO[aplicacao.status] || aplicacao.status}
          {aplicacao.status === 'aplicado' && ` (versão ${aplicacao.versao}).`}
          {aplicacao.status === 'erro' && `: ${aplicacao.erro}. Ajuste de novo ou peça a correção ao agente.`}
        </p>
      )}
      {decisao?.anterior && (
        <p className="rev-detalhe__decisao rev-detalhe__decisao--anterior">
          O texto mudou numa versão nova. Decisão anterior: {revisaoDe(decisao.anterior.status).rotulo} por{' '}
          {decisao.anterior.usuario} (versão {decisao.anterior.versao}).
        </p>
      )}

      {modo === 'rejeitar' && (
        <TextArea id="rev-motivo" labelText="Motivo da rejeição" rows={2} value={motivo}
          helperText="Obrigatório. Vai para quem for corrigir o relatório."
          onChange={e => setMotivo(e.target.value)} />
      )}
      {erro && <InlineNotification kind="error" lowContrast hideCloseButton title={erro} />}

      <div className="rev-detalhe__acoes">
        <button type="button" className="ana-link" onClick={() => onVerNoRelatorio?.(item.ancora)}>
          Ver no relatório <ArrowRight size={14} />
        </button>
        <span className="rev-detalhe__botoes">
          {modo ? (
            <>
              <Button kind="ghost" size="sm" disabled={enviando}
                onClick={() => { setModo(null); setMotivo(''); setTexto(item.texto || ''); setErro('') }}>Cancelar</Button>
              {modo === 'ajustar' ? (
                <Button kind="primary" size="sm" renderIcon={Checkmark} disabled={enviando}
                  onClick={() => decidir('ajustado')}>Salvar ajuste</Button>
              ) : (
                <Button kind="danger" size="sm" renderIcon={Close} disabled={enviando}
                  onClick={() => decidir('rejeitado')}>Rejeitar</Button>
              )}
            </>
          ) : (
            <>
              <Button kind="danger--tertiary" size="sm" renderIcon={Close} disabled={enviando}
                onClick={() => setModo('rejeitar')}>Rejeitar</Button>
              <Button kind="tertiary" size="sm" renderIcon={Edit} disabled={enviando || !ajustavel}
                title={ajustavel ? undefined : gerando ? 'Aguarde a versão nova chegar'
                  : 'Tabela, gráfico, imagem e pendência: rejeite com o motivo e peça a correção ao agente'}
                onClick={() => setModo('ajustar')}>Ajustar</Button>
              <Button kind="primary" size="sm" renderIcon={Checkmark} disabled={enviando}
                onClick={() => decidir('aprovado')}>Aprovar</Button>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

// Pontos que o agente propôs sem fonte (28/10/2026): não entram no relatório; o analista decide. Para incluir, ele usa o
// lápis em "Pontos de atenção" (ou "Pontos fortes") no relatório completo: o texto entra assinado por ele.
const CAMPO_SUGESTAO = { pontos_atencao: 'Ponto de atenção', pontos_fortes: 'Ponto forte' }

function SugestoesDoAgente({ sugestoes = [] }) {
  const [copiado, setCopiado] = useState(null)
  if (!sugestoes.length) return null
  async function copiar(texto, i) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(i)
    } catch {
      setCopiado(null)
    }
  }
  return (
    <details className="rev-sugestoes">
      <summary className="rev-sugestoes__titulo">
        Sugestões do agente fora do relatório ({sugestoes.length})
      </summary>
      <p className="rev-sugestoes__dica">
        Pontos que o agente propôs sem fonte nos documentos. Não entram no relatório sozinhos: para incluir um, use o
        lápis em Pontos de atenção (ou Pontos fortes) no relatório completo e cole o texto; ele entra assinado por você.
      </p>
      <ul className="rev-sugestoes__lista">
        {sugestoes.map((s, i) => (
          <li key={`${s.em}-${i}`}>
            <span className="rev-sugestoes__campo">{CAMPO_SUGESTAO[s.campo] || s.campo}</span>
            <span className="rev-sugestoes__texto">{s.texto}</span>
            <button type="button" className="ana-fonte" onClick={() => copiar(s.texto, i)}>
              {copiado === i ? 'Copiado' : 'Copiar'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

function PainelRevisao({
  aberto, onFechar, resumo, revisao, categorias = [], filtroInicial, onDecidir, onDecidirLote, onVerNoRelatorio,
  onGerarVersao,
}) {
  const [status, setStatus] = useState('pendente')
  const [categoriasSel, setCategoriasSel] = useState([])
  const [secao, setSecao] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [confirmar, setConfirmar] = useState(null) // chave do lote aguardando o segundo clique
  const [erroLote, setErroLote] = useState('')

  const itens = useMemo(() => resumo?.itens || [], [resumo])

  // A confirmação do lote vale para o conjunto que estava na tela quando foi armada: mudar o filtro a desarma, senão
  // o segundo clique aprovaria outro conjunto de itens.
  useEffect(() => { setConfirmar(null) }, [status, categoriasSel, secao, busca])
  const rotulos = useMemo(() => Object.fromEntries(categorias.map(c => [c.id, c])), [categorias])
  const statusDe = id => revisao?.itens?.[id]?.status || 'pendente'

  // Abrir pelo cartão de uma seção, de uma categoria ou de um item já filtra.
  useEffect(() => {
    if (!aberto) return
    setSecao(filtroInicial?.secao || '')
    setCategoriasSel(filtroInicial?.categoria ? [filtroInicial.categoria] : [])
    setBusca('')
    const alvo = filtroInicial?.itemId
    setStatus(alvo && statusDe(alvo) !== 'pendente' ? 'todos' : 'pendente')
    setSelecionado(alvo || null)
    setConfirmar(null)
  }, [aberto, filtroInicial]) // só ao abrir: decidir itens depois não reposiciona o filtro

  const porStatus = itens.filter(i => {
    const s = statusDe(i.id)
    return status === 'todos' || (status === 'pendente' ? s === 'pendente' : s !== 'pendente')
  })
  const contagemCategorias = {}
  porStatus.filter(i => !secao || i.secao === secao)
    .forEach(i => { contagemCategorias[i.categoria] = (contagemCategorias[i.categoria] || 0) + 1 })

  const termo = busca.trim().toLowerCase()
  const visiveis = porStatus.filter(i =>
    (!secao || i.secao === secao)
    && (!categoriasSel.length || categoriasSel.includes(i.categoria))
    && (!termo || (i.texto || '').toLowerCase().includes(termo) || i.id.toLowerCase().includes(termo)))

  const grupos = []
  for (const item of visiveis) {
    let g = grupos.find(x => x.secao === item.secao)
    if (!g) {
      g = { secao: item.secao, titulo: item.secao_titulo, itens: [] }
      grupos.push(g)
    }
    g.itens.push(item)
  }

  const atual = itens.find(i => i.id === selecionado) || visiveis[0] || null
  const posicao = atual ? visiveis.findIndex(i => i.id === atual.id) : -1

  function irPara(delta) {
    const proximo = visiveis[posicao + delta]
    if (proximo) setSelecionado(proximo.id)
  }

  async function decidir(itemId, decisao) {
    // Próximo do filtro, calculado antes da decisão: com o filtro "Pendentes",
    // o item decidido sai da lista e o índice dele deixa de existir.
    const seguinte = visiveis.slice(posicao + 1).find(i => statusDe(i.id) === 'pendente')
      || visiveis.slice(0, Math.max(posicao, 0)).find(i => statusDe(i.id) === 'pendente')
    await onDecidir(itemId, decisao)
    setSelecionado(seguinte?.id || null)
  }

  async function aprovarLote(chave, ids) {
    if (confirmar !== chave) {
      setConfirmar(chave)
      return
    }
    setConfirmar(null)
    setErroLote('')
    try {
      await onDecidirLote(ids, { decisao: 'aprovado' })
    } catch (e) {
      setErroLote(e.message)
    }
  }

  function alternarCategoria(id) {
    setCategoriasSel(atuais => (atuais.includes(id) ? atuais.filter(c => c !== id) : [...atuais, id]))
  }

  const total = itens.length
  const revisados = itens.filter(i => statusDe(i.id) !== 'pendente').length
  const pendentesVisiveis = visiveis.filter(i => statusDe(i.id) === 'pendente').map(i => i.id)
  const filtrando = Boolean(categoriasSel.length || secao || termo)
  const secoes = []
  itens.forEach(i => { if (!secoes.some(s => s.secao === i.secao)) secoes.push({ secao: i.secao, titulo: i.secao_titulo }) })

  return (
    <ComposedModal open={aberto} onClose={onFechar} size="lg" className="rev-painel" preventCloseOnClickOutside>
      <ModalHeader
        label={`${resumo?.empresa || ''} · ${resumo?.referencia || ''} · versão ${resumo?.versao || ''}`}
        title="Revisão do relatório"
        closeModal={onFechar}
        iconDescription="Fechar"
      />
      {/* A fonte de cada evidência abre o documento por cima do painel (Voltar retorna ao item). */}
      <ProvedorDeFontes empresa={resumo?.empresa} embutido>
      <ModalBody className="rev-painel__corpo">
        <ProgressBar className="rev-painel__progresso" label={`${revisados} de ${total} itens revisados`}
          value={revisados} max={total || 1} size="small" hideLabel={false} />
        <SugestoesDoAgente sugestoes={resumo?.sugestoes_agente} />

        <div className="rev-filtros">
          <ContentSwitcher size="sm" selectedIndex={STATUS.indexOf(status)}
            onChange={({ index }) => setStatus(STATUS[index])} className="rev-filtros__status">
            <Switch name="pendente" text="Pendentes" />
            <Switch name="revisado" text="Revisados" />
            <Switch name="todos" text="Todos" />
          </ContentSwitcher>
          <Select id="rev-secao" labelText="Seção" hideLabel size="sm" value={secao}
            onChange={e => setSecao(e.target.value)} className="rev-filtros__secao">
            <SelectItem value="" text="Todas as seções" />
            {secoes.map(s => <SelectItem key={s.secao} value={s.secao} text={s.titulo} />)}
          </Select>
          <Search size="sm" labelText="Buscar" placeholder="Buscar no texto" value={busca}
            onChange={e => setBusca(e.target.value)} className="rev-filtros__busca" />
        </div>

        <div className="rev-categorias" role="group" aria-label="Categorias de revisão">
          {categorias.filter(c => contagemCategorias[c.id]).map(c => (
            <button key={c.id} type="button" title={c.descricao}
              className={`rev-chip rev-chip--${corDaCategoria(c.id)}${categoriasSel.includes(c.id) ? ' rev-chip--ativo' : ''}`}
              onClick={() => alternarCategoria(c.id)}>
              {c.rotulo} <strong>{contagemCategorias[c.id]}</strong>
            </button>
          ))}
          {categoriasSel.length > 0 && (
            <button type="button" className="ana-link" onClick={() => setCategoriasSel([])}>Limpar</button>
          )}
          {/* Lote só com filtro: aprovar tudo de uma vez, sem ler, é o que a revisão existe para evitar. */}
          {status === 'pendente' && filtrando && pendentesVisiveis.length > 0 && (
            <Button kind={confirmar === 'filtro' ? 'primary' : 'tertiary'} size="sm" renderIcon={Checkmark}
              className="rev-categorias__lote" onClick={() => aprovarLote('filtro', pendentesVisiveis)}>
              {confirmar === 'filtro'
                ? `Confirmar: aprovar ${pendentesVisiveis.length}`
                : `Aprovar os ${pendentesVisiveis.length} do filtro`}
            </Button>
          )}
        </div>
        {erroLote && <InlineNotification kind="error" lowContrast hideCloseButton title={erroLote} />}
        {(revisao?.ajustes?.aguardando > 0 || revisao?.ajustes?.pedido) && (
          <div className="rev-ajustes">
            {revisao.ajustes.pedido && !revisao.ajustes.pedido.atrasado ? (
              <span>Gerando a versão {resumo.versao + 1} com {revisao.ajustes.pedido.itens} ajuste(s)…</span>
            ) : revisao.ajustes.pedido?.atrasado ? (
              <>
                <span>O pedido de versão nova ficou sem resposta.</span>
                <Button kind="primary" size="sm" onClick={onGerarVersao}>Pedir de novo</Button>
              </>
            ) : (
              <>
                <span>{revisao.ajustes.aguardando} ajuste(s) ainda fora do relatório.</span>
                <Button kind="primary" size="sm" onClick={onGerarVersao}>
                  Gerar versão {resumo.versao + 1} com os ajustes
                </Button>
              </>
            )}
          </div>
        )}

        <div className="rev-painel__colunas">
          <nav className="rev-lista" aria-label="Itens para revisar">
            {grupos.length === 0 && <p className="ana-vazio rev-lista__vazio">Nenhum item neste filtro.</p>}
            {grupos.map(g => {
              const pend = g.itens.filter(i => statusDe(i.id) === 'pendente').map(i => i.id)
              const chave = `secao-${g.secao}`
              return (
                <section key={g.secao} className="rev-grupo">
                  <header className="rev-grupo__cabecalho">
                    <span className="rev-grupo__titulo">{g.titulo}</span>
                    <span className="rev-grupo__contagem">{g.itens.length}</span>
                    {pend.length > 1 && (
                      <button type="button" className={`rev-grupo__lote${confirmar === chave ? ' rev-grupo__lote--confirmar' : ''}`}
                        onClick={() => aprovarLote(chave, pend)}>
                        {confirmar === chave ? `Confirmar ${pend.length}` : `Aprovar ${pend.length}`}
                      </button>
                    )}
                  </header>
                  <ul>
                    {g.itens.map(item => {
                      const st = statusDe(item.id)
                      return (
                        <li key={item.id}>
                          <button type="button"
                            className={`rev-linha${atual?.id === item.id ? ' rev-linha--atual' : ''}`}
                            onClick={() => setSelecionado(item.id)}>
                            <span className={`rev-linha__status rev-linha__status--${st}`} title={revisaoDe(st).rotulo} />
                            <span className="rev-linha__corpo">
                              {/* span, não Tag: o Tag do Carbon é um botão, e botão dentro de botão é HTML inválido */}
                              <span className={`rev-etiqueta rev-etiqueta--${corDaCategoria(item.categoria)}`}>
                                {rotulos[item.categoria]?.rotulo || item.categoria}
                              </span>
                              <span className="rev-linha__texto">{item.texto || item.id}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </nav>

          <Detalhe
            item={atual}
            decisao={atual ? revisao?.itens?.[atual.id] : null}
            rotulos={rotulos}
            onDecidir={decidir}
            onVerNoRelatorio={onVerNoRelatorio}
            gerando={Boolean(revisao?.ajustes?.pedido)}
            onAnterior={posicao > 0 ? () => irPara(-1) : null}
            onProximo={posicao >= 0 && posicao < visiveis.length - 1 ? () => irPara(1) : null}
          />
        </div>
      </ModalBody>
      </ProvedorDeFontes>
    </ComposedModal>
  )
}

export default PainelRevisao
