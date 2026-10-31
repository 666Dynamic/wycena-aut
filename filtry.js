// Filtry, link do Otomoto i podsumowanie wyników.
const FILTRY = (() => {
  // Filtr zawiera tylko to, co podano. Puste pole nie ogranicza wyników.
  function zbuduj(f) {
    const filtry = {
      category_id: '29',
      make_model_generation: f.model ? f.marka + '|' + f.model : f.marka,
      filter_enum_damaged: '0',
    };
    const dodaj = (nazwa, wartosc) => {
      if (wartosc !== '' && wartosc !== undefined) filtry[nazwa] = String(wartosc);
    };
    dodaj('filter_enum_fuel_type', f.paliwo);
    dodaj('filter_enum_gearbox', f.skrzynia);
    dodaj('filter_float_year:from', f.rokOd);
    dodaj('filter_float_year:to', f.rokDo);
    dodaj('filter_float_engine_power:from', f.mocOd);
    dodaj('filter_float_engine_power:to', f.mocDo);
    if (f.przebiegDo !== '' && f.przebiegDo !== undefined) dodaj('filter_float_mileage:from', '0');
    dodaj('filter_float_mileage:to', f.przebiegDo);
    return filtry;
  }

  function link(filtry) {
    const { make_model_generation, category_id, ...reszta } = filtry;
    const [marka, model] = make_model_generation.split('|');
    const adres = new URLSearchParams();
    for (const [nazwa, wartosc] of Object.entries(reszta)) adres.append('search[' + nazwa + ']', wartosc);
    adres.append('search[filter_enum_make]', marka);
    if (model) adres.append('search[filter_enum_model]', model);
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

  const INNE_NAZWY_MAREK = { vw: 'volkswagen', mercedes: 'mercedes-benz', alfa: 'alfa-romeo' };
  const NADWOZIA = [
    [/ (stationcar|kombi|combi|estate) /, /(avant| sw|variant|sportstourer|touring)/],
    [/ (limousine|limuzyna|sedan|saloon) /, /limousine/],
    [/ (cabrio|cabriolet|kabriolet) /, /cabrio/],
  ];

  const znormalizuj = (tekst) => ' ' + tekst.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

  function znajdzMarke(n, katalog) {
    const nazwy = katalog.makes.map(([id, nazwa]) => [id, znormalizuj(nazwa)]);
    for (const [skrot, id] of Object.entries(INNE_NAZWY_MAREK)) nazwy.push([id, ' ' + skrot + ' ']);
    const trafione = nazwy.filter(([, nazwa]) => n.includes(nazwa));
    trafione.sort((a, b) => n.indexOf(a[1]) - n.indexOf(b[1]) || b[1].length - a[1].length);
    return trafione.length ? trafione[0][0] : null;
  }

  // Najdłuższa nazwa z listy; dwa modele o tej samej nazwie to brak wyniku.
  function znajdzModel(n, modele) {
    const trafione = modele.filter(([, nazwa]) => n.includes(znormalizuj(nazwa)));
    const dlugosc = Math.max(0, ...trafione.map(([, nazwa]) => nazwa.length));
    const najdluzsze = trafione.filter(([, nazwa]) => nazwa.length === dlugosc);
    const pewny = najdluzsze.length === 1 ? najdluzsze[0] : null;
    const bazy = pewny ? [znormalizuj(pewny[1]).trim()] : n.trim().split(' ');
    for (const [slowa, wariant] of NADWOZIA) {
      if (!slowa.test(n)) continue;
      for (const baza of bazy) {
        const warianty = modele.filter(([, nazwa]) => {
          const pelna = znormalizuj(nazwa);
          return pelna.startsWith(' ' + baza + ' ') && pelna !== ' ' + baza + ' ' && wariant.test(pelna);
        });
        if (warianty.length === 1) return warianty[0][0];
      }
    }
    return pewny ? pewny[0] : null;
  }

  function znajdzBezMarki(n, katalog) {
    if (n.trim().split(' ').length > 15) return {};
    const trafione = [];
    for (const [marka, modele] of Object.entries(katalog.models)) {
      for (const [id, nazwa] of modele) {
        if (nazwa.length > 2 && !/^\d+$/.test(nazwa) && n.includes(znormalizuj(nazwa))) trafione.push({ marka, model: id, dlugosc: nazwa.length });
      }
    }
    const dlugosc = Math.max(0, ...trafione.map((t) => t.dlugosc));
    const najdluzsze = trafione.filter((t) => t.dlugosc === dlugosc);
    return najdluzsze.length === 1 ? { marka: najdluzsze[0].marka, model: najdluzsze[0].model } : {};
  }

  function znajdzPaliwo(t) {
    if (/plug.?in|\bphev\b/.test(t)) return 'plugin-hybrid';
    if (/hybr|\bhev\b/.test(t)) return 'hybrid';
    if (/\blpg\b/.test(t)) return 'petrol-lpg';
    if (/\bcng\b/.test(t)) return 'petrol-cng';
    if (/diesel|\b(tdi|tdci|cdi|hdi|dci|crdi)\b/.test(t)) return 'diesel';
    if (/benzin|benzyn|petrol|\b(tsi|tfsi|fsi|mpi)\b/.test(t)) return 'petrol';
    if (/\b(bev|elektro|electric|elektryczn[yae])\b/.test(t)) return 'electric';
    return null;
  }

  function znajdzSkrzynie(t) {
    const automat = /\b(automat|automatic|automatik|automatyczn[aey]|dsg|s.?tronic|tiptronic|steptronic|multitronic|cvt)\b/.test(t);
    const manual = /\b(manual|manualn[aey]|manuell|schaltgetriebe|handschaltung)\b/.test(t);
    return automat === manual ? null : automat ? 'automatic' : 'manual';
  }

  function znajdzRok(t) {
    const wzory = [
      /(?:erstzulassung|\bez\b|baujahr|pierwsza rejestracja|\brok\b)\s*:?\s*(?:\d{1,2}[./-]){0,2}((?:19|20)\d\d)\b/,
      /\b((?:19|20)\d\d)-\d\d-\d\d\b/,
      /\b\d{1,2}[./]((?:19|20)\d\d)\b/,
      /(?:^|[^\d.,])((?:19|20)\d\d)(?![\d.,]|\s*(?:km|kw|ps|hp))/,
    ];
    for (const wzor of wzory) {
      const trafienie = t.match(wzor);
      if (trafienie && Number(trafienie[1]) <= new Date().getFullYear() + 1) return Number(trafienie[1]);
    }
    return null;
  }

  function znajdzPrzebieg(t) {
    const liczba = (tekst) => Number(tekst.replace(/\D/g, ''));
    const tysiace = t.match(/(^|[^\d.,])(\d{1,3}(?:[.,]\d+)?)\s*(?:tys\.?|tkm|k)(?![a-z])/);
    const wzory = [
      /(?:laufleistung|kilometerstand|przebieg|mileage|odometer)\s*:?\s*()(\d[\d. ]*\d)/,
      /(^|[^\d.,])(\d{1,3}(?:[. ]\d{3})+|\d{4,7})\s*km\b/,
      /(^|[^\d.,])(\d{1,3}(?:[. ]\d{3})+)(?![\d.,])/,
      /(^|[^\d.,])(\d{5,6})(?![\d.,])/,
    ];
    const zapis = t.match(wzory[0]);
    if (zapis) return { przebieg: liczba(zapis[2]), znalezione: zapis[0] };
    if (tysiace) return { przebieg: Math.round(Number(tysiace[2].replace(',', '.')) * 1000), znalezione: tysiace[0] };
    for (const wzor of wzory.slice(1)) {
      const trafienie = t.match(wzor);
      if (trafienie) return { przebieg: liczba(trafienie[2]), znalezione: trafienie[0] };
    }
    return {};
  }

  function znajdzMoc(t) {
    const kw = t.match(/(?:^|[^\d.,])(\d{2,3})\s*kw\b/);
    if (kw) return Math.round(Number(kw[1]) * 1.35962);
    const km = t.match(/(?:^|[^\d.,])(\d{2,4})\s*(?:ps|hp|bhp|cv|koni|konie|km)\b/);
    return km && Number(km[1]) >= 20 && Number(km[1]) <= 1500 ? Number(km[1]) : null;
  }

  // Odczyt auta z tekstu. Czego nie ma w tekście, tego nie ma w wyniku.
  function rozpoznaj(tekst, katalog) {
    const bezSmieci = tekst
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/\b[a-z0-9]{17}\b/gi, ' ')
      .replace(/\b\d{9,}\b/g, ' ')
      .replace(/(?:€|eur|pln)\s*\d[\d.,]*|\d[\d.,]*\s*(?:€|eur\b|euro\b|zł|pln\b)/gi, ' ')
      .replace(/\d[\d.,]*\s*(?:ccm|cm3|cm³)/gi, ' ')
      .replace(/(?:nächste hu|\bhu\b|tüv)\s*:?\s*\d{1,2}[./-](?:\d{1,2}[./-])?\d{2,4}/gi, ' ');
    const t = bezSmieci.toLowerCase();
    const n = znormalizuj(bezSmieci);
    const wynik = {};
    const marka = znajdzMarke(n, katalog);
    if (marka) {
      wynik.marka = marka;
      const model = znajdzModel(n, katalog.models[marka] || []);
      if (model) wynik.model = model;
    } else {
      Object.assign(wynik, znajdzBezMarki(n, katalog));
    }
    const paliwo = znajdzPaliwo(t);
    if (paliwo) wynik.paliwo = paliwo;
    const skrzynia = znajdzSkrzynie(t);
    if (skrzynia) wynik.skrzynia = skrzynia;
    const rok = znajdzRok(t);
    if (rok) wynik.rok = rok;
    const bezDat = t.replace(/\b(?:19|20)\d\d-\d\d-\d\d\b|\b(?:\d{1,2}[./]){1,2}(?:19|20)\d\d\b/g, ' ').replace(/(^|[^\d.,])(?:19|20)\d\d(?![\d.,]|\s*(?:km|kw|ps|hp))/g, '$1 ');
    const { przebieg, znalezione } = znajdzPrzebieg(bezDat);
    if (przebieg) wynik.przebieg = przebieg;
    const moc = znajdzMoc(znalezione ? bezDat.replace(znalezione, ' ') : bezDat);
    if (moc) wynik.moc = moc;
    return wynik;
  }

  return { zbuduj, link, podsumuj, rozpoznaj };
})();

if (typeof module === 'object') module.exports = FILTRY;
