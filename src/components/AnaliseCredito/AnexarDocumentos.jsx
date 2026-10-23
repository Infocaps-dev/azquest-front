import { useEffect, useState } from 'react'
import {
  Button,
  FileUploaderDropContainer,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
} from '@carbon/react'
import {
  confirmarDocumentos,
  descartarDocumentos,
  enviarParaIdentificacao,
  listarTiposDeDocumento,
} from '../../services/documentosApi'

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

const CORES_DA_CONFIANCA = { alta: 'green', media: 'teal', baixa: 'gray' }

function AnexarDocumentos({ aoEnviar }) {
  const [tipos, setTipos] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [recusados, setRecusados] = useState([])
  const [identificando, setIdentificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    listarTiposDeDocumento().then(setTipos).catch(() => setTipos([]))
  }, [])

  async function aoAnexar(_evento, { addedFiles }) {
    if (!addedFiles?.length) return
    setErro('')
    setResultado(null)
    setIdentificando(true)
    try {
      const resposta = await enviarParaIdentificacao(addedFiles)
      // Concatena em vez de substituir: anexar um segundo lote não pode
      // descartar em silêncio o que já estava esperando confirmação.
      setDocumentos(anteriores => [...anteriores, ...resposta.documentos])
      setRecusados(anteriores => [...anteriores, ...resposta.recusados])
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setIdentificando(false)
    }
  }

  function trocarTipo(chave, tipo) {
    setDocumentos(anteriores =>
      anteriores.map(d => (d.chave_recebida === chave ? { ...d, tipo } : d)),
    )
  }

  async function remover(chave) {
    setDocumentos(anteriores => anteriores.filter(d => d.chave_recebida !== chave))
    // O recebimento é apagado no bucket também: sem isso a área acumularia
    // para sempre todo PDF que alguém abriu por engano.
    descartarDocumentos([chave]).catch(() => {})
  }

  async function enviar() {
    setErro('')
    setEnviando(true)
    try {
      const resposta = await confirmarDocumentos(
        documentos.map(d => ({ chave_recebida: d.chave_recebida, tipo: d.tipo })),
      )
      setResultado(resposta)
      setDocumentos(resposta.falhas.length
        ? documentos.filter(d =>
            resposta.falhas.some(f => f.chave_recebida === d.chave_recebida))
        : [])
      aoEnviar?.(resposta)
    } catch (falha) {
      setErro(falha.message)
    } finally {
      setEnviando(false)
    }
  }

  const faltaEscolher = documentos.filter(d => !d.tipo).length
  const extensoes = [...new Set(tipos.flatMap(t => t.extensoes))]

  return (
    <section className="ana-anexos" aria-label="Anexar documentos">
      <h2 className="ana-secao__titulo">Anexar documentos</h2>
      <p className="ana-anexos__ajuda">
        ITR, DFP, release, escritura, relatório do agente fiduciário, rating ou
        planilha de RI. O tipo é identificado pela capa do documento — confira
        antes de enviar.
      </p>

      <FileUploaderDropContainer
        accept={extensoes}
        labelText="Arraste os documentos ou clique para selecionar"
        multiple
        disabled={identificando || enviando}
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
            {documentos.map(documento => (
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
                    onChange={e => trocarTipo(documento.chave_recebida, e.target.value)}
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
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => remover(documento.chave_recebida)}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Button
            onClick={enviar}
            disabled={enviando || faltaEscolher > 0}
            size="md"
          >
            {enviando
              ? 'Enviando…'
              : `Enviar ${documentos.length} documento(s) para extração`}
          </Button>
          {faltaEscolher > 0 && (
            <p className="ana-anexos__pendencia">
              {faltaEscolher} documento(s) ainda sem tipo escolhido.
            </p>
          )}
        </>
      )}

      {resultado?.gravados?.length > 0 && (
        <InlineNotification
          kind="success"
          lowContrast
          title={`${resultado.gravados.length} documento(s) enviado(s)`}
          subtitle={
            `A extração começa automaticamente. Pastas: `
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
