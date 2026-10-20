/*
 * Данные калькулятора сборных грузоперевозок.
 *
 * DEFAULT_DATA используется, когда нет доступа к удалённому прайсу.
 * Значения тарифов собраны из файла "Прайс.xlsx" (лист "Данные для копирования"),
 * который также опубликован на Яндекс.Диске:
 *   https://disk.yandex.ru/i/I4D17FNmUf7uqw
 *
 * При старте приложение пытается загрузить свежую версию этого файла с Яндекс.Диска
 * и пересобрать таблицу направлений. Если загрузка недоступна — работает офлайн
 * на этих данных, поэтому приложение можно установить и использовать без интернета.
 */
window.DEFAULT_DATA = {
  meta: {
    title: 'Калькулятор сборных грузоперевозок',
    version: '1.0.0',
    updated: '2026-10-10',
    currency: '₽',
    orderEmail: 'matalin@inbox.ru',
    // Куда слать заявку. Formspree endpoint (приём заявок и пересылка на orderEmail).
    orderEndpoint: 'https://formspree.io/f/xvkzrbjj',
    orderAccessKey: '',
    sourceName: 'Прайс.xlsx',
    sourceUrl: 'https://disk.yandex.ru/i/I4D17FNmUf7uqw'
  },

  settings: {
    volumetricDensity: 250,
    minCharge: 1500,
    onlineDiscountPercent: 12,
    defaultRatePerKg: 24,
    defaultDays: 3,
    tempExtraDays: 1,
    insuranceRatePercent: 0.5,
    insuranceMin: 349
  },

  cities: [
    'Москва',
    'Санкт-Петербург',
    'Екатеринбург',
    'Новосибирск',
    'Казань',
    'Нижний Новгород',
    'Ростов-на-Дону',
    'Самара',
    'Краснодар',
    'Владивосток',
    'Красноярск'
  ],

  cargoTypes: [
    { id: 'standard', name: 'Обычный груз', short: 'Стандарт', coef: 1, icon: '📦' },
    { id: 'oversize', name: 'Негабаритный груз', short: 'Негабарит', coef: 1.35, icon: '📐' },
    { id: 'temp', name: 'Температурный режим', short: 'Реф', coef: 1.5, icon: '❄️' }
  ],

  directions: [
    { from: 'Москва', to: 'Казань', ratePerKg: 20.7, days: 2 },
    { from: 'Санкт-Петербург', to: 'Нижний Новгород', ratePerKg: 13.8, days: 2 },
    { from: 'Екатеринбург', to: 'Ростов-на-Дону', ratePerKg: 27.0, days: 4 },
    { from: 'Новосибирск', to: 'Самара', ratePerKg: 28.0, days: 4 },
    { from: 'Красноярск', to: 'Владивосток', ratePerKg: 26.7, days: 7 },
    { from: 'Москва', to: 'Владивосток', ratePerKg: 22.4, days: 9 },
    { from: 'Санкт-Петербург', to: 'Москва', ratePerKg: 22.4, days: 1 },
    { from: 'Екатеринбург', to: 'Казань', ratePerKg: 12.4, days: 2 },
    { from: 'Новосибирск', to: 'Ростов-на-Дону', ratePerKg: 23.0, days: 5 },
    { from: 'Красноярск', to: 'Новосибирск', ratePerKg: 18.4, days: 2 }
  ],

  services: [
    { id: 'pickup', name: 'Забрать от двери отправителя', price: 2400, icon: '🏠', hint: 'Выезд машины и забор груза по адресу' },
    { id: 'delivery', name: 'Доставить до дверей получателя', price: 2800, icon: '🚚', hint: 'Адресная доставка до двери' },
    { id: 'packing', name: 'Изготовление упаковки', price: 2300, icon: '🧰', hint: 'Жёсткая упаковка и обрешётка' },
    { id: 'docs', name: 'Возврат документов', price: 400, icon: '📄', hint: 'Оригиналы с отметкой получателя' },
    { id: 'insurance', name: 'Страхование груза', price: 349, icon: '🛡️', hint: 'По заявленной стоимости груза' }
  ]
};
