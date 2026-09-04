import type { TrackDictionary } from '../i18n-types';

const es: TrackDictionary = {
  headerTagline: 'rastreo',
  landing: {
    title: 'Rastrea tu paquete',
    description: 'Ingresa el número de seguimiento que recibiste para ver su estado actual y el historial de entrega.',
    placeholder: 'ej. RYZ-7K4Q-9MXP',
    submit: 'Rastrear'
  },
  result: {
    backLink: 'Rastrear otro paquete',
    estimatedDelivery: 'Entrega estimada',
    deliveryHistory: 'Historial de entrega',
    notFoundTitle: 'No se encontró el paquete',
    notFoundBody: 'No pudimos encontrar un paquete con ese número de seguimiento. Verifícalo e intenta de nuevo.'
  },
  status: {
    pending: 'Pendiente',
    received: 'Recibido en almacén',
    in_transit: 'En tránsito',
    out_for_delivery: 'En reparto',
    delivered: 'Entregado',
    delayed: 'Retrasado',
    exception: 'Incidencia',
    cancelled: 'Cancelado'
  }
};

export default es;