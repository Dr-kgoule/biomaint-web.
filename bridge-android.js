/* bridge-android.js — fournit window.bioMaint (l'API qu'Electron offrait via preload) pour Android / Capacitor.
   Données, code d'accès, clés API : stockés dans la mémoire privée de l'app (WebView). */
(() => {
  'use strict';
  const LS = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const P = () => (window.Capacitor && Capacitor.Plugins) || {};
  const LANG = { fr: 'français', en: 'anglais', es: 'espagnol', pt: 'portugais', ar: 'arabe' };
  const DEF_MODEL = { gemini: 'gemini-2.5-flash', claude: 'claude-haiku-5-5' };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addM = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setMonth(d.getMonth() + n); return fmt(d); };
  const dueOf = e => e.nextDue || ((e.freqMonths && (e.lastMaint || e.installDate)) ? addM(e.lastMaint || e.installDate, +e.freqMonths) : null);
  const EMPTY = () => ({ equipments: [], interventions: [], notifs: [], manuals: {} });

  /* ---------- Profil de l'utilisateur (technicien / ingénieur) : apparaît sur les PDF ---------- */
  const PROFILE0 = () => ({ prenom: '', nom: '', structure: '', fonction: '' });
  const getProfile = () => Object.assign(PROFILE0(), LS('bm_profile') || {});
  const whoLine = p => [[p.prenom, p.nom].filter(Boolean).join(' '), p.fonction].filter(Boolean).join(', ');

  /* ---------- Code d'accès (PIN haché, jamais stocké en clair) ---------- */
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

  /* ---------- Appel IA (Gemini ou Claude, avec la clé de l'utilisateur) ---------- */
  async function ask(prompt, { search = false, maxTokens = 2048 } = {}) {
    const st = LS('bm_settings') || { provider: 'gemini', model: '' };
    const prov = st.provider === 'claude' ? 'claude' : 'gemini';
    const key = (LS('bm_keys') || {})[prov];
    if (!key) throw new Error('Clé API absente : ajoutez-la dans Réglages.');
    const model = st.model || DEF_MODEL[prov];
    let call;
    if (prov === 'gemini') {
      call = async tools => {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], ...(tools ? { tools } : {}) })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message || `Erreur Gemini (${r.status})`);
        return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      };
      var tools = search ? [{ google_search: {} }] : null;
    } else {
      call = async tools => {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], ...(tools ? { tools } : {}) })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error?.message || `Erreur Claude (${r.status})`);
        return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      };
      var tools = search ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] : null;
    }
    let out;
    try { out = await call(tools); } catch (e) { if (!tools) throw e; out = await call(null); } // recherche web indisponible : on réessaie sans
    out = (out || '').trim();
    if (!out) throw new Error('Réponse vide de l\'IA.');
    return out;
  }

  /* ---------- Enregistrer + partager un fichier (menu Partager d'Android) ---------- */
  async function saveShare(name, data, isBase64) {
    const { Filesystem, Share } = P();
    if (Filesystem && Share) {
      const w = await Filesystem.writeFile({ path: name, data, directory: 'CACHE', ...(isBase64 ? {} : { encoding: 'utf8' }) });
      try { await Share.share({ title: name, url: w.uri, dialogTitle: 'Enregistrer ou envoyer' }); } catch { /* partage annulé : le fichier est déjà créé */ }
      return;
    }
    const blob = isBase64 ? new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'application/pdf' }) : new Blob([data], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
  const slug = s => String(s || 'fichier').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fichier';
  const winansi = s => String(s ?? '').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/\u2022/g, '-').replace(/\u20AC/g, 'EUR').replace(/\u0153/g, 'oe').replace(/\u0152/g, 'OE').replace(/[^\n\t\x20-\x7E\xA0-\xFF]/g, '?');

  /* ---------- Notifications natives ---------- */
  let ready = false;
  async function notifier() {
    const ln = P().LocalNotifications; if (!ln) return null;
    try {
      if (!ready) {
        ready = true;
        const s = await ln.checkPermissions(); if (s.display !== 'granted') await ln.requestPermissions();
        await ln.createChannel({ id: 'maint', name: 'Alertes maintenance', description: 'Rappels et alertes GMAO', importance: 5, visibility: 1, vibration: true, lights: true });
      }
      return ln;
    } catch { return null; }
  }
  async function planReminders(data) {
    const ln = await notifier(); if (!ln) return;
    try {
      const pend = await ln.getPending(); if (pend.notifications.length) await ln.cancel({ notifications: pend.notifications });
      const now = new Date(), all = [], at8 = (s, o) => { const d = new Date(s + 'T08:00:00'); d.setDate(d.getDate() + o); return d; };
      const add = (at, title, body) => { if (at > now) all.push({ at, title, body }); };
      for (const e of data.equipments || []) {
        const d = dueOf(e); if (!d) continue; const n = e.name || 'Équipement';
        add(at8(d, -7), '🗓️ J-7 — BioMaint IA', `${n} arrive. Anticipe, c'est moins cher qu'une panne.`);
        add(at8(d, -3), '📅 J-3 — BioMaint IA', `${n} : cale le créneau avec le service ${e.service || 'concerné'}.`);
        add(at8(d, -1), '⏰ Demain — BioMaint IA', `${n} : prépare les pièces dès maintenant.`);
        add(at8(d, 0), '🔥 AUJOURD\'HUI — BioMaint IA', `${n} : outils prêts, on y va.`);
        for (let k = 1; k <= 7; k++) add(at8(d, k), '🚨 EN RETARD — BioMaint IA', `${n} : ${k} j de retard. Lance l'intervention aujourd'hui.`);
      }
      all.sort((a, b) => a.at - b.at);
      const list = all.slice(0, 60).map((x, i) => ({ id: i + 1, title: x.title, body: x.body, channelId: 'maint', schedule: { at: x.at, allowWhileIdle: true } }));
      if (list.length) await ln.schedule({ notifications: list });
    } catch { /* non bloquant */ }
  }
  let planTimer;
  const planSoon = data => { clearTimeout(planTimer); planTimer = setTimeout(() => planReminders(data), 800); };

  /* ---------- Lecture d'un fichier à traduire ---------- */
  function pickFile(acc) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = acc || '.pdf,.txt,.md,application/pdf,text/plain'; i.style.display = 'none'; document.body.appendChild(i);
      let done = false; const fin = v => { if (done) return; done = true; i.remove(); res(v); };
      i.onchange = () => fin(i.files[0] || null); i.oncancel = () => fin(null);
      addEventListener('focus', () => setTimeout(() => { if (!i.files.length) fin(null); }, 1500), { once: true });
      i.click();
    });
  }
  async function readText(f) {
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      if (!window.pdfjsLib) throw new Error('Lecteur PDF indisponible.');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; let t = '';
      for (let p = 1; p <= doc.numPages && t.length < 80000; p++) { const c = await (await doc.getPage(p)).getTextContent(); t += c.items.map(i => i.str).join(' ') + '\n\n'; }
      return t.trim();
    }
    return (await f.text()).trim();
  }
  function chunks(t, n = 5000) {
    const out = []; while (t.length > n) { let k = t.lastIndexOf('. ', n); if (k < n / 2) k = n; out.push(t.slice(0, k + 1)); t = t.slice(k + 1).trim(); } if (t) out.push(t); return out;
  }

  const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

  /* ---------- API exposée à renderer.js ---------- */
  window.bioMaint = {
    about: () => fetch('about.json').then(r => r.json()).catch(() => ({})),
    getProfile: async () => getProfile(),
    setProfile: async p => {
      const c = k => String(p?.[k] ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const v = { prenom: c('prenom'), nom: c('nom'), structure: c('structure'), fonction: c('fonction') };
      setLS('bm_profile', v); return v;
    },
    authStatus: async () => ({ hasPin: !!LS('bm_pin') }),
    setup: async pin => {
      if (String(pin || '').length < 4) return { ok: false, error: '4 caractères minimum.' };
      const salt = crypto.getRandomValues(new Uint32Array(2)).join('-'); setLS('bm_pin', { salt, h: await sha(salt + pin) }); return { ok: true };
    },
    login: async pin => { const p = LS('bm_pin'); return p && p.h === await sha(p.salt + pin) ? { ok: true } : { ok: false, error: 'Code incorrect.' }; },
    get: async () => {
      const d = Object.assign(EMPTY(), LS('bm_data') || {}), k = LS('bm_keys') || {};
      planSoon(d);
      return { ...d, settings: LS('bm_settings') || { provider: 'gemini', model: '' }, keys: { gemini: !!k.gemini, claude: !!k.claude } };
    },
    save: async data => { setLS('bm_data', data); planSoon(data); return true; },
    setSettings: async s => { setLS('bm_settings', { provider: s.provider === 'claude' ? 'claude' : 'gemini', model: (s.model || '').trim() }); return true; },
    setKey: async ({ provider, key }) => { const k = LS('bm_keys') || {}; k[provider] = String(key).trim(); setLS('bm_keys', k); return true; },
    testKey: async () => { await ask('Réponds uniquement par le mot OK.', { maxTokens: 20 }); return true; },
    searchManuals: ({ brand, model, docType, lang }) => ask(
      `Tu assistes un technicien biomédical. Recherche le document « ${docType || 'manuel'} » de l'équipement ${brand} ${model}. Réponds en ${LANG[lang] || 'français'}, en texte brut.\n` +
      `1) Liens vers les sources officielles (site du fabricant en priorité). N'invente JAMAIS d'URL : écris « non trouvé » si tu n'as pas de source fiable.\n` +
      `2) Points clés utiles à la maintenance : fréquence, contrôles, consommables, précautions.\n3) Rappelle de vérifier le document officiel avant toute intervention.`, { search: true }),
    suggest: async ({ brand, model }) => {
      const t = await ask(`Équipement biomédical : ${brand} ${model}. Donne la fréquence de maintenance préventive recommandée (en mois). Réponds UNIQUEMENT par un JSON : {"months": <entier>, "justification": "<une phrase en français>"}`, { search: true, maxTokens: 400 });
      const m = t.match(/\{[\s\S]*\}/); let j; try { j = JSON.parse(m[0]); } catch { throw new Error('Réponse IA illisible, réessayez.'); }
      const months = Math.min(60, Math.max(1, parseInt(j.months, 10) || 0)); if (!months) throw new Error('Fréquence non trouvée, réessayez.');
      return { months, justification: String(j.justification || '') };
    },
    translate: async ({ lang }) => {
      const f = await pickFile(); if (!f) return { canceled: true };
      const text = await readText(f); if (!text) throw new Error('Aucun texte lisible dans ce fichier (PDF scanné ?).');
      let out = '';
      for (const c of chunks(text)) out += await ask(`Traduis fidèlement en ${LANG[lang] || 'français'} ce texte technique (manuel d'équipement biomédical). Conserve les chiffres, unités, références et avertissements de sécurité. Réponds uniquement par la traduction.\n\n${c}`, { maxTokens: 4096 }) + '\n\n';
      const name = `manuel-traduit-${lang}-${slug(f.name.replace(/\.[^.]+$/, ''))}.txt`;
      await saveShare(name, out.trim(), false); return { path: name };
    },
    exportPdf: async ({ rows, name }) => {
      if (!window.jspdf) throw new Error('Générateur PDF indisponible.');
      const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 15, LW = 52, VW = W - 2 * M - LW - 4;
      const pr = getProfile(), who = whoLine(pr);
      const head = () => { doc.setFillColor(10, 90, 115); doc.rect(0, 0, W, 14, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text("BioMaint IA", M, 9.5);
        if (pr.structure) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(winansi(doc.splitTextToSize(pr.structure, 110)[0]), W - M, 9.5, { align: 'right' }); } doc.setTextColor(0); };
      head(); doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.setTextColor(10, 90, 115); doc.text("Fiche d'intervention", M, 28); doc.setTextColor(0);
      let y = 36;
      if (who || pr.structure) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
        if (pr.structure) { doc.text(winansi('Structure : ' + pr.structure), M, y); y += 5; }
        if (who) { doc.text(winansi('Établi par : ' + who), M, y); y += 5; } doc.setTextColor(0); y += 3; }
      doc.setFontSize(10.5);
      for (const [k, v] of rows) {
        const lines = doc.splitTextToSize(winansi(v || '—'), VW), h = Math.max(7, lines.length * 5 + 3);
        if (y + h > 275) { doc.addPage(); head(); y = 24; }
        doc.setFillColor(238, 246, 249); doc.rect(M, y, LW, h, 'F'); doc.setDrawColor(170); doc.rect(M, y, LW, h); doc.rect(M + LW, y, W - 2 * M - LW, h);
        doc.setFont('helvetica', 'bold'); doc.text(winansi(k), M + 2, y + 5); doc.setFont('helvetica', 'normal'); doc.text(lines, M + LW + 2, y + 5); y += h;
      }
      if (y > 250) { doc.addPage(); head(); y = 24; }
      doc.text(winansi(`${pr.fonction || 'Technicien'} : ${[pr.prenom, pr.nom].filter(Boolean).join(' ')}      Signature : ______________________`), M, y + 18);
      doc.setFontSize(8); doc.setTextColor(120); doc.text(winansi(`Document généré par BioMaint IA le ${fmt(new Date())}${pr.structure ? '  -  ' + pr.structure : ''}`), M, 288);
      const file = slug(name) + '.pdf'; await saveShare(file, doc.output('datauristring').split(',')[1], true); return { path: file };
    },
    exportReport: async r => {
      if (!window.jspdf) throw new Error('Générateur PDF indisponible.');
      const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 15, pr = getProfile(), who = whoLine(pr); let y = 0;
      const head = () => { doc.setFillColor(10, 90, 115); doc.rect(0, 0, W, 14, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('BioMaint IA', M, 9.5);
        if (pr.structure) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(winansi(doc.splitTextToSize(pr.structure, 110)[0]), W - M, 9.5, { align: 'right' }); } doc.setTextColor(0); };
      const need = h => { if (y + h > 278) { doc.addPage(); head(); y = 24; } };
      const title = t => { need(16); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(10, 90, 115); doc.text(winansi(t), M, y); doc.setTextColor(0); y += 6; };
      const table = (heads, rows, ws) => {
        if (!rows.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.text('Aucun élément.', M, y); y += 9; return; }
        const line = (cells, bold) => {
          doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9);
          const L = cells.map((c, i) => doc.splitTextToSize(winansi(c || '-'), ws[i] - 3)), h = Math.max(...L.map(l => l.length)) * 4.2 + 3; need(h); let x = M;
          L.forEach((l, i) => { if (bold) { doc.setFillColor(238, 246, 249); doc.rect(x, y, ws[i], h, 'F'); } doc.setDrawColor(170); doc.rect(x, y, ws[i], h); doc.text(l, x + 1.5, y + 4.5); x += ws[i]; }); y += h;
        };
        line(heads, true); rows.forEach(x => line(x, false)); y += 7;
      };
      head(); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(10, 90, 115); doc.text(winansi(r.title || 'Rapport de maintenance'), M, 28);
      doc.setFontSize(12); doc.setTextColor(60); doc.setFont('helvetica', 'normal'); doc.text(winansi(String(r.label).replace(/^./, c => c.toUpperCase())), M, 35); doc.setTextColor(0); y = 44;
      if (who || pr.structure) { doc.setFontSize(10); doc.setTextColor(60); if (pr.structure) { doc.text(winansi('Structure : ' + pr.structure), M, y); y += 5; } if (who) { doc.text(winansi('Établi par : ' + who), M, y); y += 5; } doc.setTextColor(0); y += 3; }
      r.kpis.forEach((k, i) => { const x = M + (i % 3) * 61, yy = y + Math.floor(i / 3) * 21; doc.setFillColor(238, 246, 249); doc.setDrawColor(170); doc.roundedRect(x, yy, 58, 18, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(10, 90, 115); doc.text(winansi(String(k[1])), x + 4, yy + 8.5); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(winansi(k[0]), x + 4, yy + 14.5); doc.setTextColor(0); });
      y += Math.ceil(r.kpis.length / 3) * 21 + 6;
      title('Interventions de la période'); table(['Date', 'Équipement', 'Type', 'Statut final', 'Travaux effectués'], r.interventions, [22, 38, 24, 30, 66]);
      title('Équipements à surveiller (risque prédictif)'); table(['Équipement', 'Score', 'Niveau', 'Facteurs'], r.risks, [50, 20, 24, 86]);
      title('Échéances à traiter (retards et 30 jours suivants)'); table(['Équipement', 'Échéance', 'Situation'], r.upcoming, [70, 40, 70]);
      need(30); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text(winansi(`${pr.fonction || 'Technicien'} : ${[pr.prenom, pr.nom].filter(Boolean).join(' ')}      Signature : ______________________`), M, y + 12);
      const n = doc.getNumberOfPages(); for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120); doc.text(winansi(`Document généré par BioMaint IA le ${fmt(new Date())}${pr.structure ? '  -  ' + pr.structure : ''}  -  page ${p}/${n}`), M, 288); }
      const file = slug(r.name) + '.pdf'; await saveShare(file, doc.output('datauristring').split(',')[1], true); return { path: file };
    },
    checkUpdate: async () => {
      const a = await window.bioMaint.about(); if (!a.updateUrl) throw new Error("Adresse de mise à jour non configurée (about.json › updateUrl).");
      const r = await fetch(a.updateUrl + (a.updateUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(`Serveur de mise à jour injoignable (${r.status}).`);
      const j = await r.json(), cur = a.version || '1.0.0';
      return { current: cur, latest: String(j.version || ''), url: j.url || '', notes: j.notes || '', newer: !!j.version && cmpVer(j.version, cur) > 0 };
    },
    openUrl: u => { if (/^https:\/\//.test(u)) window.open(u, '_blank'); },
    exportData: async () => {
      const name = `biomaint-sauvegarde-${fmt(new Date())}.json`;
      await saveShare(name, JSON.stringify({ app: 'BioMaint IA', exportedAt: new Date().toISOString(), profile: getProfile(), data: Object.assign(EMPTY(), LS('bm_data') || {}) }, null, 1), false); return { path: name };
    },
    importData: async () => {
      const f = await pickFile('.json,application/json'); if (!f) return { canceled: true };
      let j; try { j = JSON.parse(await f.text()); } catch { throw new Error('Fichier illisible.'); }
      const d = j.data || j; if (!Array.isArray(d.equipments) || !Array.isArray(d.interventions)) throw new Error("Ce fichier n'est pas une sauvegarde BioMaint IA.");
      const clean = Object.assign(EMPTY(), d); setLS('bm_data', clean); planSoon(clean);
      if (j.profile && typeof j.profile === 'object' && (j.profile.nom || j.profile.prenom || j.profile.structure)) setLS('bm_profile', Object.assign(PROFILE0(), j.profile));
      return { ok: true, data: clean, profile: getProfile() };
    },
    badge: async n => { const bd = P().Badge; if (!bd) return; try { n > 0 ? await bd.set({ count: n }) : await bd.clear(); } catch { } },
    native: async (title, text) => {
      const ln = await notifier(); if (!ln) return;
      try { await ln.schedule({ notifications: [{ id: 1e9 + Math.floor(Math.random() * 9e8), title, body: text, channelId: 'maint', schedule: { at: new Date(Date.now() + 400) } }] }); } catch { }
    }
  };
})();
