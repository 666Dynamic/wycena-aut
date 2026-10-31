// Filtry, link do Otomoto i podsumowanie wyników.
const FILTRY = (() => {
  function zbuduj(f) {
    return {
      category_id: '29',
      make_model_generation: f.marka + '|' + f.model,
      filter_enum_damaged: '0',
      filter_enum_fuel_type: f.paliwo,
      filter_enum_gearbox: f.skrzynia,
      'filter_float_year:from': String(f.rokOd),
      'filter_float_year:to': String(f.rokDo),
      'filter_float_engine_power:from': String(f.mocOd),
      'filter_float_engine_power:to': String(f.mocDo),
      'filter_float_mileage:from': '0',
      'filter_float_mileage:to': String(f.przebiegDo),
    };
  }

  function link(filtry) {
    const { make_model_generation, category_id, ...reszta } = filtry;
    const [marka, model] = make_model_generation.split('|');
    const adres = new URLSearchParams();
    for (const [nazwa, wartosc] of Object.entries(reszta)) adres.append('search[' + nazwa + ']', wartosc);
    adres.append('search[filter_enum_make]', marka);
    adres.append('search[filter_enum_model]', model);
    adres.append('search[order]', 'filter_float_price:asc');
    return 'https://www.otomoto.pl/osobowe?' + adres;
  }

  // Cena całego auta w PLN brutto. Raty i leasing dają null, tak samo cena netto.
  function cena(node) {
    const parametry = Object.fromEntries((node.parameters || []).map((p) => [p.key, p.value]));
    if (parametry.monthly_payment || parametry.leasing_concession) return null;
    const { amount = {}, isGross, badges } = node.price || {};
    const brutto = isGross === true || (isGross === false && (badges || []).includes('INCLUDE_VAT'));
    const kwota = Number(amount.value);
    return brutto && amount.currencyCode === 'PLN' && kwota > 0 ? kwota : null;
  }

  function podsumuj(odpowiedz) {
    const wynik = odpowiedz.data && odpowiedz.data.advertSearch;
    if ((odpowiedz.errors && odpowiedz.errors.length) || !wynik) throw new Error('Otomoto zwróciło błąd.');
    const zmienione = (wynik.relaxation && wynik.relaxation.applied) || wynik.filtersCriteriaChange || wynik.locationCriteriaChanged;
    if (zmienione) throw new Error('Otomoto zmieniło filtry, więc wynik nie pasuje do auta.');
    if (wynik.sortedBy !== 'filter_float_price:asc' || !wynik.pageInfo || wynik.pageInfo.currentOffset !== 0) throw new Error('Otomoto zwróciło inną stronę wyników.');
    const oferty = wynik.edges || [];
    const ceny = oferty.map((e) => cena(e.node)).filter((c) => c !== null).sort((a, b) => a - b);
    const piec = ceny.slice(0, 5);
    return {
      lacznie: wynik.totalCount,
      najtansza: ceny.length ? ceny[0] : null,
      srednia: piec.length ? piec.reduce((a, b) => a + b, 0) / piec.length : null,
      policzono: piec.length,
      pominieto: oferty.length - ceny.length,
    };
  }

  return { zbuduj, link, podsumuj };
})();

if (typeof module === 'object') module.exports = FILTRY;
