import { InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea } from '@carbon/react'
import { SETORES } from './atuacao'

// Revisão da atuação pesquisada, antes de gravar no cadastro: a pessoa confere o resumo com as fontes, escolhe ou
// corrige o setor e edita o que não proceder. Sem fonte encontrada, escreve à mão (nada é preenchido de memória).
const CONFIANCA = {
  alta: ['green', 'Confiança alta', 'B3 com o CNPJ conferido e site oficial da empresa.'],
  media: ['cyan', 'Confiança média', 'Uma fonte oficial (CVM, B3 ou site da empresa).'],
  baixa: ['warm-gray', 'Confiança baixa', 'Só fontes de terceiros: confira com atenção.'],
}

function RevisaoAtuacao({ estado, resultado, erro, proposta, onChange }) {
  const perfil = resultado?.perfil
  const mudar = (campo, valor) => onChange({ ...proposta, [campo]: valor })

  if (estado === 'pesquisando') {
    return <InlineLoading description="Pesquisando a atuação na CVM, na B3 e no site oficial da empresa…" />
  }
  const confianca = CONFIANCA[perfil?.confianca]
  return (
    <div className="atuacao-revisao">
      {estado === 'erro' && (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Pesquisa indisponível."
          subtitle={`${erro} Você pode escrever a atuação à mão ou pesquisar de novo.`} />
      )}
      {estado === 'sem_evidencia' && (
        <InlineNotification kind="warning" lowContrast hideCloseButton title="Sem fontes suficientes."
          subtitle={`${resultado?.motivo || 'Nada foi encontrado.'} Escreva a atuação à mão ou pesquise de novo.`} />
      )}
      {confianca && (
        <p className="atuacao-revisao__oficial"><Tag type={confianca[0]} size="sm">{confianca[1]}</Tag> {confianca[2]}</p>
      )}
      {perfil?.atividade_b3 && (
        <p className="atuacao-revisao__oficial">
          <strong>Atividade na B3:</strong> {perfil.atividade_b3}
          {perfil.classificacao_b3 ? ` (${perfil.classificacao_b3})` : ''}
        </p>
      )}
      {perfil?.setor_cvm && <p className="atuacao-revisao__oficial"><strong>Setor na CVM:</strong> {perfil.setor_cvm}</p>}
      <Select id="atuacao-setor" labelText="Setor de atuação" value={proposta.setor}
        invalid={!proposta.setor} invalidText="Escolha o setor."
        helperText={perfil?.setor ? `Sugerido pela ${perfil.setor_origem || 'regra'}; corrija se não proceder.` : undefined}
        onChange={e => mudar('setor', e.target.value)}>
        <SelectItem value="" text="Escolha…" />
        {SETORES.map(s => <SelectItem key={s} value={s} text={s} />)}
      </Select>
      <TextArea id="atuacao-resumo" labelText="Resumo da atuação (uma frase por linha)" rows={4} value={proposta.resumo}
        invalid={!proposta.resumo.trim()} invalidText="O resumo não pode ficar vazio."
        onChange={e => mudar('resumo', e.target.value)} />
      <TextArea id="atuacao-segmentos" labelText="Segmentos (um por linha)" rows={2} value={proposta.segmentos}
        onChange={e => mudar('segmentos', e.target.value)} />
      <TextArea id="atuacao-ativos" labelText="Principais ativos e operações (um por linha)" rows={2}
        value={proposta.principais_ativos} onChange={e => mudar('principais_ativos', e.target.value)} />
      <TextArea id="atuacao-regioes" labelText="Onde atua (um por linha)" rows={2} value={proposta.regioes}
        onChange={e => mudar('regioes', e.target.value)} />
      {perfil?.divergencias && (
        <InlineNotification kind="info" lowContrast hideCloseButton title="Divergência entre fontes."
          subtitle={perfil.divergencias} />
      )}
      {perfil?.fontes?.length > 0 && (
        <div className="atuacao-revisao__fontes">
          <p className="cds--label">Fontes</p>
          <ol>
            {perfil.fontes.map(f => (
              <li key={f.id}>
                {/* rel noopener noreferrer: a página externa não controla esta aba */}
                <a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo}</a>
                {f.oficial ? ' · oficial' : ''}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

export default RevisaoAtuacao
