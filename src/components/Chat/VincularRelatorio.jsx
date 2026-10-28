import { useEffect, useState } from 'react'
import { InlineNotification, Modal, Select, SelectItem } from '@carbon/react'
import { listarResumos } from '../../services/resumosApi'
import { dataHora } from '../AnaliseCredito/vocabulario'
import Carregando from '../Comum/Carregando.jsx'

// Escolha de um relatório pronto para a conversa: dali em diante, os pedidos de alteração feitos no chat viram versões
// novas dele (sem isso, só o relatório gerado na própria conversa podia ser alterado por ela).

function VincularRelatorio({ aberto, atual, onFechar, onEscolher }) {
  const [relatorios, setRelatorios] = useState([])
  const [escolhido, setEscolhido] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setCarregando(true)
    listarResumos()
      .then(indice => {
        const lista = indice.relatorios || []
        setRelatorios(lista)
        setEscolhido(lista.some(r => r.relatorio_id === atual) ? atual : lista[0]?.relatorio_id || '')
      })
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [aberto, atual])

  return (
    <Modal open={aberto} size="sm" modalHeading="Relatório desta conversa"
      primaryButtonText="Usar este relatório" secondaryButtonText="Cancelar"
      primaryButtonDisabled={carregando || !escolhido}
      onRequestClose={onFechar} onRequestSubmit={() => { onEscolher(escolhido); onFechar() }}>
      <p className="chat-vincular__texto">
        Os pedidos de alteração desta conversa (trocar um trecho, inserir um gráfico ou uma notícia) vão gerar versões
        novas do relatório escolhido. As perguntas continuam funcionando normalmente.
      </p>
      {carregando && <Carregando compacto descricao="Carregando os relatórios" />}
      {erro && <InlineNotification kind="warning" lowContrast hideCloseButton title={erro} />}
      {!carregando && !erro && (relatorios.length ? (
        <Select id="vincular-relatorio" labelText="Relatório" value={escolhido} onChange={e => setEscolhido(e.target.value)}>
          {relatorios.map(r => (
            <SelectItem key={r.relatorio_id} value={r.relatorio_id}
              text={`${r.empresa} · ${r.periodo} · versão ${r.versao} · ${dataHora(r.atualizado_em)}`} />
          ))}
        </Select>
      ) : (
        <InlineNotification kind="info" lowContrast hideCloseButton title="Nenhum relatório gerado ainda."
          subtitle="Peça um relatório no chat: ele passa a ser o desta conversa." />
      ))}
    </Modal>
  )
}

export default VincularRelatorio
