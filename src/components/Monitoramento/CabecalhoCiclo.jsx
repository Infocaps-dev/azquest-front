import { Tag } from '@carbon/react'
import { nivelDe } from './niveis'

// Cabeçalho do ciclo, item 1 da seção 11: emissor, evento, início, tempo
// decorrido, prazo e status geral.

function decorrido(inicio) {
  if (!inicio) return '—'
  const minutos = Math.round((Date.now() - new Date(inicio).getTime()) / 60000)
  if (!Number.isFinite(minutos)) return '—'
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)}h ${minutos % 60}min`
}

function CabecalhoCiclo({ execucao, comparacao, conectado, simulado }) {
  if (!execucao) return null
  const nivel = comparacao ? nivelDe(comparacao.nivel_maximo) : null

  return (
    <header className="mon-cabecalho">
      <div className="mon-cabecalho__identificacao">
        <h2 className="mon-cabecalho__titulo">
          {execucao.emissor}: {execucao.evento || `Resultado ${execucao.periodo}`}
        </h2>
        <p className="mon-cabecalho__meta">
          Início {execucao.inicio ? new Date(execucao.inicio).toLocaleString('pt-BR') : '—'},
          decorrido {decorrido(execucao.inicio)}, prazo {execucao.prazo || 'D+1 útil'}
        </p>
      </div>

      <div className="mon-cabecalho__estado">
        {nivel && <Tag type={nivel.tag} size="md">{nivel.rotulo}</Tag>}
        <span className={`mon-cabecalho__conexao${conectado ? ' mon-cabecalho__conexao--ativa' : ''}`}>
          {simulado ? 'Modo simulado' : conectado ? 'Ao vivo' : 'Sem conexão'}
        </span>
      </div>
    </header>
  )
}

export default CabecalhoCiclo
