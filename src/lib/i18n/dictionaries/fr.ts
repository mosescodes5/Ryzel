import type { TrackDictionary } from '../i18n-types';

const fr: TrackDictionary = {
  headerTagline: 'suivi',
  landing: {
    title: 'Suivez votre colis',
    description: 'Entrez le numéro de suivi qui vous a été communiqué pour voir son statut actuel et son historique de livraison.',
    placeholder: 'ex. RYZ-7K4Q-9MXP',
    submit: 'Suivre'
  },
  result: {
    backLink: 'Suivre un autre colis',
    estimatedDelivery: 'Livraison estimée',
    deliveryHistory: 'Historique de livraison',
    notFoundTitle: 'Aucun colis trouvé',
    notFoundBody: "Nous n'avons trouvé aucun colis avec ce numéro de suivi. Vérifiez-le et réessayez."
  },
  status: {
    pending: 'En attente',
    received: 'Reçu à l\'entrepôt',
    in_transit: 'En transit',
    out_for_delivery: 'En cours de livraison',
    delivered: 'Livré',
    delayed: 'Retardé',
    exception: 'Incident',
    cancelled: 'Annulé'
  }
};

export default fr;