import { useEffect, useState } from 'react'
import { Button, InlineLoading, InlineNotification, Link, Modal } from '@carbon/react'
import { Renew } from '@carbon/icons-react'
import { confirmarAtuacao, verAtuacao } from '../../services/coletaApi'
import { avisarEmissoresAtualizados, perfilParaEnvio, propostaDe, propostaValida, usePesquisaAtuacao } from './atuacao'
import RevisaoAtuacao from './RevisaoAtuacao.jsx'
import './NovoEmissor.scss'

// Atuação de uma empresa já cadastrada: um resumo clicável que abre o perfil salvo completo (resumo, setor, listas,
// fontes, versão) para consultar e editar direto; salvar grava uma versão nova, com as fontes da anterior. A nova
// pesquisa é opcional, dentro do modal. Sem perfil, o clique abre a pesquisa.
const MAX_RESUMO = 180

function resumoCurto(atuacao) {
  const frase = atuacao?.resumo?.[0] || atuacao?.texto || ''
  const texto = `${atuacao?.setor ? `${atuacao.setor[0].toUpperCase()}${atuacao.setor.slice(1)} · ` : ''}${frase}`
  return texto.length > MAX_RESUMO ? `${texto.slice(0, MAX_RESUMO).trimEnd()}…` : texto
}

const data = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')

function AtuacaoEmissor({ emissor, podeEditar = true, onAtualizado }) {
  const [aberto, setAberto] = useState(false)
  const [salvo, setSalvo] = useState(null) // o perfil confirmado completo
  const [carregando, setCarregando] = useState(false)
  const [proposta, setProposta] = useState(propostaDe(null))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const pesquisa = usePesquisaAtuacao()
  const pesquisado = pesquisa.resultado?.perfil
  const emPesquisa = pesquisa.estado !== 'ocioso'

  useEffect(() => { if (pesquisado) setProposta(propostaDe(pesquisado)) }, [pesquisado])

  if (!emissor) return null
  const atuacao = emissor.atuacao

  function pesquisar() {
    setErro('')
    pesquisa.iniciar({ cnpj: (emissor.cnpj || '').replace(/\D/g, ''), razao_social: emissor.razao_social,
                       nome_curto: emissor.nome_curto || '', emissor: emissor.emissor })
  }

  async function abrir() {
    setAberto(true)
    setErro('')
    setSalvo(null)
    setProposta(propostaDe(null))
    pesquisa.limpar()
    if (!atuacao) {
      pesquisar()
      return
    }
    setCarregando(true)
    try {
      const p = await verAtuacao(emissor.emissor)
      setSalvo(p)
      setProposta(propostaDe(p))
    } catch (e) {
      setErro(e.message || 'Não foi possível abrir a atuação.')
    } finally {
      setCarregando(false)
    }
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
      const base = emPesquisa ? pesquisado : salvo
      await confirmarAtuacao(emissor.emissor, perfilParaEnvio(proposta, base),
        emPesquisa ? pesquisa.resultado?.pesquisa_id : null)
      fechar()
      onAtualizado?.()
      avisarEmissoresAtualizados()
    } catch (e) {
      setErro(e.message || 'Não foi possível gravar a atuação.')
    } finally {
      setSalvando(false)
    }
  }

  // No modal: a pesquisa nova, quando pedida; senão o perfil salvo, como uma revisão já pronta.
  const estadoRevisao = emPesquisa ? pesquisa.estado : 'pronta'
  const resultadoRevisao = emPesquisa ? pesquisa.resultado : { perfil: salvo }
  return (
    <div className="atuacao-emissor">
      <p className="cds--label">Atuação</p>
      {atuacao ? (
        <>
          <Link href="#" className="atuacao-emissor__texto" title="Ver e editar a atuação"
            onClick={e => { e.preventDefault(); abrir() }}>
            {resumoCurto(atuacao)}
          </Link>
          <p className="atuacao-emissor__meta">
            Versão {atuacao.versao} · confirmada por {atuacao.confirmado_por}{atuacao.confirmado_em ? ` em ${data(atuacao.confirmado_em)}` : ''}
          </p>
        </>
      ) : (
        <p className="atuacao-emissor__texto">
          Sem atuação confirmada: os agentes ainda não têm o contexto do ramo.{' '}
          {podeEditar && (
            <Link href="#" onClick={e => { e.preventDefault(); abrir() }}>Pesquisar atuação</Link>
          )}
        </p>
      )}
      <Modal open={aberto} modalHeading={`Atuação: ${emissor.nome_curto || emissor.razao_social}`}
        passiveModal={!podeEditar}
        primaryButtonText={salvando ? 'Gravando…' : (atuacao ? 'Salvar alterações' : 'Confirmar atuação')}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={salvando || carregando || pesquisa.estado === 'pesquisando' || !propostaValida(proposta)}
        onRequestSubmit={salvar} onRequestClose={fechar} size="md" className="novo-emissor">
        <p className="novo-emissor__ajuda">
          <strong>{emissor.razao_social}</strong> · CNPJ {emissor.cnpj}.
          {salvo && !emPesquisa && ` Versão ${salvo.versao}, confirmada por ${salvo.confirmado_por} em ${data(salvo.confirmado_em)}`
            + `${salvo.editado ? ' (editada)' : ''}.`}
          {' '}A atuação é o contexto que os agentes usam sempre que falam desta empresa.
        </p>
        {carregando && <InlineLoading description="Abrindo a atuação salva…" />}
        {!carregando && (salvo || emPesquisa) && (
          <RevisaoAtuacao estado={estadoRevisao} resultado={resultadoRevisao} erro={pesquisa.erro}
            proposta={proposta} onChange={setProposta} />
        )}
        {podeEditar && !carregando && pesquisa.estado !== 'pesquisando' && (
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={pesquisar}>
            {emPesquisa ? 'Pesquisar de novo' : 'Pesquisar de novo na web (substitui a proposta)'}
          </Button>
        )}
        {erro && <InlineNotification kind="error" lowContrast hideCloseButton title="Não gravado." subtitle={erro} />}
      </Modal>
    </div>
  )
}

export default AtuacaoEmissor
