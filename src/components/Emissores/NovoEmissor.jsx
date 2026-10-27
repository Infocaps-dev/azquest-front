import { useState } from 'react'
import { Button, InlineLoading, InlineNotification, Modal, TextInput } from '@carbon/react'
import { Add } from '@carbon/icons-react'
import { criarEmissor, sugestaoEmissor } from '../../services/coletaApi'
import { cnpjValido, digitos, formatarCnpj } from './cnpj'
import './NovoEmissor.scss'

// Novo emissor: o botão que fica ao lado de toda lista de emissores (Coleta automática e manual, Fontes, painel do
// chat, Documentos). Antes, cadastrar uma empresa exigia engenharia: arquivo de configuração, buckets, job do extrator
// e cópias do cadastro em cada serviço. Agora o cadastro é um só, na coleta-api, e o emissor aparece em todas as telas.
//
// Só três campos são obrigatórios. Com o CNPJ a coleta da CVM já acha ITR, DFP, escrituras, relatórios do agente
// fiduciário e ratings; a razão social vem sugerida do cadastro aberto da CVM quando é companhia aberta.

// "Motiva Infraestrutura de Mobilidade S.A." -> "Motiva": a primeira palavra que não é forma societária.
const NAO_NOME = /^(cia|companhia|concessionaria|concessionária|s\.?a\.?|ltda|de|da|do|das|dos|e)$/i
const sugerirNomeCurto = razao => (razao || '').split(/\s+/).find(p => p && !NAO_NOME.test(p)) || ''

const VAZIO = { cnpj: '', razao_social: '', nome_curto: '', ticker: '', nomes: '', setor: '' }

function NovoEmissor({ onCriado, aviso = false }) {
  const [aberto, setAberto] = useState(false)
  const [campos, setCampos] = useState(VAZIO)
  const [cvm, setCvm] = useState(null) // {codigo_cvm, situacao} da sugestão
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [existente, setExistente] = useState(null)
  const [criado, setCriado] = useState(null)
  const [ultimoConsultado, setUltimoConsultado] = useState('')

  const mudar = (campo, valor) => setCampos(c => ({ ...c, [campo]: valor }))

  function fechar() {
    setAberto(false)
    setCampos(VAZIO)
    setCvm(null)
    setErro('')
    setExistente(null)
    setUltimoConsultado('')
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

  async function salvar() {
    if (!pronto || salvando) return
    setSalvando(true)
    setErro('')
    setExistente(null)
    try {
      const registro = await criarEmissor({
        cnpj: digitos(campos.cnpj),
        razao_social: campos.razao_social.trim(),
        nome_curto: campos.nome_curto.trim(),
        ticker: campos.ticker.trim() || undefined,
        nomes: campos.nomes.split(',').map(n => n.trim()).filter(Boolean),
        setor: campos.setor.trim() || undefined,
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

  return (
    <>
      <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => { setCriado(null); setAberto(true) }}>
        Novo emissor
      </Button>
      {aviso && criado && (
        <InlineNotification kind="success" lowContrast className="novo-emissor__aviso"
          title={`${criado.razao_social || criado.nome_curto} cadastrado.`}
          subtitle="Ele aparece aqui quando tiver documentos extraídos: rode a Coleta automática ou envie na Coleta manual."
          onCloseButtonClick={() => setCriado(null)} />
      )}
      <Modal
        open={aberto}
        modalHeading="Novo emissor"
        primaryButtonText={salvando ? 'Cadastrando…' : 'Cadastrar'}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={!pronto || salvando}
        onRequestSubmit={salvar}
        onRequestClose={fechar}
        size="sm"
        className="novo-emissor"
      >
        <p className="novo-emissor__ajuda">
          Com o CNPJ, a coleta da CVM já busca ITR, DFP, escrituras, relatórios do agente fiduciário e ratings. O site
          de RI e o envio manual complementam o acervo.
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
        <TextInput id="novo-emissor-setor" labelText="Setor (opcional)" value={campos.setor}
          placeholder="rodovias, saneamento, energia…" onChange={e => mudar('setor', e.target.value)} />
        {existente && (
          <InlineNotification kind="warning" lowContrast hideCloseButton title="CNPJ já cadastrado."
            subtitle={
              <>
                Já cadastrado como {existente.razao_social || existente.emissor}.{' '}
                <Button kind="ghost" size="sm" onClick={usarExistente}>Selecionar o existente</Button>
              </>
            } />
        )}
        {erro && <InlineNotification kind="error" lowContrast hideCloseButton title="Não cadastrado." subtitle={erro} />}
      </Modal>
    </>
  )
}

export default NovoEmissor
