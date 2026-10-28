import { useEffect, useRef, useState } from 'react'
import {
  Button,
  FileUploaderDropContainer,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextInput,
} from '@carbon/react'
import {
  confirmarDocumentos,
  descartarDocumentos,
  enviarParaIdentificacao,
  listarTiposDeDocumento,
} from '../../services/documentosApi'
import { listarEmissores } from '../../services/coletaApi'
import NovoEmissor, { OPCAO_NOVO_EMISSOR } from '../Emissores/NovoEmissor.jsx'
import AtuacaoEmissor from '../Emissores/AtuacaoEmissor.jsx'
import { EVENTO_EMISSORES } from '../Emissores/atuacao'
import { useAuth } from '../../auth/AuthContext.jsx'
import {
  formatoDoPeriodo,
  nomePadronizado,
  pedePeriodo,
  periodoDoNome,
  periodoDoTrimestre,
  periodoValido,
  subtipoDoNome,
  trimestreDoPeriodo,
} from '../../services/nomesDoAcervo'
import SeletorPeriodo from '../Periodo/SeletorPeriodo.jsx'
import { ordem, periodoValido as intervaloValido, rotuloPeriodo, trimestres } from '../Periodo/periodos'
import Carregando from '../Comum/Carregando.jsx'

// Anexar documentos à análise: o campo de upload e a confirmação do tipo.
//
// Duas etapas numa tela só. O analista arrasta os PDFs, a API lê a capa de
// cada um e devolve o tipo identificado; a lista aparece com o palpite já
// marcado e o motivo em texto; o botão grava tudo na pasta certa do bucket.
//
// Por que confirmar, se a API já identificou
// ------------------------------------------
// Porque o custo do erro é assimétrico. Confirmar é um clique; a pasta errada
// é o extrator rodando o perfil errado por até 10 minutos e um JSON errado que
// ninguém percebe. E porque existe um caso real no acervo em que o nome do
// arquivo mente: `ITR-4T25-ECORODOVIAS.pdf` é a DFP do exercício. A API acerta
// esse pelo conteúdo e avisa da divergência — mas quem assina a escolha é a
// pessoa.
//
// Palpite fraco não vem pré-selecionado: `tipo` volta nulo e o seletor abre em
// branco. Pré-selecionar um chute é o mesmo que não ter perguntado.
//
// O nome com que o documento entra no bucket
// ------------------------------------------
// A extração grava o JSON com o nome do arquivo, e as tools do acervo
// reconhecem o documento por ele (ver services/nomesDoAcervo.js): um ITR que
// chega como "Ecorodovias_ITR_set26.pdf" é extraído, mas nenhum relatório o usa.
// Por isso a linha pede o período quando o tipo precisa dele e mostra o nome
// final. A API grava com o nome que recebeu; quando o nome final é outro, o
// envio sobe o arquivo de novo já com o nome certo e descarta o recebimento
// antigo. Quem anexa no padrão (ITR-3T26-ECORODOVIAS.pdf) não paga esse
// segundo envio.
//
// O emissor
// ---------
// A lista é a da aba Coleta (coleta-api /api/emissores), e o documento entra no
// bucket de entrada do emissor escolhido: um documento da Motiva no bucket da
// Ecorodovias seria extraído para o acervo dela. Com mais de um emissor, nada
// vem escolhido; com documentos esperando confirmação, o emissor não muda (os
// recebimentos já estão no bucket dele).

const CORES_DA_CONFIANCA = { alta: 'green', media: 'teal', baixa: 'gray' }

// O tipo do nome: release/ guarda o release (RR-) e a apresentação (AR-).
function tipoDoNome(documento) {
  return documento.tipo === 'release' ? documento.subtipo : documento.tipo
}

function nomeNoAcervo(documento, emissor) {
  return nomePadronizado({
    arquivo: documento.arquivo,
    tipo: tipoDoNome(documento),
    periodo: documento.periodo,
    emissor,
  })
}

// O que impede o envio do documento, ou ''. Com um intervalo escolhido para o lote, o documento precisa estar
// dentro dele (a DFP de 2025 é o 4T25; a planilha de 2026-06, o 2T26).
function pendenciaDe(documento, lote) {
  if (!documento.tipo) return 'sem tipo'
  const tipo = tipoDoNome(documento)
  if (!pedePeriodo(tipo)) return ''
  if (!periodoValido(tipo, documento.periodo)) {
    return `período no formato ${formatoDoPeriodo(tipo).exemplo}`
  }
  const trimestre = trimestreDoPeriodo(tipo, documento.periodo)
  if (lote?.ate && trimestre && (ordem(trimestre) < ordem(lote.de) || ordem(trimestre) > ordem(lote.ate))) {
    return `fora do intervalo ${rotuloPeriodo(lote.de, lote.ate)}`
  }
  return ''
}

// O período do documento quando o nome não diz: o trimestre do lote, no formato do tipo. Num intervalo não há um só.
function periodoDoLote(tipo, lote) {
  return lote?.de && !lote.ate ? periodoDoTrimestre(tipo, lote.de) : ''
}

function AnexarDocumentos({ aoEnviar }) {
  const [tipos, setTipos] = useState([])
  const [emissores, setEmissores] = useState(null)
  const [emissor, setEmissor] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const { user } = useAuth()
  const [documentos, setDocumentos] = useState([])
  // A que período os documentos se referem: um trimestre (ate null) ou um intervalo. Começa no último fechado.
  const [lote, setLote] = useState(() => ({ de: trimestres()[0], ate: null }))
  // O arquivo de cada recebimento, para subir de novo com o nome do acervo.
  const locais = useRef(new Map())
  const [recusados, setRecusados] = useState([])
  const [identificando, setIdentificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    listarTiposDeDocumento().then(setTipos).catch(() => setTipos([]))
    listarEmissores().then(lista => {
      setEmissores(lista)
      if (lista.length === 1) setEmissor(lista[0].emissor)
    }).catch(falha => {
      setEmissores([])
      setErro(`Não foi possível carregar os emissores: ${falha.message}`)
    })
  }, [])

  // Cadastro ou atuação gravados em outra aba: relê a lista, mantendo a seleção.
  useEffect(() => {
    const reler = () => listarEmissores().then(setEmissores).catch(() => {})
    window.addEventListener(EVENTO_EMISSORES, reler)
    return () => window.removeEventListener(EVENTO_EMISSORES, reler)
  }, [])

  // Emissor recém-cadastrado (ou o existente com o mesmo CNPJ): a lista é relida e ele fica selecionado.
  function emissorCadastrado(registro) {
    listarEmissores().then(lista => {
      setEmissores(lista)
      setEmissor(registro.emissor)
    }).catch(falha => setErro(`Não foi possível recarregar os emissores: ${falha.message}`))
  }

  async function aoAnexar(_evento, { addedFiles }) {
    if (!addedFiles?.length) return
    setErro('')
    setResultado(null)
    setIdentificando(true)
    try {
      const resposta = await enviarParaIdentificacao(addedFiles, emissor)
      const novos = resposta.documentos.map(documento => {
        const local = addedFiles.find(a => a.name === documento.arquivo_original)
        if (local) locais.current.set(documento.chave_recebida, local)
        const subtipo = subtipoDoNome(documento.arquivo_original)
        const tipoNome = documento.tipo === 'release' ? subtipo : documento.tipo
        return {
          ...documento,
          subtipo,
          periodo: tipoNome ? (periodoDoNome(documento.arquivo_original, tipoNome) || periodoDoLote(tipoNome, lote)) : '',
        }
      })
      // Concatena em vez de substituir: anexar um segundo lote não pode
      // descartar em silêncio o que já estava esperando confirmação.
      setDocumentos(anteriores => [...anteriores, ...novos])
      setRecusados(anteriores => [...anteriores, ...resposta.recusados])
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setIdentificando(false)
    }
  }

  function alterar(chave, mudanca) {
    setDocumentos(anteriores => anteriores.map(d => {
      if (d.chave_recebida !== chave) return d
      const novo = { ...d, ...mudanca }
      // Trocar o tipo relê o período do nome no formato do tipo novo (o 4T25
      // de um ITR que a capa mostra ser DFP vira o exercício de 2025).
      if ('tipo' in mudanca || 'subtipo' in mudanca) {
        const tipoNome = tipoDoNome(novo)
        novo.periodo = (tipoNome && periodoDoNome(d.arquivo_original || d.arquivo, tipoNome))
          || (periodoValido(tipoNome, d.periodo) ? d.periodo : '') || periodoDoLote(tipoNome, lote)
      }
      return novo
    }))
  }

  async function remover(chave) {
    setDocumentos(anteriores => anteriores.filter(d => d.chave_recebida !== chave))
    locais.current.delete(chave)
    // O recebimento é apagado no bucket também: sem isso a área acumularia
    // para sempre todo PDF que alguém abriu por engano.
    descartarDocumentos([chave], emissor).catch(() => {})
  }

  // Sobe o arquivo de novo com o nome do acervo, quando o recebido é outro.
  async function comNomeDoAcervo(documento) {
    const nome = nomeNoAcervo(documento, emissor)
    const local = locais.current.get(documento.chave_recebida)
    if (nome === documento.arquivo || !local) return documento
    const resposta = await enviarParaIdentificacao([
      new File([local], nome, { type: local.type }),
    ], emissor)
    const novo = resposta.documentos[0]
    if (!novo) {
      throw new Error(resposta.recusados[0]?.motivo || `${nome}: o reenvio foi recusado.`)
    }
    locais.current.delete(documento.chave_recebida)
    locais.current.set(novo.chave_recebida, local)
    descartarDocumentos([documento.chave_recebida], emissor).catch(() => {})
    // Tipo, período e alertas continuam os da primeira leitura: o nome novo
    // foi montado a partir deles.
    return { ...documento, arquivo: novo.arquivo, chave_recebida: novo.chave_recebida }
  }

  async function enviar() {
    setErro('')
    setEnviando(true)
    let atuais = documentos
    try {
      // Um por vez, e cada troca de chave já fica no estado: se o terceiro
      // falhar, os dois primeiros não ficam apontando para recebimento apagado.
      for (let i = 0; i < atuais.length; i += 1) {
        const renomeado = await comNomeDoAcervo(atuais[i])
        if (renomeado !== atuais[i]) {
          atuais = atuais.map((d, j) => (j === i ? renomeado : d))
          setDocumentos(atuais)
        }
      }
      const resposta = await confirmarDocumentos(
        atuais.map(d => ({ chave_recebida: d.chave_recebida, tipo: d.tipo })),
        emissor,
      )
      setResultado(resposta)
      setDocumentos(resposta.falhas.length
        ? atuais.filter(d =>
            resposta.falhas.some(f => f.chave_recebida === d.chave_recebida))
        : [])
      for (const gravado of resposta.gravados) {
        const enviado = atuais.find(d => d.arquivo === gravado.arquivo)
        if (enviado) locais.current.delete(enviado.chave_recebida)
      }
      aoEnviar?.(resposta)
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setEnviando(false)
    }
  }

  const pendentes = documentos.filter(d => pendenciaDe(d, lote)).length
  const extensoes = [...new Set(tipos.flatMap(t => t.extensoes))]

  return (
    <section className="ana-anexos" aria-label="Anexar documentos">
      <h2 className="ana-secao__titulo">Anexar documentos</h2>
      <p className="ana-anexos__ajuda">
        ITR, DFP, release, escritura, relatório do agente fiduciário, rating ou
        planilha de RI. O tipo é identificado pela capa do documento — confira
        antes de enviar.
      </p>

      {emissores === null && <Carregando compacto descricao="Carregando os emissores" />}
      {/* Emissor e atuação lado a lado, como na Coleta automática (mesmo grid, col-form) */}
      <div className="col-form anexos-emissor-linha">
      {emissores !== null && (
        <Select
          id="anexos-emissor"
          labelText="Emissor"
          value={emissor}
          onChange={e => (e.target.value === OPCAO_NOVO_EMISSOR ? setNovoAberto(true) : setEmissor(e.target.value))}
          disabled={documentos.length > 0 || identificando || enviando}
          helperText={documentos.length > 0
            ? 'Envie ou remova os documentos anexados para trocar o emissor.'
            : 'Os documentos entram no acervo deste emissor.'}
        >
          {emissores.length !== 1 && <SelectItem value="" text="Selecione…" />}
          {emissores.map(e => <SelectItem key={e.emissor} value={e.emissor} text={e.razao_social} />)}
          <SelectItem value={OPCAO_NOVO_EMISSOR} text="+ Novo emissor…" />
        </Select>
      )}
      <AtuacaoEmissor emissor={emissores?.find(e => e.emissor === emissor)}
        podeEditar={user?.role !== 'leitor' && !enviando} onAtualizado={() => emissorCadastrado({ emissor })} />
      </div>
      <NovoEmissor aberto={novoAberto} onFechar={() => setNovoAberto(false)} onCriado={emissorCadastrado} />

      <SeletorPeriodo id="anexos-periodo" valor={lote} onChange={setLote} disabled={enviando}
        helperText={'A que período os documentos se referem. Um trimestre preenche o período de quem não o traz no '
          + 'nome; num intervalo, cada documento precisa estar dentro dele.'} />

      <FileUploaderDropContainer
        accept={extensoes}
        labelText={emissor
          ? 'Arraste os documentos ou clique para selecionar'
          : 'Escolha o emissor para anexar documentos'}
        multiple
        disabled={!emissor || identificando || enviando}
        onAddFiles={aoAnexar}
      />

      {identificando && (
        <InlineLoading description="Lendo a capa dos documentos…" />
      )}

      {erro && (
        <InlineNotification
          kind="error"
          lowContrast
          title="Não foi possível anexar"
          subtitle={erro}
          onCloseButtonClick={() => setErro('')}
        />
      )}

      {recusados.map(recusado => (
        <InlineNotification
          key={recusado.arquivo}
          kind="warning"
          lowContrast
          hideCloseButton
          title={recusado.arquivo}
          subtitle={recusado.motivo}
        />
      ))}

      {documentos.length > 0 && (
        <>
          <ul className="ana-anexos__lista">
            {documentos.map(documento => {
              const tipoNome = tipoDoNome(documento)
              const pendencia = pendenciaDe(documento, lote)
              return (
              <li key={documento.chave_recebida} className="ana-anexos__item">
                <div className="ana-anexos__cabecalho">
                  <span className="ana-anexos__arquivo">{documento.arquivo}</span>
                  <Tag type={CORES_DA_CONFIANCA[documento.confianca]} size="sm">
                    confiança {documento.confianca}
                  </Tag>
                </div>

                <p className="ana-anexos__motivo">{documento.motivo}</p>

                {documento.alertas.map(alerta => (
                  <InlineNotification
                    key={alerta.tipo}
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    title="Confira"
                    subtitle={alerta.mensagem}
                  />
                ))}

                <div className="ana-anexos__acoes">
                  <Select
                    id={`tipo-${documento.chave_recebida}`}
                    labelText="Pasta de destino"
                    size="sm"
                    value={documento.tipo || ''}
                    onChange={e => alterar(documento.chave_recebida, { tipo: e.target.value })}
                    invalid={!documento.tipo}
                    invalidText="Escolha o tipo: a capa não permitiu identificar."
                  >
                    <SelectItem value="" text="Selecione…" />
                    {tipos
                      .filter(t => t.extensoes.some(e => documento.arquivo.toLowerCase().endsWith(e)))
                      .map(t => (
                        <SelectItem key={t.tipo} value={t.tipo} text={t.rotulo} />
                      ))}
                  </Select>
                  {documento.tipo === 'release' && (
                    <Select
                      id={`subtipo-${documento.chave_recebida}`}
                      labelText="Documento"
                      size="sm"
                      value={documento.subtipo}
                      onChange={e => alterar(documento.chave_recebida, { subtipo: e.target.value })}
                    >
                      <SelectItem value="release" text="Release (RR)" />
                      <SelectItem value="apresentacao" text="Apresentação (AR)" />
                    </Select>
                  )}
                  {pedePeriodo(tipoNome) && (
                    <TextInput
                      id={`periodo-${documento.chave_recebida}`}
                      className="ana-anexos__periodo"
                      labelText="Período"
                      size="sm"
                      value={documento.periodo}
                      placeholder={formatoDoPeriodo(tipoNome).exemplo}
                      onChange={e => alterar(documento.chave_recebida, { periodo: e.target.value.toUpperCase() })}
                      invalid={!periodoValido(tipoNome, documento.periodo) || pendencia.startsWith('fora')}
                      invalidText={pendencia.startsWith('fora') ? pendencia : `Ex.: ${formatoDoPeriodo(tipoNome).exemplo}`}
                    />
                  )}
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => remover(documento.chave_recebida)}
                  >
                    Remover
                  </Button>
                </div>

                {!pendencia && (
                  <p className="ana-anexos__destino">
                    Entra no acervo como {documento.tipo}/{nomeNoAcervo(documento, emissor)}
                  </p>
                )}
              </li>
              )
            })}
          </ul>

          <Button
            onClick={enviar}
            disabled={enviando || pendentes > 0 || !intervaloValido(lote)}
            size="md"
          >
            {enviando
              ? 'Enviando…'
              : `Enviar ${documentos.length} documento(s) para extração`}
          </Button>
          {pendentes > 0 && (
            <p className="ana-anexos__pendencia">
              {pendentes} documento(s) sem tipo, sem período ou fora do intervalo escolhido.
            </p>
          )}
        </>
      )}

      {resultado?.falhas?.map(falha => (
        <InlineNotification
          key={falha.chave_recebida}
          kind="error"
          lowContrast
          hideCloseButton
          title={falha.chave_recebida.split('/').pop()}
          subtitle={falha.motivo}
        />
      ))}

      {resultado?.gravados?.length > 0 && (
        <InlineNotification
          kind="success"
          lowContrast
          title={`${resultado.gravados.length} documento(s) enviado(s)`}
          subtitle={
            `A extração começa automaticamente e leva alguns minutos; depois `
            + 'o documento passa a valer nas consultas do chat e nos relatórios. Pastas: '
            + [...new Set(resultado.gravados.map(g => g.tipo))].join(', ') + '.'
            + (resultado.gravados.some(g => g.substituiu_existente)
              ? ' Atenção: um ou mais substituíram um arquivo de mesmo nome.'
              : '')
          }
          onCloseButtonClick={() => setResultado(null)}
        />
      )}
    </section>
  )
}

export default AnexarDocumentos
