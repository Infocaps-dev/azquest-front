// Dados da amostra do piloto Rodovias (Ecorodovias), com fonte e data de cada número.
// Fase 0: carga manual a partir do Kit de Fontes. Fase 1: virá da camada Gold (baseline versionado).

export const EMISSOR = {
  nome: 'Ecorodovias Concessões e Serviços (ECS)',
  baseline: 'Relatório de Crédito AZ Quest, mar/2026',
}

// tipo 'max': o indicador deve ficar abaixo do limite. tipo 'min': gatilho de elevação.
export const COVENANTS = [
  {
    id: 'cov-consolidado',
    titulo: 'Alavancagem consolidada',
    regra: 'covenant até 4,75x',
    apurado: 4.1,
    limite: 4.75,
    tipo: 'max',
    referencia: 'jun/26, UDM',
    fonte: 'Release de resultados 2T26',
    nota: 'Indicativo: o covenant é apurado anualmente.',
  },
  {
    id: 'cov-erdva6',
    titulo: 'Covenant ERDVA6, 16ª emissão',
    regra: 'limite 4,75x',
    apurado: 3.58,
    limite: 4.75,
    tipo: 'max',
    referencia: 'dez/25',
    fonte: 'Relatório do agente fiduciário 2025 (Pentágono)',
    nota: 'Atendido.',
  },
  {
    id: 'cov-erdvb3',
    titulo: 'Covenant ERDVB3, 13ª emissão',
    regra: 'limite 4,75x',
    apurado: 3.51,
    limite: 4.75,
    tipo: 'max',
    referencia: 'dez/25',
    fonte: 'Relatório do agente fiduciário 2025 (Pentágono)',
    nota: 'Atendido.',
  },
]

export const GATILHOS = [
  {
    id: 'fitch-rebaixamento',
    titulo: 'Fitch, rebaixamento',
    regra: 'acima de 4,50x de forma consistente',
    apurado: 4.1,
    limite: 4.5,
    tipo: 'max',
    referencia: 'jun/26',
    fonte: 'Relatório de Crédito AZ Quest mar/2026, sensibilidade Fitch',
    nota: 'Alavancagem consolidada consistentemente acima de 4,5 vezes.',
  },
  {
    id: 'fitch-elevacao',
    titulo: 'Fitch, elevação',
    regra: 'próxima de 3,50x de forma consistente',
    apurado: 4.1,
    limite: 3.5,
    tipo: 'min',
    referencia: 'jun/26',
    fonte: 'Relatório de Crédito AZ Quest mar/2026, sensibilidade Fitch',
    nota: 'Alavancagem consolidada próxima a 3,5 vezes, de forma consistente.',
  },
]

export const ATIVOS = [
  { ticker: 'ECOR3', emissao: 'Ecorodovias Infraestrutura e Logística', condicoes: 'Ação da holding', rating: '' },
  { ticker: 'ERDVA6', emissao: 'ECS, 16ª emissão', condicoes: 'R$ 2,0 bi, venc. jul/2031', rating: 'brAAA (S&P)' },
  { ticker: 'ERDVB3', emissao: 'ECS, 13ª emissão', condicoes: 'R$ 1,0 bi, venc. out/2033', rating: 'brAAA (S&P)' },
  { ticker: 'ECPN11', emissao: 'Ecovias Ponte, 1ª emissão', condicoes: 'R$ 230 mi, IPCA + 4,4%, venc. 2034', rating: 'AA(bra) (Fitch)' },
  { ticker: '17ª ECS', emissao: 'ECS, 17ª emissão (proposta)', condicoes: 'Até R$ 1,03 bi, CDI + 0,95%, ago/2032', rating: 'brAAA (S&P)' },
]

export const FONTES_ATIVOS = 'S&P (20/08/2026), Fitch (13/08/2026) e relatórios do agente fiduciário 2025'
