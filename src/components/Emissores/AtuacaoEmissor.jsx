import { useEffect, useState } from 'react'
import { Button, InlineNotification, Modal } from '@carbon/react'
import { Search } from '@carbon/icons-react'
import { confirmarAtuacao } from '../../services/coletaApi'
import { perfilParaEnvio, propostaDe, propostaValida, usePesquisaAtuacao } from './atuacao'
import RevisaoAtuacao from './RevisaoAtuacao.jsx'
import './NovoEmissor.scss'

// Atuação de uma empresa já cadastrada (Ecorodovias, Motiva e as cadastradas pela tela): mostra a confirmada e deixa
// pesquisar ou atualizar, com o mesmo modal de confirmação do cadastro. A versão anterior fica no histórico.
function AtuacaoEmissor({ emissor, podeEditar = true, onAtualizado }) {
  const [aberto, setAberto] = useState(false)
  const [proposta, setProposta] = useState(propostaDe(null))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const pesquisa = usePesquisaAtuacao()
  const perfil = pesquisa.resultado?.perfil

  useEffect(() => { if (perfil) setProposta(propostaDe(perfil)) }, [perfil])

  if (!emissor) return null
  const atuacao = emissor.atuacao

  function abrir() {
    setAberto(true)
    setErro('')
    setProposta(propostaDe(null))
    pesquisa.iniciar({ cnpj: (emissor.cnpj || '').replace(/\D/g, ''), razao_social: emissor.razao_social,
                       nome_curto: emissor.nome_curto || '', emissor: emissor.emissor })
  }

  function fechar() {
    setAberto(false)
    pesquisa.limpar()
  }

  async function salvar() {
    if (!propostaValida(proposta) || salvando) return
    setSalvando(true)
    setErro('')
    try {
      await confirmarAtuacao(emissor.emissor, perfilParaEnvio(proposta, perfil), pesquisa.resultado?.pesquisa_id)
      fechar()
      onAtualizado?.()
    } catch (e) {
      setErro(e.message || 'Não foi possível gravar a atuação.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="atuacao-emissor">
      <p className="cds--label">Atuação</p>
      {atuacao ? (
        <p className="atuacao-emissor__texto">
          {atuacao.texto}
          <span className="atuacao-emissor__meta"> Confirmada por {atuacao.confirmado_por} (versão {atuacao.versao}).</span>
        </p>
      ) : (
        <p className="atuacao-emissor__texto">Sem atuação confirmada: os agentes ainda não têm o contexto do ramo.</p>
      )}
      {podeEditar && (
        <Button kind="ghost" size="sm" renderIcon={Search} onClick={abrir}>
          {atuacao ? 'Atualizar atuação' : 'Pesquisar atuação'}
        </Button>
      )}
      <Modal open={aberto} modalHeading={`Confirmar atuação: ${emissor.nome_curto || emissor.razao_social}`}
        primaryButtonText={salvando ? 'Gravando…' : 'Confirmar atuação'} secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvando || pesquisa.estado === 'pesquisando' || !propostaValida(proposta)}
        onRequestSubmit={salvar} onRequestClose={fechar} size="md" className="novo-emissor">
        <p className="novo-emissor__ajuda">
          <strong>{emissor.razao_social}</strong> · CNPJ {emissor.cnpj}. Confira antes de gravar: a atuação é o contexto
          que os agentes usam sempre que falam desta empresa.
        </p>
        <RevisaoAtuacao estado={pesquisa.estado} resultado={pesquisa.resultado} erro={pesquisa.erro}
          proposta={proposta} onChange={setProposta} />
        {erro && <InlineNotification kind="error" lowContrast hideCloseButton title="Não gravado." subtitle={erro} />}
      </Modal>
    </div>
  )
}

export default AtuacaoEmissor
