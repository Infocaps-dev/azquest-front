import { useEffect } from 'react'
import { ActionableNotification } from '@carbon/react'
import './AvisosRelatorios.scss'

// Toasts de relatório novo disponível, no canto da tela, em qualquer aba.
//
// Sem roubar o foco (hasFocus=false): o aviso costuma chegar enquanto o
// analista está digitando no chat. Some sozinho em 30 s; "Abrir" leva para a
// Análise de Crédito já com o relatório selecionado.

const DURACAO_MS = 30000

function Aviso({ aviso, onAbrir, onDispensar }) {
  useEffect(() => {
    const relogio = setTimeout(() => onDispensar(aviso.chave), DURACAO_MS)
    return () => clearTimeout(relogio)
  }, [aviso.chave, onDispensar])

  const versaoNova = aviso.versao > 1
  return (
    <ActionableNotification
      inline={false}
      kind="success"
      lowContrast
      hasFocus={false}
      role="status"
      title={versaoNova ? `Versão ${aviso.versao} disponível` : 'Relatório novo disponível'}
      subtitle={`${aviso.empresa} · ${aviso.referencia || aviso.periodo}. Já pode ser consultado nas abas.`}
      actionButtonLabel="Abrir"
      onActionButtonClick={() => { onAbrir(aviso.relatorio_id); onDispensar(aviso.chave) }}
      onClose={() => { onDispensar(aviso.chave); return false }}
      statusIconDescription="Relatório disponível"
      className="avisos-relatorios__aviso"
    />
  )
}

function AvisosRelatorios({ avisos, onAbrir, onDispensar }) {
  if (!avisos.length) return null
  return (
    <div className="avisos-relatorios" aria-live="polite">
      {avisos.map(a => <Aviso key={a.chave} aviso={a} onAbrir={onAbrir} onDispensar={onDispensar} />)}
    </div>
  )
}

export default AvisosRelatorios
