import type { TrackDictionary } from '../i18n-types';

const en: TrackDictionary = {
  headerTagline: 'track',
  landing: {
    title: 'Track your package',
    description: 'Enter the tracking number you were given to see its current status and delivery history.',
    placeholder: 'e.g. RYZ-7K4Q-9MXP',
    submit: 'Track'
  },
  result: {
    backLink: 'Track another package',
    estimatedDelivery: 'Estimated delivery',
    deliveryHistory: 'Delivery history',
    notFoundTitle: 'No package found',
    notFoundBody: "We couldn't find a package with that tracking number. Double-check it and try again."
  },
  status: {
    pending: 'Pending',
    received: 'Received at facility',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    delayed: 'Delayed',
    exception: 'Exception',
    cancelled: 'Cancelled'
  }
};

export default en;