// Cloudflare Worker: pyta Otomoto w imieniu strony, bo Otomoto nie pozwala przeglądarce czytać wyników z innej domeny.
// Przyjmuje tylko same filtry wyszukiwania, bez cookies i bez ponawiania po odmowie.
const STRONA = 'https://666dynamic.github.io';
const NAGLOWKI = { 'Access-Control-Allow-Origin': STRONA, 'Content-Type': 'application/json' };
const DOZWOLONE = /^(category_id|make_model_generation|filter_enum_damaged|filter_enum_fuel_type|filter_enum_gearbox|filter_float_(year|engine_power|mileage):(from|to))$/;

function zapytanie(filters) {
  return {
    extensions: { persistedQuery: { sha256Hash: '8009c91ecab36c09704ac9401f8cf2ea59d17e28e504d04d8827abd593bec646', version: 1 } },
    operationName: 'listingScreen',
    variables: {
      after: null, experiments: [], filters: Object.entries(filters).map(([name, value]) => ({ name, value: String(value) })),
      includeCepik: true, includePremiumTopAd: false, includePremiumTopAdAiVideo: false, includePriceDrop: true,
      includePriceEvaluation: true, includePromotedAds: false, includeSellerRegisteredAt: false, includeSeoSurfaces: false,
      includeShowBigAdCard: false, includeSuggestedFilters: false, maxAge: 60, page: 1,
      parameters: ['make', 'model', 'fuel_type', 'gearbox', 'mileage', 'engine_power', 'year', 'monthly_payment', 'leasing_concession'],
      searchTerms: [], sortBy: 'filter_float_price:asc',
    },
  };
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('', { status: 405, headers: NAGLOWKI });
    if (request.headers.get('Origin') !== STRONA) return new Response('', { status: 403, headers: NAGLOWKI });
    const { filters } = await request.json().catch(() => ({}));
    if (!filters || !Object.keys(filters).every((nazwa) => DOZWOLONE.test(nazwa))) return new Response('{}', { status: 400, headers: NAGLOWKI });
    const odpowiedz = await fetch('https://www.otomoto.pl/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'wycena-aut-pilot/0.1' },
      body: JSON.stringify(zapytanie(filters)),
    });
    return new Response(odpowiedz.body, { status: odpowiedz.status, headers: NAGLOWKI });
  },
};
