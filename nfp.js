/* Zyklus – Auswertungslogik nach Sensiplan-Regelwerk (symptothermale Methode)
 * plus zusätzliche, ausdrücklich gekennzeichnete App-Vorsichtsregeln.
 * Reine Logik ohne Oberfläche, damit sie separat getestet werden kann.
 */
(function (root) {
  'use strict';

  // ---------- Datum ----------
  const DAY = 864e5;
  function parseD(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function fmtD(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(s, n) { return fmtD(parseD(s) + n * DAY); }
  function diffDays(a, b) { return Math.round((parseD(b) - parseD(a)) / DAY); }
  function todayStr(now) {
    const d = now || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- Zervixschleim ----------
  // Rangfolge Sensiplan: t < Ø < f < S < S+
  const Q_LABEL = ['t', 'Ø', 'f', 'S', 'S+'];
  const Q_TEXT = [
    't – trocken',
    'Ø – nichts gefühlt, nichts gesehen',
    'f – feucht, nichts gesehen',
    'S – dicklich, weißlich, klebrig',
    'S+ – glasig, spinnbar oder nass/rutschig'
  ];
  /** Tageskategorie 0..4 aus Gefühl und Aussehen (höchste Qualität zählt), null = keine Beobachtung */
  function mucusCat(day) {
    if (!day) return null;
    const g = day.gefuehl, a = day.aussehen;
    if (!g && !a) return null;
    let q = 1; // Ø, falls nur „nichts gesehen“ angegeben
    if (g === 't') q = 0;
    else if (g === 'o') q = 1;
    else if (g === 'f') q = 2;
    else if (g === 'n') q = 4;
    if (a === 'S') q = Math.max(q, 3);
    else if (a === 'S+') q = 4;
    return q;
  }

  // ---------- Temperatur ----------
  function tempH(day) { // Hundertstel als Ganzzahl, null wenn nicht vorhanden
    if (!day || day.temp == null || day.temp === '' || isNaN(day.temp)) return null;
    return Math.round(Number(day.temp) * 100);
  }
  function isExcluded(day) { return !!(day && (day.ausklammern || day.stoerung)); }

  /**
   * Temperaturauswertung „3 über 6“ mit beiden Ausnahmeregeln (nicht kombinierbar).
   * rows: [{day}] in Zyklusreihenfolge. Liefert {done, pending, attempts}.
   */
  function evalTemperature(rows, ort) {
    const V = [];
    rows.forEach((r, i) => {
      const t = tempH(r.day);
      if (t != null && !isExcluded(r.day)) V.push({ i, t, ort: (r.day.ort || ort || '') });
    });
    let pending = null;
    const attempts = [];
    for (let j = 6; j < V.length; j++) {
      const lows = V.slice(j - 6, j);
      const line = Math.max(...lows.map(v => v.t));
      if (!(V[j].t > line)) continue; // keine erste höhere Messung
      const ehm = V[j];
      const res = {
        ehmIdx: ehm.i, lowIdx: lows.map(v => v.i), line,
        highIdx: [ehm.i], dropIdx: null, completeIdx: null, rule: null,
        ortMismatch: false, failReason: null, needFourth: false
      };
      if (lows.some(v => v.ort !== ehm.ort)) res.ortMismatch = true;
      let drops = 0;
      let failed = false;
      for (let k = j + 1; k < V.length; k++) {
        const v = V[k];
        if (v.ort !== ehm.ort) res.ortMismatch = true;
        if (v.t > line) {
          res.highIdx.push(v.i);
          const n = res.highIdx.length;
          if (res.needFourth) {
            if (n === 4) { res.completeIdx = v.i; res.rule = 'ausnahme1'; break; }
          } else if (n === 3) {
            if (drops === 0) {
              if (v.t >= line + 20) { res.completeIdx = v.i; res.rule = 'standard'; break; }
              res.needFourth = true; // 1. Ausnahmeregel
            } else {
              if (v.t >= line + 20) { res.completeIdx = v.i; res.rule = 'ausnahme2'; break; }
              failed = true; res.failReason = 'Nach einem Wert auf/unter der Hilfslinie liegt der 3. höhere Wert nicht mindestens 0,2 °C über der Linie. Ausnahmeregeln dürfen nicht kombiniert werden.';
              break;
            }
          }
        } else {
          if (res.needFourth) { failed = true; res.failReason = 'Der 4. Wert (1. Ausnahmeregel) liegt nicht über der Hilfslinie.'; break; }
          if (drops === 0 && res.highIdx.length < 3) { drops = 1; res.dropIdx = v.i; continue; }
          failed = true; res.failReason = 'Mehr als ein Wert fällt auf oder unter die Hilfslinie.'; break;
        }
      }
      if (res.completeIdx != null) {
        if (res.ortMismatch) {
          // App-Vorsichtsregel: Werte verschiedener Messorte sind nicht vergleichbar
          res.failReason = 'Messort gewechselt – Werte nicht vergleichbar.';
          attempts.push(res);
          continue;
        }
        // Lücken (fehlende Tage) im Auswertungsbereich erkennen
        const from = res.lowIdx[0], to = res.completeIdx;
        res.gapDays = [];
        for (let x = from; x <= to; x++) {
          if (tempH(rows[x].day) == null || isExcluded(rows[x].day)) res.gapDays.push(x);
        }
        res.ehmCd = res.ehmIdx + 1;
        return { done: res, pending: null, attempts };
      }
      if (failed) { attempts.push(res); continue; }
      if (!pending) pending = res; // Daten reichen noch nicht – Auswertung läuft
    }
    return { done: null, pending, attempts };
  }

  // ---------- Schleimhöhepunkt (progressiv, Tag für Tag) ----------
  function evalMucusProgressive(q) {
    const okAt = [], peakAt = [];
    let maxQ = -1;
    for (let d = 0; d < q.length; d++) {
      if (q[d] != null && q[d] > maxQ) maxQ = q[d];
      let peak = null;
      if (maxQ >= 2) {
        for (let x = d; x >= 0; x--) if (q[x] === maxQ) { peak = x; break; }
      }
      peakAt[d] = peak;
      let ok = false;
      if (peak != null && d - peak >= 3) {
        ok = true;
        for (let x = peak + 1; x <= d; x++) if (q[x] == null) { ok = false; break; } // Vorsicht: lückenlos beobachtet
      }
      okAt[d] = ok;
    }
    return { okAt, peakAt, maxQ };
  }

  // ---------- Zyklen ----------
  function buildCycles(data, today) {
    const days = data.days || {};
    const starts = Object.keys(days).filter(d => days[d] && days[d].zyklusstart && d <= today).sort();
    const cycles = [];
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const complete = i + 1 < starts.length;
      const end = complete ? addDays(starts[i + 1], -1) : today;
      const dates = [];
      for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
      cycles.push({ index: i, start, end, complete, dates });
    }
    return cycles;
  }

  const RULE_TEXT = {
    standard: 'Standardregel: 3 höhere Werte über der Hilfslinie, der 3. mindestens 0,2 °C darüber',
    ausnahme1: '1. Ausnahmeregel: 3. Wert unter 0,2 °C – 4. Wert über der Hilfslinie',
    ausnahme2: '2. Ausnahmeregel: ein Wert auf/unter der Hilfslinie nicht gezählt – 3. gezählter Wert mindestens 0,2 °C darüber'
  };

  function fmtT(h) { return (h / 100).toFixed(2).replace('.', ','); }
  function hmToMin(s) { if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; }

  function evaluateCycle(cyc, data, prevResults, settings, today) {
    const days = data.days || {};
    const S = settings || {};
    const rows = cyc.dates.map((d, i) => ({ date: d, cd: i + 1, day: days[d] || null }));
    const n = rows.length;
    const q = rows.map(r => mucusCat(r.day));
    const hints = [];
    const temp = evalTemperature(rows, S.ort);
    const T = temp.done;
    const M = evalMucusProgressive(q);

    // Ende der fruchtbaren Zeit: doppelte Kontrolle – was zuletzt kommt
    let infStart = null;
    if (T) {
      for (let d = T.completeIdx; d < n; d++) if (M.okAt[d]) { infStart = d; break; }
    }
    const peak = infStart != null ? M.peakAt[infStart] : M.peakAt[n - 1];
    const peakDone = infStart != null || (peak != null && M.okAt[n - 1]);
    const mucusDoneIdx = peak != null && peakDone ? peak + 3 : null;

    // Beginn der fruchtbaren Zeit
    const evaluatedPrev = prevResults.filter(r => r.T);
    const recent12 = evaluatedPrev.slice(-12);
    const minus8 = recent12.length ? Math.min(...recent12.map(r => r.T.ehmCd)) - 8 : null;
    const prev = prevResults.length ? prevResults[prevResults.length - 1] : null;
    let lastRel = 0, relRule = null, relReason = '';
    if (S.streng) {
      relRule = 'streng';
      relReason = 'Strenge Einstellung: vor dem Eisprung gelten keine Tage als unfruchtbar.';
    } else if (!prev) {
      relRule = 'vorsicht';
      relReason = 'App-Vorsichtsregel: Für den ersten aufgezeichneten Zyklus fehlt ein Vorzyklus mit bestätigtem Temperaturanstieg. Deshalb keine relativ unfruchtbaren Tage, bis die Hochlage ausgewertet ist.';
    } else if (!prev.T) {
      relRule = 'vorsicht';
      relReason = 'App-Vorsichtsregel: Im Vorzyklus wurde kein Temperaturanstieg bestätigt. Deshalb keine relativ unfruchtbaren Tage in diesem Zyklus.';
    } else if (evaluatedPrev.length >= 12) {
      lastRel = minus8; relRule = 'minus8';
      relReason = `Minus-8-Regel: früheste 1. höhere Messung der letzten 12 Zyklen am ZT ${minus8 + 8}, minus 8 = ZT ${minus8}.`;
    } else if (minus8 != null && minus8 < 5) {
      lastRel = minus8; relRule = 'minus8';
      relReason = `Minus-8-Regel greift vor Ablauf von 12 Zyklen, weil sie früher ist als die 5-Tage-Regel: früheste 1. höhere Messung ZT ${minus8 + 8}, minus 8 = ZT ${minus8}.`;
    } else {
      lastRel = 5; relRule = '5tage';
      relReason = `5-Tage-Regel (Einsteigerinnen, ${evaluatedPrev.length} von 12 ausgewerteten Zyklen): ZT 1–5 relativ unfruchtbar, solange kein Schleim und kein Feuchtigkeitsgefühl auftritt.`;
    }
    lastRel = Math.max(0, lastRel);
    let relEnd = 0; // Anzahl relativ unfruchtbarer Tage (Index exklusiv)
    let relBreak = null, relPendingIdx = null;
    for (let i = 0; i < Math.min(lastRel, n); i++) {
      const bleeding = (rows[i].day && rows[i].day.blutung >= 2);
      if (q[i] != null && q[i] >= 2) { relBreak = `Schleim/Feuchtigkeit (${Q_LABEL[q[i]]}) am ZT ${i + 1}: fruchtbare Zeit beginnt.`; break; }
      if (q[i] == null && !bleeding) {
        if (rows[i].date === today) { relPendingIdx = i; relEnd = i; break; }
        relBreak = `App-Vorsichtsregel: Am ZT ${i + 1} wurde kein Schleim eingetragen – ab diesem Tag fruchtbar.`; break;
      }
      relEnd = i + 1;
    }

    const status = rows.map((r, i) => {
      if (i < relEnd) return 'rel';
      if (i === relPendingIdx) return 'relPending';
      if (infStart != null && i === infStart) return 'infEve';
      if (infStart != null && i > infStart) return 'inf';
      return 'fert';
    });

    // ----- Hinweise -----
    if (cyc.index < 3) hints.push({ level: 'info', text: `Lernphase (Zyklus ${cyc.index + 1}): Auswertung mit dem Sensiplan-Buch oder einer Beraterin gegenprüfen.` });
    if (relBreak) hints.push({ level: 'info', text: relBreak });
    if (relPendingIdx != null) hints.push({ level: 'warn', text: 'Heute ist noch kein Schleim eingetragen. Relativ unfruchtbar nur, wenn den ganzen Tag weder Schleim noch Feuchtigkeit bemerkt wird – abends prüfen und eintragen.' });

    if (T) {
      if (T.rule !== 'standard') hints.push({ level: 'info', text: RULE_TEXT[T.rule] + ' angewendet.' });
      if (T.gapDays && T.gapDays.length) hints.push({ level: 'warn', text: `Im Auswertungsbereich fehlen Werte oder sind ausgeklammert (ZT ${T.gapDays.map(x => x + 1).join(', ')}). Auswertung besonders kritisch prüfen.` });
      if (peak != null) {
        const dist = T.ehmIdx - peak;
        if (dist < -3 || dist > 4) hints.push({ level: 'warn', text: `Temperaturanstieg (ZT ${T.ehmCd}) und Schleimhöhepunkt (ZT ${peak + 1}) liegen ungewöhnlich weit auseinander. Beobachtung und Eintragungen prüfen.` });
      }
      if (infStart == null) {
        if (M.maxQ < 2) hints.push({ level: 'warn', text: 'Temperatur ist ausgewertet, aber es wurde kein Schleim (f, S, S+) beobachtet. Ohne Schleimhöhepunkt keine doppelte Kontrolle – weiter als fruchtbar werten.' });
        else hints.push({ level: 'info', text: 'Temperatur ist ausgewertet. Es fehlt noch der Abschluss des Schleimsymptoms (Höhepunkt + 3 Tage mit schlechterer Qualität, lückenlos eingetragen).' });
      }
      const hoch = n - T.ehmIdx;
      if (cyc.complete && hoch < 10) hints.push({ level: 'warn', text: `Kurze Hochlage (${hoch} Tage). Tritt das wiederholt auf, gynäkologisch abklären lassen.` });
      if (!cyc.complete && hoch >= 19) hints.push({ level: 'danger', text: `Hochlage seit ${hoch} Tagen ohne Blutung (mehr als 18 Tage): Eine Schwangerschaft ist möglich – Schwangerschaftstest machen.` });
    } else if (temp.pending) {
      const p = temp.pending;
      let need;
      if (p.needFourth) need = 'Der 3. Wert liegt weniger als 0,2 °C über der Linie – 1. Ausnahmeregel: ein 4. Wert über der Hilfslinie ist nötig.';
      else if (p.dropIdx != null) need = 'Ein Wert lag auf/unter der Linie (2. Ausnahmeregel): weitere Werte nötig, der 3. gezählte mindestens 0,2 °C über der Linie.';
      else need = `Noch ${3 - p.highIdx.length} höhere(r) Wert(e) nötig, der 3. mindestens 0,2 °C über der Linie.`;
      hints.push({ level: 'info', text: `1. höhere Messung am ZT ${p.ehmIdx + 1}, Hilfslinie ${fmtT(p.line)} °C. ${need}` });
    } else if (cyc.complete) {
      hints.push({ level: 'warn', text: 'Kein Temperaturanstieg auswertbar (möglicherweise Zyklus ohne Eisprung oder zu viele Lücken). Im Folgezyklus gelten deshalb keine relativ unfruchtbaren Tage.' });
    }
    temp.attempts.filter(a => a.failReason).slice(-1).forEach(a => {
      if (!T) hints.push({ level: 'info', text: `Anstieg ab ZT ${a.ehmIdx + 1} nicht auswertbar: ${a.failReason} Es wird ein neuer Anstieg abgewartet.` });
    });

    // Messzeit und Messort
    const stdMin = hmToMin(S.messzeit);
    if (stdMin != null) {
      const off = rows.filter(r => r.day && tempH(r.day) != null && !isExcluded(r.day) && hmToMin(r.day.zeit) != null && Math.abs(hmToMin(r.day.zeit) - stdMin) > 60).map(r => r.cd);
      if (off.length) hints.push({ level: 'warn', text: `Messzeit weicht mehr als 1 Stunde ab (ZT ${off.join(', ')}). Solche Werte ggf. ausklammern.` });
    }
    const orte = new Set(rows.filter(r => tempH(r.day) != null && !isExcluded(r.day)).map(r => r.day.ort || S.ort || ''));
    if (orte.size > 1) hints.push({ level: 'warn', text: 'In diesem Zyklus wurde an verschiedenen Messorten gemessen. Werte sind nicht vergleichbar – pro Zyklus immer am selben Ort messen.' });

    // Verkehr an fruchtbaren Tagen
    rows.forEach((r, i) => {
      if (!r.day || r.day.verkehr !== 'u') return;
      const s = status[i];
      if (s === 'fert' || s === 'relPending') {
        const recent = diffDays(r.date, today) <= 5;
        hints.push({ level: recent ? 'danger' : 'warn', text: `Ungeschützter Verkehr an einem fruchtbaren Tag (ZT ${r.cd}).` + (recent ? ' Notfallverhütung („Pille danach“) wirkt nur zeitnah – möglichst sofort Apotheke oder Ärztin fragen.' : '') });
      } else if (s === 'infEve') {
        hints.push({ level: 'info', text: `Verkehr am ZT ${r.cd}: an diesem Tag gilt die unfruchtbare Zeit erst ab dem Abend.` });
      }
    });

    if (cyc.complete && (n < 24 || n > 38)) hints.push({ level: 'info', text: `Zykluslänge ${n} Tage liegt außerhalb des üblichen Bereichs (24–38 Tage). Bei häufigem Auftreten ärztlich abklären lassen.` });

    return {
      index: cyc.index, start: cyc.start, end: cyc.end, complete: cyc.complete, length: n,
      rows, q, status, T, tempPending: temp.pending, mucus: M, peak, mucusDoneIdx, infStart,
      lastRel, relRule, relReason, relEnd, relBreak, hints
    };
  }

  function evaluateAll(data, settings, today) {
    const t = today || todayStr();
    const cycles = buildCycles(data, t);
    const results = [];
    cycles.forEach(c => results.push(evaluateCycle(c, data, results, settings || data.settings || {}, t)));
    return results;
  }

  /** Status eines beliebigen Datums inkl. Zyklusbezug */
  function statusForDate(results, date) {
    for (let k = results.length - 1; k >= 0; k--) {
      const r = results[k];
      if (date >= r.start && date <= r.end) {
        const i = diffDays(r.start, date);
        return { cycle: r, i, cd: i + 1, status: r.status[i] };
      }
    }
    return null;
  }

  const STATUS_TEXT = {
    rel: 'Relativ unfruchtbar',
    relPending: 'Relativ unfruchtbar – nur ohne Schleim (abends prüfen)',
    fert: 'Fruchtbar',
    infEve: 'Unfruchtbar ab dem Abend',
    inf: 'Unfruchtbar (nach dem Eisprung)'
  };

  const API = {
    parseD, fmtD, addDays, diffDays, todayStr, mucusCat, tempH, isExcluded,
    evalTemperature, evalMucusProgressive, buildCycles, evaluateCycle, evaluateAll, statusForDate,
    Q_LABEL, Q_TEXT, RULE_TEXT, STATUS_TEXT, fmtT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.NFP = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
