import { useState } from 'react'
import { Button, InlineLoading, InlineNotification, Modal, Select, SelectItem } from '@carbon/react'
import { DocumentAdd } from '@carbon/icons-react'
import { itemDaConsulta, listarResumos } from '../../services/resumosApi'
import { dataHora } from '../AnaliseCredito/vocabulario'

// Botão "Inserir no relatório", embaixo de um gráfico do modelo do EBITDA ou ao lado de uma notícia na conversa.
//
// O que o chat mostrou já está salvo no acervo (consulta salva): a tela acha o ID do item pela resumos-api, o analista
// escolhe o relatório e o lugar, e a mensagem vai pelo próprio chat. O Analista a repassa inteira ao Agente de
// Relatório, que insere o item pelo ID com a citação (o código monta o bloco: o modelo não reescreve o gráfico nem a
// notícia) e grava a versão nova. A mensagem fica na conversa, com a resposta do agente.

const DESTINOS = {
  grafico: ['Anexo I – Projeções', '9.a Ebitda ajustado e margem'],
  noticia: ['Observações', 'Pontos de atenção', 'Pontos fortes', '5.e Eventos de compliance',
    '18 Processos judiciais/contingências'],
}

function InserirNoRelatorio({ grafico, link, onEnviar, compacto = false }) {
  const tipo = grafico ? 'grafico' : 'noticia'
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [item, setItem] = useState(null)
  const [relatorios, setRelatorios] = useState([])
  const [relatorioId, setRelatorioId] = useState('')
  const [destino, setDestino] = useState(DESTINOS[tipo][0])

  async function abrir() {
    setAberto(true)
    setErro('')
    setCarregando(true)
    try {
      const [achado, indice] = await Promise.all([itemDaConsulta({ grafico, link }), listarResumos()])
      setItem(achado)
      setRelatorios(indice.relatorios || [])
      setRelatorioId(indice.relatorios?.[0]?.relatorio_id || '')
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }

  function inserir() {
    // A parte do destino antes do espaço é o que a tool entende ("Anexo I", "9.a", "18"); o quadro vai por nome.
    const secao = /^(\d+(\.[a-h])?)\s/.exec(destino)?.[1] || destino.replace(/\s+–.*$/, '')
    onEnviar([
      `relatorio_id: ${relatorioId}`,
      'Origem: chat (botão Inserir no relatório)',
      `Inserir no relatório: ${item.id} (${item.descricao})`,
      `Destino: ${secao}`,
    ].join('\n'))
    setAberto(false)
  }

  return (
    <>
      {compacto
        ? <Button kind="ghost" size="sm" hasIconOnly renderIcon={DocumentAdd} iconDescription="Inserir no relatório"
            tooltipPosition="left" onClick={abrir} className="chat-inserir__icone" />
        : <Button kind="ghost" size="sm" renderIcon={DocumentAdd} onClick={abrir}>Inserir no relatório</Button>}
      <Modal open={aberto} modalHeading={tipo === 'grafico' ? 'Inserir o gráfico no relatório' : 'Inserir a notícia no relatório'}
        primaryButtonText="Inserir" secondaryButtonText="Cancelar" size="sm"
        primaryButtonDisabled={carregando || !item || !relatorioId}
        onRequestClose={() => setAberto(false)} onRequestSubmit={inserir}>
        {carregando && <InlineLoading description="Procurando o item salvo e os relatórios" />}
        {erro && <InlineNotification kind="warning" lowContrast hideCloseButton title={erro} />}
        {item && !carregando && (
          <>
            <p className="chat-inserir__item">{item.descricao}</p>
            {relatorios.length ? (
              <Select id="inserir-relatorio" labelText="Relatório" value={relatorioId}
                onChange={e => setRelatorioId(e.target.value)}>
                {relatorios.map(r => (
                  <SelectItem key={r.relatorio_id} value={r.relatorio_id}
                    text={`${r.empresa} · ${r.periodo} · versão ${r.versao} · ${dataHora(r.atualizado_em)}`} />
                ))}
              </Select>
            ) : (
              <InlineNotification kind="info" lowContrast hideCloseButton title="Nenhum relatório gerado ainda."
                subtitle="Peça um relatório no chat e depois insira o item." />
            )}
            <Select id="inserir-destino" labelText="Onde entra" value={destino} onChange={e => setDestino(e.target.value)}
              className="chat-inserir__destino">
              {DESTINOS[tipo].map(d => <SelectItem key={d} value={d} text={d} />)}
            </Select>
            <p className="chat-inserir__dica">
              Entra com a fonte (o modelo estatístico, ou o veículo, a data e o link da notícia) numa versão nova do
              relatório.
            </p>
          </>
        )}
      </Modal>
    </>
  )
}

export default InserirNoRelatorio
