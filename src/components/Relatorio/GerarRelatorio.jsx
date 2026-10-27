import { useEffect, useMemo, useState } from 'react'
import { InlineNotification, Modal, Select, SelectItem } from '@carbon/react'
import { obterFontes } from '../../services/resumosApi'
import { gerarRelatorioPadrao } from '../../services/relatoriosApi'
import useAndamentoRelatorio from '../../hooks/useAndamentoRelatorio'
import ProgressoRelatorio from './ProgressoRelatorio.jsx'

// Gerar o relatório padrão de qualquer empresa com documentos, em qualquer período com ITR (ou DFP, no 4T), sem passar
// pelo agente (27/10/2026): o serviço de geração leva segundos e a tela mostra as etapas reais. Personalização
// (foco, seções, observações): pelo chat.

// Trimestres com relatório possível, do mais recente ao mais antigo: ITR-2T26 -> 2T26; DFP-2025 -> 4T25.
export function periodosDosDocumentos(documentos = []) {
  const saida = new Set()
  for (const d of documentos) {
    const itr = /^ITR-(\d)T(\d{2})/.exec(d.codigo || '')
    if (itr && d.pasta === 'itr') saida.add(`${itr[1]}T${itr[2]}`)
    const dfp = /^DFP-\d{2}(\d{2})/.exec(d.codigo || '')
    if (dfp && d.pasta === 'dfp') saida.add(`4T${dfp[1]}`)
  }
  return [...saida].sort((a, b) => (b.slice(2) + b[0]).localeCompare(a.slice(2) + a[0]))
}

export default function GerarRelatorio({ aberto, empresaInicial = '', onFechar, onPronto }) {
  const [empresas, setEmpresas] = useState([])
  const [empresa, setEmpresa] = useState(empresaInicial)
  const [documentos, setDocumentos] = useState([])
  const [periodo, setPeriodo] = useState('')
  const [operacao, setOperacao] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const andamento = useAndamentoRelatorio(operacao)

  useEffect(() => {
    if (!aberto) return
    setOperacao(null)
    setErro('')
    obterFontes().then(f => {
      setEmpresas(f.empresas || [])
      setEmpresa(atual => atual || empresaInicial || (f.empresas || [])[0] || '')
    }).catch(e => setErro(e.message))
  }, [aberto, empresaInicial])

  useEffect(() => {
    if (!aberto || !empresa) return
    obterFontes(empresa).then(f => setDocumentos(f.documentos || [])).catch(() => setDocumentos([]))
  }, [aberto, empresa])

  const periodos = useMemo(() => periodosDosDocumentos(documentos), [documentos])
  useEffect(() => { setPeriodo(periodos[0] || '') }, [periodos])

  useEffect(() => {
    if (andamento?.estado === 'concluida' && andamento.relatorio_id) onPronto?.(andamento.relatorio_id)
  }, [andamento?.estado, andamento?.relatorio_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function gerar() {
    setErro('')
    setEnviando(true)
    try {
      const pedido = await gerarRelatorioPadrao({ empresa, periodo })
      setOperacao(pedido.operacao_id)
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const gerando = Boolean(operacao) && !['concluida', 'falhou'].includes(andamento?.estado)
  return (
    <Modal open={aberto} modalHeading="Gerar relatório de crédito" primaryButtonText={operacao ? 'Fechar' : 'Gerar'}
      secondaryButtonText={operacao ? undefined : 'Cancelar'} primaryButtonDisabled={enviando || gerando || (!operacao && !empresa)}
      onRequestSubmit={operacao ? onFechar : gerar} onRequestClose={onFechar} size="sm">
      {!operacao && (
        <>
          <p className="cds--modal-content__text" style={{ marginBottom: '1rem' }}>
            No formato padrão, em segundos. Para personalizar (foco, seções, observações), peça pelo chat.
          </p>
          <Select id="gerar-empresa" labelText="Empresa" value={empresa} onChange={e => setEmpresa(e.target.value)}>
            {empresas.map(n => <SelectItem key={n} value={n} text={n} />)}
          </Select>
          <div style={{ marginTop: '1rem' }}>
            <Select id="gerar-periodo" labelText="Período (trimestre dos documentos)" value={periodo}
              onChange={e => setPeriodo(e.target.value)} disabled={!periodos.length}>
              {periodos.map(p => <SelectItem key={p} value={p} text={p} />)}
            </Select>
          </div>
        </>
      )}
      {operacao && <ProgressoRelatorio andamento={andamento} solicitado />}
      {erro && <InlineNotification kind="error" lowContrast title="Não foi possível gerar" subtitle={erro} hideCloseButton />}
    </Modal>
  )
}
