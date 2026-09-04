import type { TrackDictionary } from '../i18n-types';

const pt: TrackDictionary = {
  headerTagline: 'rastreio',
  landing: {
    title: 'Rastreie seu pacote',
    description: 'Digite o número de rastreio que você recebeu para ver o status atual e o histórico de entrega.',
    placeholder: 'ex. RYZ-7K4Q-9MXP',
    submit: 'Rastrear'
  },
  result: {
    backLink: 'Rastrear outro pacote',
    estimatedDelivery: 'Entrega estimada',
    deliveryHistory: 'Histórico de entrega',
    notFoundTitle: 'Pacote não encontrado',
    notFoundBody: 'Não encontramos nenhum pacote com esse número de rastreio. Confira e tente novamente.'
  },
  status: {
    pending: 'Pendente',
    received: 'Recebido no centro de distribuição',
    in_transit: 'Em trânsito',
    out_for_delivery: 'Saiu para entrega',
    delivered: 'Entregue',
    delayed: 'Atrasado',
    exception: 'Ocorrência',
    cancelled: 'Cancelado'
  }
};

export default pt;