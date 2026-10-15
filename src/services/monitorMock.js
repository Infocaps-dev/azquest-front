// Ciclo 2T26 simulado, para demonstrar a aba Monitoramento sem backend.
//
// Os valores não são inventados: saem do caso de referência da seção 8 do
// Handoff_Monitoramento_1.5_Bob.md e são os mesmos que a monitor-api devolve
// quando roda contra os documentos reais. Cada número traz documento e página,
// porque a tela precisa mostrar a fonte clicável mesmo em modo simulado.

const ETAPAS = [
  ['B1', 'Captura e Classificação', 'Captura: 3 documentos recebidos (ITR, RR e AR 2T26)', [
    { documento: 'ITR-2T26-ECORODOVIAS.pdf', pagina: 1 },
  ]],
  ['B2', 'Captura e Classificação', 'Classificação: emissor Ecorodovias, período 2T26, tese vigente de mar/2026', []],
  ['B3', 'Comparação', 'Comparação: alavancagem 4,1x contra 3,87x do baseline, variação +0,23x', [
    { documento: 'ITR-2T26-ECORODOVIAS.pdf', pagina: 26 },
  ]],
  ['B4', 'Comparação', 'Materialidade: nível máximo Relevante pela distância de 0,4x ao gatilho da Fitch', [
    { documento: 'Relatório de Crédito - Ecorodovias - 2026-03.docx', pagina: 26 },
  ]],
  ['B5', 'Alerta e Resumo', '8 itens informativos registrados no histórico', []],
  ['B6', 'Análise de Impacto', 'Análise redigida, aguardando aprovação do analista', []],
  ['B7', 'Análise de Impacto', 'Revisão extraordinária não sugerida: apenas 1 item Relevante', []],
  ['B8', 'Alerta e Resumo', 'Alerta enviado à Gestão com a recomendação de monitorar a alavancagem', []],
]

// Em modo simulado o ciclo avança por tempo, para a tela mostrar o processo
// andando. `ate` é quantas etapas já concluíram.
export function etapasSimuladas(ate) {
  return ETAPAS.map(([etapa, agente, mensagem, fontes], i) => ({
    etapa,
    agente,
    mensagem,
    fontes,
    ordem: i,
    status:
      i < ate ? 'concluido'
        : i === ate ? (etapa === 'B6' ? 'aguardando_aprovacao' : 'em_execucao')
          : 'pendente',
    inicio: i <= ate ? new Date(Date.now() - (ate - i) * 45000).toISOString() : null,
    fim: i < ate ? new Date(Date.now() - (ate - i - 1) * 45000).toISOString() : null,
  }))
}

export const TOTAL_ETAPAS = ETAPAS.length

const fonte = (documento, pagina) => ({ documento, pagina })

export const CICLO_SIMULADO = {
  execucao: {
    id: 'exec-ecorodovias-2T26',
    emissor: 'Ecorodovias',
    periodo: '2T26',
    evento: 'Resultado 2T26',
    status: 'em_execucao',
    inicio: new Date(Date.now() - 6 * 60000).toISOString(),
    fim: null,
    prazo: 'D+1 útil',
  },

  baseline: {
    emissor: 'Ecorodovias',
    versao: 'v0',
    data_base: '2025-12-31',
  },

  comparacao: {
    id: 1,
    ciclo: 'Ecorodovias-2T26',
    emissor: 'Ecorodovias',
    periodo: '2T26',
    nivel_maximo: 'relevante',
    contagem_por_nivel: { relevante: 1, atencao: 5, informativo: 8 },
    roteamento: { destino: 'B6', destaque_no_resumo: true },
    revisao_extraordinaria: { sugerir: false, motivos: [], decisao_final: 'analista' },
    linhas: [
      {
        metrica: 'dl_ebitda_consolidado', descricao: 'Alavancagem consolidada contra o baseline',
        unidade: 'x', realizado: 4.1, baseline: 3.87, variacao: 0.23,
        regra: 'variacao_alavancagem', nivel: 'atencao',
        justificativa: 'Aumento entre 0,2x e 0,3x',
        fontes: [fonte('ITR-2T26-ECORODOVIAS.pdf', 26)],
      },
      {
        metrica: 'gatilho_fitch_downgrade', descricao: 'Distância ao gatilho de downgrade da Fitch',
        unidade: 'x', realizado: 4.1, baseline: 4.5, variacao: null,
        regra: 'distancia_gatilho_rating', nivel: 'relevante',
        justificativa: 'Distância menor que 0,5x do gatilho',
        detalhes: {
          distancia: 0.4,
          ressalva: 'Fonte primária ausente: o relatório da Fitch disponível é da Ecovias Ponte, não do consolidado.',
        },
        fontes: [fonte('Relatório de Crédito - Ecorodovias - 2026-03.docx', 26)],
      },
      {
        metrica: 'dl_ebitda_consolidado_projecao', descricao: 'Alavancagem contra a projeção de 2026',
        unidade: 'x', realizado: 4.1, projecao: 4.55, variacao: -0.45,
        regra: 'desvio_projecao_alavancagem', nivel: 'informativo',
        justificativa: 'Realizado abaixo da projeção do analista',
        fontes: [fonte('Relatório de Crédito - Ecorodovias - 2026-03.docx', 29)],
      },
      {
        metrica: 'covenant_ecs_dl_ebitda', descricao: 'Covenant da holding ECS, apurado anual',
        unidade: 'x', realizado: 3.58, baseline: 4.75,
        regra: 'folga_covenant', nivel: 'informativo',
        justificativa: 'Folga de 1,17x',
        detalhes: { folga: 1.17 },
        fontes: [fonte('ERDVB3 - Escritura.pdf', 43), fonte('ERDVA6 - Relatório do Agente Fiduciário - 2025.pdf', 4)],
      },
      {
        metrica: 'covenant_ecs_dl_ebitda_proxy', descricao: 'Covenant da holding ECS, indicador antecedente',
        unidade: 'x', realizado: 4.1, baseline: 4.75,
        regra: 'folga_covenant', nivel: 'atencao',
        justificativa: 'Folga entre 0,3x e 1,0x',
        detalhes: {
          folga: 0.65,
          ressalva: 'Covenant de apuração anual. A alavancagem trimestral entra como indicador antecedente da folga, não como apuração formal.',
        },
        fontes: [fonte('ERDVB3 - Escritura.pdf', 43), fonte('ITR-2T26-ECORODOVIAS.pdf', 26)],
      },
      {
        metrica: 'covenant_minas_gerais_dl_ebitda', descricao: 'Covenant Ecovias Minas Goiás',
        unidade: 'x', realizado: 3.81, baseline: 4.75,
        regra: 'folga_covenant', nivel: 'atencao',
        justificativa: 'Folga entre 0,3x e 1,0x',
        detalhes: { folga: 0.94 },
        fontes: [fonte('ITR-2T26-ECORODOVIAS.pdf', 45)],
      },
      {
        metrica: 'covenant_minas_gerais_icsd', descricao: 'ICSD Ecovias Minas Goiás',
        unidade: 'índice', realizado: 2.07, baseline: 1.2,
        regra: 'folga_covenant', nivel: 'informativo',
        justificativa: 'Folga de 72% do limite',
        fontes: [fonte('ITR-2T26-ECORODOVIAS.pdf', 45)],
      },
      {
        metrica: 'ebitda_ajustado', descricao: 'EBITDA ajustado contra o 2T25',
        unidade: 'R$ mi', realizado: 1348.4, ano_anterior: 1363.2, variacao: -1.09,
        regra: 'variacao_ebitda_receita', nivel: 'informativo',
        justificativa: 'Queda abaixo do limite de 3%',
        fontes: [fonte('ITR-2T26-ECORODOVIAS.pdf', 24), fonte('Balanço, DRE e Fluxo de Caixa - 2026-06.xlsx', null)],
      },
      {
        metrica: 'margem_ebitda_ajustada', descricao: 'Margem EBITDA ajustada contra o 2T25',
        unidade: 'p.p.', realizado: 73.4, ano_anterior: 74.95, variacao: -1.55,
        regra: 'variacao_margem_ebitda', nivel: 'atencao',
        justificativa: 'Queda entre 1 e 2 p.p.',
        fontes: [fonte('RR-2T26-ECORODOVIAS.pdf', 2)],
      },
      {
        metrica: 'emissao_debentures', descricao: 'Emissão de debêntures, Ecovias Capixaba',
        unidade: '%', realizado: 8.32, baseline: 5,
        regra: 'evento_societario', nivel: 'atencao',
        justificativa: 'Emissão equivale a 8,3% da dívida bruta, acima do corte de 5%',
        fontes: [fonte('AR-2T26-ECORODOVIAS.pdf', 3), fonte('ITR-2T26-ECORODOVIAS.pdf', 26)],
      },
      {
        metrica: 'contrato_concessao', descricao: 'Assinatura do Contrato de Concessão, Ecovias das Gerais',
        unidade: '', realizado: null,
        regra: 'evento_societario', nivel: 'informativo',
        justificativa: 'Rebaixado de atencao para informativo: evento previsto na premissa ecovias_das_gerais',
        detalhes: { rebaixado_por_premissa: 'ecovias_das_gerais' },
        fontes: [fonte('AR-2T26-ECORODOVIAS.pdf', 3), fonte('Relatório de Crédito - Ecorodovias - 2026-03.docx', 29)],
      },
    ],
    alertas_extracao: [],
  },

  alertas: [
    {
      id: 1,
      comparacao_id: 1,
      emissor: 'Ecorodovias',
      periodo: '2T26',
      nivel: 'relevante',
      status_revisao: 'pendente',
      recomendacao:
        'Monitorar a trajetória de alavancagem: a projeção do analista (4,55x em 2026E) cruza o gatilho de downgrade da Fitch (4,5x).',
      texto:
        'A alavancagem consolidada encerrou junho de 2026 em 4,1x, 0,23x acima do baseline de 3,87x da tese vigente ' +
        '(ITR-2T26-ECORODOVIAS.pdf, p. 26). A distância ao gatilho de downgrade da Fitch, de 4,5x, caiu para 0,4x, ' +
        'o que aciona a regra de materialidade e classifica o item como Relevante. ' +
        'O covenant da holding permanece atendido, com apurado de 3,58x contra limite de 4,75x ' +
        '(ERDVA6 - Relatório do Agente Fiduciário - 2025.pdf, p. 4); pelo indicador antecedente trimestral, ' +
        'a folga cai para 0,65x. O EBITDA ajustado de R$ 1.348,4 milhões recuou 1,1% contra o 2T25, ' +
        'e a margem cedeu 1,5 p.p., para 73,4% (RR-2T26-ECORODOVIAS.pdf, p. 2). ' +
        'A emissão de R$ 2,4 bilhões da Ecovias Capixaba equivale a 8,3% da dívida bruta ' +
        '(AR-2T26-ECORODOVIAS.pdf, p. 3). Não há evento novo de compliance.',
    },
  ],

  historico: [
    { periodo: '1T26', alavancagem: 3.9, nivel: 'informativo', decisao: 'aprovado' },
    { periodo: '2T26', alavancagem: 4.1, nivel: 'relevante', decisao: 'pendente' },
  ],
}
