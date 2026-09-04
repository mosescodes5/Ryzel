import type { TrackDictionary } from '../i18n-types';

const ar: TrackDictionary = {
  headerTagline: 'تتبع',
  landing: {
    title: 'تتبع شحنتك',
    description: 'أدخل رقم التتبع الذي حصلت عليه لمعرفة حالته الحالية وسجل التسليم.',
    placeholder: 'مثال: RYZ-7K4Q-9MXP',
    submit: 'تتبع'
  },
  result: {
    backLink: 'تتبع شحنة أخرى',
    estimatedDelivery: 'التسليم المتوقع',
    deliveryHistory: 'سجل التسليم',
    notFoundTitle: 'لم يتم العثور على الشحنة',
    notFoundBody: 'لم نتمكن من العثور على شحنة بهذا الرقم. تحقق منه وحاول مرة أخرى.'
  },
  status: {
    pending: 'قيد الانتظار',
    received: 'تم الاستلام في المستودع',
    in_transit: 'قيد النقل',
    out_for_delivery: 'قيد التسليم',
    delivered: 'تم التسليم',
    delayed: 'متأخر',
    exception: 'استثناء',
    cancelled: 'ملغى'
  }
};

export default ar;