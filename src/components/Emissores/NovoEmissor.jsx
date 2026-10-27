import { useEffect, useState } from 'react'
import { ActionableNotification, Button, InlineLoading, InlineNotification, Modal, TextInput } from '@carbon/react'
import { Add, Renew } from '@carbon/icons-react'
import { criarEmissor, sugestaoEmissor } from '../../services/coletaApi'
import { cnpjValido, digitos, formatarCnpj } from './cnpj'
import { perfilParaEnvio, propostaDe, propostaValida, usePesquisaAtuacao } from './atuacao'
import RevisaoAtuacao from './RevisaoAtuacao.jsx'
import './NovoEmissor.scss'

// Novo emissor: o botão que fica ao lado de toda lista de emissores (Coleta automática e manual, Fontes, painel do
// chat, Documentos). O cadastro é um só, na coleta-api, e o emissor aparece em todas as telas.
//
// Dois passos (27/10/2026): os dados da empresa e, antes de gravar, a confirmação, com a atuação pesquisada (CVM, B3
// e site oficial, cada frase com fonte). A pessoa confere, corrige o setor ou o resumo e só então cadastra; a
// atuação confirmada fica no cadastro e é o contexto que todo agente usa ao falar da empresa.

// "Motiva Infraestrutura de Mobilidade S.A." -> "Motiva": a primeira palavra que não é forma societária.
const NAO_NOME = /^(cia|companhia|concessionaria|concessionária|s\.?a\.?|ltda|de|da|do|das|dos|e)$/i
const sugerirNomeCurto = razao => (razao || '').split(/\s+/).find(p => p && !NAO_NOME.test(p)) || ''

const VAZIO = { cnpj: '', razao_social: '', nome_curto: '', ticker: '', nomes: '' }

// Opção "+ Novo emissor…" dos seletores de emissor (Coleta automática e manual): escolhida, abre este cadastro.
export const OPCAO_NOVO_EMISSOR = '__novo_emissor__'
const PROPOSTA_VAZIA = propostaDe(null)

// `aberto`/`onFechar`: aberto de fora (pela opção do seletor), sem o botão. Sem eles, o botão "Novo emissor".
function NovoEmissor({ onCriado, aviso = false, aberto: abertoDeFora, onFechar }) {
  const controlado = abertoDeFora !== undefined
  const [abertoAqui, setAberto] = useState(false)
  const aberto = controlado ? abertoDeFora : abertoAqui
  const [passo, setPasso] = useState('dados') // dados | confirmar
  const [campos, setCampos] = useState(VAZIO)
  const [cvm, setCvm] = useState(null) // {codigo_cvm, situacao} da sugestão
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [existente, setExistente] = useState(null)
  const [criado, setCriado] = useState(null)
  const [ultimoConsultado, setUltimoConsultado] = useState('')
  const [proposta, setProposta] = useState(PROPOSTA_VAZIA)
  const pesquisa = usePesquisaAtuacao()

  const mudar = (campo, valor) => setCampos(c => ({ ...c, [campo]: valor }))

  function fechar() {
    setAberto(false)
    onFechar?.()
    setPasso('dados')
    setCampos(VAZIO)
    setCvm(null)
    setErro('')
    setExistente(null)
    setUltimoConsultado('')
    setProposta(PROPOSTA_VAZIA)
    pesquisa.limpar()
  }

  // Ao completar o CNPJ (ou sair do campo), a sugestão da CVM: preenche a razão social se estiver vazia.
  async function consultarCnpj(valor) {
    const d = digitos(valor)
    if (d.length !== 14 || d === ultimoConsultado || !cnpjValido(d)) return
    setUltimoConsultado(d)
    setBuscando(true)
    try {
      const s = await sugestaoEmissor(d)
      setCvm(s)
      if (s?.razao_social) {
        setCampos(c => ({
          ...c,
          razao_social: c.razao_social || s.razao_social,
          nome_curto: c.nome_curto || sugerirNomeCurto(s.razao_social),
        }))
      }
    } catch {
      setCvm(null) // sem sugestão o cadastro segue à mão
    } finally {
      setBuscando(false)
    }
  }

  const cnpjOk = cnpjValido(campos.cnpj)
  const cnpjInvalido = digitos(campos.cnpj).length === 14 && !cnpjOk
  const pronto = cnpjOk && campos.razao_social.trim() && campos.nome_curto.trim()
  const nomes = () => campos.nomes.split(',').map(n => n.trim()).filter(Boolean)

  // Passo 1 -> 2: pesquisa a atuação e abre a confirmação; a proposta é preenchida quando a pesquisa termina.
  async function pesquisar() {
    if (!pronto) return
    setPasso('confirmar')
    setErro('')
    setExistente(null)
    setProposta(PROPOSTA_VAZIA)
    await pesquisa.iniciar({
      cnpj: digitos(campos.cnpj), razao_social: campos.razao_social.trim(), nome_curto: campos.nome_curto.trim(),
      nomes: nomes(),
    })
  }
  // Quando a pesquisa termina, a proposta editável vem do perfil (uma vez por pesquisa).
  const perfil = pesquisa.resultado?.perfil
  useEffect(() => { if (perfil) setProposta(propostaDe(perfil)) }, [perfil])

  async function salvar(reativar = false) {
    if (!pronto || salvando || !propostaValida(proposta)) return
    setSalvando(true)
    setErro('')
    setExistente(null)
    try {
      const registro = await criarEmissor({
        cnpj: digitos(campos.cnpj),
        razao_social: campos.razao_social.trim(),
        nome_curto: campos.nome_curto.trim(),
        ticker: campos.ticker.trim() || undefined,
        nomes: nomes(),
        perfil: perfilParaEnvio(proposta, perfil),
        pesquisa_id: pesquisa.resultado?.pesquisa_id,
        ...(reativar ? { reativar: true } : {}),
      })
      fechar()
      setCriado(registro)
      onCriado?.(registro)
    } catch (e) {
      if (e.status === 409 && e.corpo?.existente) {
        setExistente(e.corpo.existente)
      } else {
        setErro(e.message || 'Não foi possível cadastrar o emissor.')
      }
    } finally {
      setSalvando(false)
    }
  }

  function usarExistente() {
    const e = existente
    fechar()
    onCriado?.(e)
  }

  const confirmar = passo === 'confirmar'
  return (
    <>
      {!controlado && (
        <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => { setCriado(null); setAberto(true) }}>
          Novo emissor
        </Button>
      )}
      {aviso && criado && (
        <InlineNotification kind="success" lowContrast className="novo-emissor__aviso"
          title={`${criado.razao_social || criado.nome_curto} ${criado.reativado ? 'reativado' : 'cadastrado'}.`}
          subtitle="Ele aparece aqui quando tiver documentos extraídos: rode a Coleta automática ou envie na Coleta manual."
          onCloseButtonClick={() => setCriado(null)} />
      )}
      <Modal
        open={aberto}
        modalHeading={confirmar ? `Confirmar cadastro: ${campos.nome_curto}` : 'Novo emissor'}
        primaryButtonText={confirmar ? (salvando ? 'Cadastrando…' : 'Confirmar cadastro') : 'Pesquisar atuação'}
        secondaryButtonText={confirmar ? 'Voltar' : 'Cancelar'}
        primaryButtonDisabled={confirmar
          ? salvando || pesquisa.estado === 'pesquisando' || !propostaValida(proposta)
          : !pronto}
        onRequestSubmit={() => (confirmar ? salvar() : pesquisar())}
        onSecondarySubmit={() => (confirmar ? (pesquisa.limpar(), setPasso('dados')) : fechar())}
        onRequestClose={fechar}
        size={confirmar ? 'md' : 'sm'}
        className="novo-emissor"
      >
        {!confirmar && (
          <>
            <p className="novo-emissor__ajuda">
              Com o CNPJ, a coleta da CVM já busca ITR, DFP, escrituras, relatórios do agente fiduciário e ratings. No
              próximo passo o sistema pesquisa a atuação da empresa para você confirmar antes de cadastrar.
            </p>
            <TextInput
              id="novo-emissor-cnpj"
              labelText="CNPJ"
              value={formatarCnpj(campos.cnpj)}
              onChange={e => {
                mudar('cnpj', e.target.value)
                if (digitos(e.target.value).length === 14) consultarCnpj(e.target.value)
              }}
              onBlur={e => consultarCnpj(e.target.value)}
              invalid={cnpjInvalido}
              invalidText="CNPJ inválido: confira os dígitos."
              placeholder="00.000.000/0000-00"
            />
            {buscando && <InlineLoading description="Consultando a CVM…" />}
            {!buscando && cvm && (
              <p className="novo-emissor__cvm">
                CVM: código {cvm.codigo_cvm ?? '—'}{cvm.situacao ? ` · ${cvm.situacao}` : ''}
              </p>
            )}
            {!buscando && cnpjOk && ultimoConsultado && !cvm && (
              <p className="novo-emissor__cvm">CNPJ sem cadastro de companhia aberta na CVM: preencha os dados à mão.</p>
            )}
            <TextInput id="novo-emissor-razao" labelText="Razão social" value={campos.razao_social}
              onChange={e => mudar('razao_social', e.target.value)}
              onBlur={() => { if (!campos.nome_curto.trim()) mudar('nome_curto', sugerirNomeCurto(campos.razao_social)) }} />
            <TextInput id="novo-emissor-nome" labelText="Nome curto" value={campos.nome_curto}
              helperText="Como a empresa aparece nas listas e no chat." onChange={e => mudar('nome_curto', e.target.value)} />
            <TextInput id="novo-emissor-ticker" labelText="Ticker (opcional)" value={campos.ticker}
              onChange={e => mudar('ticker', e.target.value.toUpperCase())} />
            <TextInput id="novo-emissor-nomes" labelText="Outros nomes e apelidos (opcional)" value={campos.nomes}
              helperText="Separados por vírgula: SPEs, nome antigo, apelidos usados no chat."
              onChange={e => mudar('nomes', e.target.value)} />
          </>
        )}
        {confirmar && (
          <>
            <p className="novo-emissor__ajuda">
              <strong>{campos.razao_social}</strong> · CNPJ {formatarCnpj(campos.cnpj)}
              {cvm?.codigo_cvm ? ` · CVM ${cvm.codigo_cvm}` : ''}. Confira a atuação: ela fica no cadastro e é o contexto
              que os agentes usam sempre que falam desta empresa (chat, relatório, monitoramento).
            </p>
            <RevisaoAtuacao estado={pesquisa.estado} resultado={pesquisa.resultado} erro={pesquisa.erro}
              proposta={proposta} onChange={setProposta} />
            {pesquisa.estado !== 'pesquisando' && (
              <Button kind="ghost" size="sm" renderIcon={Renew} onClick={pesquisar}>Pesquisar de novo</Button>
            )}
          </>
        )}
        {/* Aviso com botão: ActionableNotification. O InlineNotification não aceita botão no texto e derruba a tela. */}
        {existente?.removido && (
          <ActionableNotification inline kind="warning" lowContrast hideCloseButton hasFocus={false}
            title="CNPJ de um emissor removido."
            subtitle={`${existente.razao_social || existente.emissor} foi removido. Reativar traz o emissor de volta às `
              + 'listas, com a mesma pasta e os documentos que já tinha.'}
            actionButtonLabel="Reativar" onActionButtonClick={() => salvar(true)} />
        )}
        {existente && !existente.removido && (
          <ActionableNotification inline kind="warning" lowContrast hideCloseButton hasFocus={false}
            title="CNPJ já cadastrado." subtitle={`Já cadastrado como ${existente.razao_social || existente.emissor}.`}
            actionButtonLabel="Selecionar o existente" onActionButtonClick={usarExistente} />
        )}
        {erro && <InlineNotification kind="error" lowContrast hideCloseButton title="Não cadastrado." subtitle={erro} />}
      </Modal>
    </>
  )
}

export default NovoEmissor
