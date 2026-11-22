'use strict';
const $ = s => document.querySelector(s), api = window.bioMaint;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addM = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setMonth(d.getMonth() + n); return fmt(d); };
const dleft = s => Math.round((new Date(s + 'T00:00:00') - new Date(fmt(new Date()) + 'T00:00:00')) / 864e5);
const msg = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const STAT = ['Opérationnel', 'En maintenance', 'En panne', 'Hors service'];
let S = { equipments: [], interventions: [], notifs: [], manuals: {}, settings: { provider: 'gemini', model: '' }, keys: {}, about: {}, profile: {} };
let tab = 'dash', pending = [];

const save = () => api.save({ equipments: S.equipments, interventions: S.interventions, notifs: S.notifs, manuals: S.manuals });
const due = e => e.nextDue || ((e.freqMonths && (e.lastMaint || e.installDate)) ? addM(e.lastMaint || e.installDate, +e.freqMonths) : null);
const profOk = () => !!(S.profile?.prenom && S.profile?.nom && S.profile?.structure);
const profName = () => [S.profile?.prenom, S.profile?.nom].filter(Boolean).join(' ');
const FONCTIONS = ['Technicien biomédical', 'Ingénieur biomédical', 'Responsable maintenance', 'Stagiaire / étudiant', 'Autre'];
function openProfile(first) {
  const cur = Object.assign({ fonction: FONCTIONS[0] }, S.profile || {});
  const F = [{ n: 'prenom', l: 'Prénom', r: 1 }, { n: 'nom', l: 'Nom', r: 1 }, { n: 'structure', l: 'Structure / établissement où vous opérez', r: 1 },
    { n: 'fonction', l: 'Fonction', t: 'select', o: [...new Set([cur.fonction, ...FONCTIONS].filter(Boolean))].map(f => [f, f]) }];
  const d = $('#dlg');
  form(first ? 'Bienvenue — votre profil' : 'Mon profil', F, cur, async v => {
    const cap = x => x.trim().replace(/\s+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').replace(/([-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    d.oncancel = null;
    S.profile = await api.setProfile({ prenom: cap(v.prenom), nom: v.nom.trim().toUpperCase(), structure: v.structure.trim(), fonction: v.fonction });
    notify('info', '👤 Profil enregistré : il apparaîtra sur vos fiches et rapports PDF.'); render();
  }, '<p class="mu">Ces informations sont inscrites sur les fiches d\'intervention et les rapports PDF. Elles restent sur cet appareil et sont modifiables à tout moment dans Réglages › Mon profil.</p>');
  if (first) { d.querySelector('[data-act="cancel"]')?.remove(); d.oncancel = e => e.preventDefault(); }
}
const eqName = id => S.equipments.find(e => e.id === id)?.name || '(supprimé)';

// Score de risque par règles pondérées (retard 40, correctives 25, âge 15, statut 20) — détaillé pour expliquer le score
function riskParts(e, off = 0) {
  const o = { retard: 0, correctives: 0, age: 0, statut: 0 }, d = due(e);
  if (d) { const n = dleft(d) - off; o.retard = n < 0 ? Math.min(40, 10 + (-n) * .5) : n <= 7 ? 10 : 0; }
  const c = S.interventions.filter(i => i.equipmentId === e.id && i.type === 'Corrective' && dleft(i.date) >= -365).length;
  o.correctives = Math.min(25, c * 8);
  if (e.installDate) o.age = Math.min(15, Math.max(0, (-dleft(e.installDate) + off) / 365) * 2);
  o.statut = { 'En panne': 20, 'Hors service': 20, 'En maintenance': 10 }[e.status] || 0;
  return o;
}
const risk = (e, off = 0) => Math.round(Math.min(100, Object.values(riskParts(e, off)).reduce((a, b) => a + b, 0)));
const lvl = r => r >= 60 ? ['Élevé', 'er'] : r >= 30 ? ['Moyen', 'wa'] : ['Faible', 'ok'];

const TITLES = { crit: '🚨 URGENT — BioMaint IA', high: '⚠️ À traiter — BioMaint IA', mid: '⏰ Rappel — BioMaint IA' };
const health = () => { const E = S.equipments; return E.length ? Math.round(100 - E.reduce((a, e) => a + risk(e), 0) / E.length) : 100; };
function toast(level, text) {
  let c = $('#toasts'); if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = 'toast ' + level; t.textContent = text; t.onclick = () => t.remove();
  c.appendChild(t); while (c.children.length > 3) c.firstChild.remove();
  setTimeout(() => t.remove(), level === 'crit' ? 9000 : 6000);
}
function notify(level, text, key) {
  if (key && S.notifs.some(n => n.key === key)) return;
  S.notifs.unshift({ id: uid(), ts: Date.now(), level, text, read: false, key });
  S.notifs = S.notifs.slice(0, 100); save(); updateBadges(); toast(level, text);
  navigator.vibrate?.(level === 'crit' ? [200, 80, 200] : level === 'info' ? 0 : 90);
  if (TITLES[level]) api.native(TITLES[level], text);
}
function checkDue() {
  const today = fmt(new Date()); let urg = 0, soon = 0;
  for (const e of S.equipments) {
    const d = due(e), r = risk(e);
    if (d) {
      const n = dleft(d), k = `${e.id}:${d}:${n}`;
      if (n < 0) { urg++; notify(-n >= 7 ? 'crit' : 'high', `🚨 ${e.name} : ${-n} j de retard. Chaque jour compte — lance l'intervention aujourd'hui.`, `${e.id}:late:${today}`); }
      else if (n === 0) { soon++; notify('high', `🔥 ${e.name} : c'est AUJOURD'HUI. Outils prêts, on y va.`, k); }
      else if (n === 1) { soon++; notify('high', `⏰ Demain : ${e.name}. Prépare les pièces dès maintenant.`, k); }
      else if (n === 3) { soon++; notify('mid', `📅 J-3 pour ${e.name}. Cale le créneau avec le service ${e.service || 'concerné'}.`, k); }
      else if (n === 7) { soon++; notify('mid', `🗓️ J-7 : ${e.name} arrive. Anticipe, c'est moins cher qu'une panne.`, k); }
    }
    if (r >= 60) notify(r >= 80 ? 'crit' : 'high', `📈 ${e.name} : risque ${r}/100. Le modèle voit une panne approcher — agis avant elle.`, `${e.id}:risk:${today}`);
  }
  if (S.equipments.length) notify('mid', `☀️ Briefing du jour : ${urg} urgence(s), ${soon} échéance(s) proche(s), santé du parc ${health()}/100.`, `brief:${today}`);
}

function bar(c, labels, vals, cols) {
  const k = devicePixelRatio, x = c.getContext('2d'), w = c.width = c.clientWidth * k, h = c.height = c.clientHeight * k;
  const m = Math.max(1, ...vals), bw = w / labels.length; x.font = `${12 * k}px sans-serif`; x.textAlign = 'center';
  labels.forEach((l, i) => {
    const bh = (h - 44 * k) * vals[i] / m, col = cols[i % cols.length];
    x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 12; x.fillRect(i * bw + bw * .2, h - 20 * k - bh, bw * .6, bh); x.shadowBlur = 0;
    x.fillStyle = '#7d9bb2'; x.fillText(l, i * bw + bw / 2, h - 5 * k);
    x.fillStyle = '#e4f3ff'; x.fillText(vals[i], i * bw + bw / 2, h - 25 * k - bh);
  });
}

const PERIODS = [['day', 'Journalier'], ['week', 'Hebdomadaire'], ['month', 'Mensuel'], ['quarter', 'Trimestriel'], ['semester', 'Semestriel'], ['year', 'Annuel'], ['custom', 'Personnalisé (dates au choix)']];
const frd = s => s.split('-').reverse().join('/');
function periodSpec(v) {
  const r = new Date((v.ref || fmt(new Date())) + 'T00:00:00'), y = r.getFullYear(), m = r.getMonth(), d = r.getDate(), p = v.period;
  let f, t, label, title = 'Rapport ' + ({ day: 'journalier', week: 'hebdomadaire', month: 'mensuel', quarter: 'trimestriel', semester: 'semestriel', year: 'annuel' }[p] || "d'activité") + ' de maintenance';
  if (p === 'custom') { f = v.from; t = v.to; if (!f || !t || f > t) return null; label = `Du ${frd(f)} au ${frd(t)}`; }
  else {
    const S0 = { day: [y, m, d, y, m, d], week: [y, m, d - ((r.getDay() + 6) % 7), y, m, d - ((r.getDay() + 6) % 7) + 6], month: [y, m, 1, y, m + 1, 0], quarter: [y, m - m % 3, 1, y, m - m % 3 + 3, 0], semester: [y, m < 6 ? 0 : 6, 1, y, m < 6 ? 6 : 12, 0], year: [y, 0, 1, y, 12, 0] }[p];
    f = fmt(new Date(S0[0], S0[1], S0[2])); t = fmt(new Date(S0[3], S0[4], S0[5]));
    label = { day: `Journée du ${frd(f)}`, week: `Semaine du ${frd(f)} au ${frd(t)}`, month: new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), quarter: `Trimestre ${Math.floor(m / 3) + 1} - ${y}`, semester: `Semestre ${m < 6 ? 1 : 2} - ${y}`, year: `Année ${y}` }[p];
  }
  return { f, t, label, title, name: `rapport-${p}-${f}${f === t ? '' : '_' + t}` };
}
function periodReport(sp) {
  const E = S.equipments, I = S.interventions.filter(i => i.date >= sp.f && i.date <= sp.t).sort((a, b) => a.date.localeCompare(b.date)), H = health();
  const pre = I.filter(i => i.type === 'Préventive').length, cor = I.length - pre, dispo = E.length ? Math.round(E.filter(e => e.status === 'Opérationnel').length / E.length * 100) : 100;
  const L = new Date(sp.t + 'T00:00:00'); L.setDate(L.getDate() + 30); const lim = fmt(L);
  const WHY = { retard: 'retard', correctives: 'pannes récentes', age: 'âge', statut: 'statut' };
  return { name: sp.name, label: sp.label, title: sp.title,
    kpis: [['Équipements suivis', E.length], ['Disponibilité du parc', dispo + ' %'], ['Santé du parc', H + '/100'], ['Interventions sur la période', I.length], ['Préventives', pre + (I.length ? ' (' + Math.round(pre / I.length * 100) + ' %)' : '')], ['Correctives', cor]],
    interventions: I.map(i => [frd(i.date), eqName(i.equipmentId), i.type, i.finalStatus, i.desc]),
    risks: E.map(e => [e, risk(e)]).filter(x => x[1] >= 30).sort((a, b) => b[1] - a[1]).map(([e, s]) => [e.name, s + '/100', lvl(s)[0], Object.entries(riskParts(e)).filter(x => x[1] > 0).map(x => WHY[x[0]]).join(', ')]),
    upcoming: E.filter(e => due(e) && due(e) <= lim).sort((a, b) => due(a).localeCompare(due(b))).map(e => { const n = dleft(due(e)); return [e.name, frd(due(e)), n < 0 ? 'En retard de ' + (-n) + ' j' : n === 0 ? "Aujourd'hui" : 'Dans ' + n + ' j']; }) };
}
const kpi = (l, v, c = '') => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`;
const views = {
  dash() {
    const E = S.equipments, R = E.map(e => [e, risk(e)]), H = health(), p = S.settings.provider;
    const late = E.filter(e => due(e) && dleft(due(e)) < 0).length, soon = E.filter(e => due(e) && dleft(due(e)) >= 0 && dleft(due(e)) <= 7).length;
    const down = E.filter(e => ['En panne', 'Hors service'].includes(e.status)).length;
    const dispo = E.length ? Math.round(E.filter(e => e.status === 'Opérationnel').length / E.length * 100) : 100;
    const I = S.interventions.filter(i => dleft(i.date) >= -365), tp = I.length ? Math.round(I.filter(i => i.type === 'Préventive').length / I.length * 100) : 0;
    const mood = H >= 75 ? ['Parc sous contrôle', 'ok'] : H >= 50 ? ['Vigilance requise', 'wa'] : ['Alerte maintenance', 'er'];
    const top = R.filter(x => x[1] >= 30).sort((a, b) => b[1] - a[1]).slice(0, 5), un = S.notifs.filter(n => !n.read).length;
    const rad = E.filter(e => due(e) && dleft(due(e)) <= 30).sort((a, b) => dleft(due(a)) - dleft(due(b))).slice(0, 8);
    const WHY = { retard: 'Retard de maintenance', correctives: 'Pannes récentes', age: 'Âge', statut: 'Statut actuel' };
    return `<section class="hero"><svg class="ring" viewBox="0 0 140 140" role="img" aria-label="Indice de santé ${H} sur 100"><circle cx="70" cy="70" r="54" fill="none" stroke="#12435c" stroke-width="10"/><circle cx="70" cy="70" r="54" fill="none" class="arc ${mood[1]}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(339.3 * H / 100).toFixed(1)} 339.3" transform="rotate(-90 70 70)"/><text x="70" y="76" text-anchor="middle" class="rv">${H}</text><text x="70" y="96" text-anchor="middle" class="rl">santé du parc</text></svg>
<div><h2 class="${mood[1]}">${mood[0]}</h2>${profOk() ? `<p class="mu who">👤 ${esc(profName())}${S.profile.fonction ? ' · ' + esc(S.profile.fonction) : ''} — ${esc(S.profile.structure)}</p>` : `<p class="who"><button class="ghost" data-act="edit-profile">Compléter mon profil</button></p>`}<div class="chips"><span class="tag er">${late} en retard</span><span class="tag wa">${soon} sous 7 j</span><span class="tag ${down ? 'er' : 'ok'}">${down} en panne</span></div><svg class="ecg" viewBox="0 0 300 40" aria-hidden="true"><path d="M0 22h80l10-16 14 32 12-24 10 8h174" fill="none" stroke="#3de0f5" stroke-width="2"/></svg></div></section>
<div class="kpis">${kpi('Disponibilité du parc', dispo + ' %', dispo < 80 ? 'er' : '')}${kpi('Maintenance préventive (12 mois)', tp + ' %', tp < 50 ? 'wa' : '')}${kpi('Équipements suivis', E.length)}${kpi('Interventions (12 mois)', I.length)}</div>
<section><h3>Radar des échéances — 30 jours</h3>${rad.map(e => { const n = dleft(due(e)), c = n < 0 ? 'er' : n <= 3 ? 'wa' : 'ok'; return `<div class="row"><b>${esc(e.name)}</b><svg class="trk" viewBox="0 0 200 14" aria-hidden="true"><line x1="0" y1="7" x2="200" y2="7" stroke="#12435c" stroke-width="2"/><circle cx="${Math.max(6, Math.min(194, n < 0 ? 6 : n / 30 * 200))}" cy="7" r="5" class="mk ${c}"/></svg><span class="tag ${c}">${n < 0 ? 'En retard de ' + (-n) + ' j' : n === 0 ? "Aujourd'hui" : 'Dans ' + n + ' j'}</span></div>`; }).join('') || '<p class="mu">Aucune échéance dans les 30 prochains jours.</p>'}</section>
<section><h3>Priorités prédictives</h3>${top.map(([e, s]) => { const w = riskParts(e); return `<div class="row"><b>${esc(e.name)}</b><span class="tag ${lvl(s)[1]}">${lvl(s)[0]} · ${s}/100</span><span class="why">${Object.entries(w).filter(x => x[1] > 0).map(x => `<span>${WHY[x[0]]} +${Math.round(x[1])}</span>`).join('')}</span></div>`; }).join('') || '<p class="mu">Aucun équipement à risque : le modèle ne voit rien venir.</p>'}</section>
<div class="grid2"><section><h3>Répartition du risque</h3><canvas id="c1"></canvas></section><section><h3>Interventions sur 6 mois</h3><canvas id="c2"></canvas></section></div>
<section><h3>Assistant IA</h3><div class="chips"><span class="tag ${S.keys[p] ? 'ok' : 'wa'}">${S.keys[p] ? (p === 'claude' ? 'Claude' : 'Gemini') + ' connecté' : 'Clé IA absente'}</span><span class="tag ${navigator.onLine ? 'ok' : 'wa'}">${navigator.onLine ? 'En ligne' : 'Hors ligne'}</span><span class="tag">${Object.keys(S.manuals).length} recherche(s) en mémoire</span></div><div class="btns"><button class="ghost" data-act="goto" data-id="manuals">Chercher un manuel</button></div></section>
<section id="notifs"><h3>Notifications ${un ? `<span class="tag er">${un} non lue(s)</span>` : ''}<button class="ghost sp" data-act="readall">Tout marquer lu</button></h3>${S.notifs.slice(0, 12).map(n => `<div class="row lvl-${n.level} ${n.read ? '' : 'unread'}" data-act="read" data-id="${n.id}"><span class="dot ${n.level}"></span><span>${esc(n.text)}</span><small>${new Date(n.ts).toLocaleString('fr-FR')}</small></div>`).join('') || '<p class="mu">Aucune notification. Tout est calme.</p>'}</section>`;
  },
  equip() {
    return `<div class="bar"><h2>Équipements</h2><button data-act="add-eq">Ajouter un équipement</button></div><input id="eqf" type="search" placeholder="Rechercher (nom, marque, service, statut)…" style="margin-bottom:12px"><section>${S.equipments.map(e => {
      const r = risk(e), d = due(e);
      return `<div class="row"><b>${esc(e.name)}</b><span>${esc(e.brand)} ${esc(e.model)}</span><span class="mu">${esc(e.service || '')}</span><span class="tag ${['En panne', 'Hors service'].includes(e.status) ? 'er' : e.status === 'En maintenance' ? 'wa' : 'ok'}">${esc(e.status)}</span><span class="mu">${d ? 'Échéance ' + d : 'Sans échéance'}</span><span class="tag ${lvl(r)[1]}">${r}/100</span><span class="sp"><button class="ghost" data-act="find" data-id="${e.id}">Manuel</button> <button class="ghost" data-act="edit-eq" data-id="${e.id}">Modifier</button> <button class="del" data-act="del-eq" data-id="${e.id}">Supprimer</button></span></div>`;
    }).join('') || '<p class="mu">Aucun équipement. Ajoutez le premier pour démarrer le suivi.</p>'}</section>`;
  },
  interv() {
    return `<div class="bar"><h2>Interventions</h2><span><button class="ghost" data-act="add-rep">Rapport</button> <button data-act="add-int">Nouvelle intervention</button></span></div><section>${[...S.interventions].sort((a, b) => b.date.localeCompare(a.date)).map(i =>
      `<div class="row"><b>${esc(i.date)}</b><span>${esc(eqName(i.equipmentId))}</span><span class="tag ${i.type === 'Corrective' ? 'wa' : 'ok'}">${esc(i.type)}</span><span class="mu">→ ${esc(i.finalStatus)}</span><span class="sp"><button class="ghost" data-act="pdf" data-id="${i.id}">Exporter en PDF</button> <button class="del" data-act="del-int" data-id="${i.id}">Supprimer</button></span></div>`).join('') || '<p class="mu">Aucune intervention enregistrée.</p>'}</section>`;
  },
  manuals() {
    const opt = (a, sel) => a.map(o => `<option value="${o[0]}" ${o[0] === sel ? 'selected' : ''}>${o[1]}</option>`).join('');
    const L = [['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['pt', 'Portugais'], ['ar', 'Arabe']];
    const p = S.settings.provider, ok = S.keys[p];
    return `<section><h3>Recherche de manuel ${ok ? '' : '<span class="tag wa">clé IA absente — voir Réglages</span>'}</h3>
<label>Équipement enregistré<select id="meq"><option value="">— saisie libre —</option>${S.equipments.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
<div class="grid2"><label>Marque<input id="mb"></label><label>Modèle<input id="mm"></label></div>
<div class="grid2"><label>Type de document<select id="mt">${opt([['Tous', 'Tous les manuels'], ['Manuel utilisateur', 'Manuel utilisateur'], ['Manuel de maintenance', 'Manuel de maintenance'], ['Guide de dépannage', 'Guide de dépannage']])}</select></label>
<label>Langue souhaitée<select id="ml">${opt(L)}</select></label></div>
<div class="btns"><button data-act="search">Rechercher</button></div></section>
<section><h3>Résultat</h3><pre id="res" class="mu">Aucune recherche lancée. Vérifiez toujours les liens et valeurs sur le document officiel.</pre></section>
<section><h3>Traduire un manuel (PDF ou texte)</h3><label>Langue cible<select id="tl">${opt(L)}</select></label><div class="btns"><button data-act="translate">Choisir un fichier et traduire</button></div><p id="tmsg" class="mu"></p></section>`;
  },
  settings() {
    const p = S.settings.provider, a = S.about || {}, pf = S.profile || {};
    return `<section><h3>Mon profil</h3>${profOk() ? `<p><b>${esc(profName())}</b>${pf.fonction ? ' — ' + esc(pf.fonction) : ''}</p><p class="mu">${esc(pf.structure)}</p>` : '<p class="mu">Profil incomplet : renseignez votre nom, prénom et structure pour les faire figurer sur vos PDF.</p>'}
<div class="btns"><button data-act="edit-profile">${profOk() ? 'Modifier mon profil' : 'Renseigner mon profil'}</button></div></section>
<section><h3>Paramètres IA</h3>
<label>Fournisseur<select id="prov"><option value="gemini" ${p === 'gemini' ? 'selected' : ''}>Google Gemini (niveau gratuit)</option><option value="claude" ${p === 'claude' ? 'selected' : ''}>Anthropic Claude</option></select></label>
<label>Modèle (facultatif)<input id="mdl" value="${esc(S.settings.model)}" placeholder="${p === 'claude' ? 'claude-haiku-5-5' : 'gemini-2.5-flash'}"></label>
<label>Clé API ${S.keys[p] ? '<span class="tag ok">enregistrée</span>' : '<span class="tag wa">absente</span>'}<input id="key" type="password" autocomplete="off" placeholder="Collez votre clé ici"></label>
<div class="btns"><button class="ghost" data-act="testkey">Tester la clé</button><button data-act="savekey">Enregistrer</button></div><p id="kmsg" class="mu"></p>
<p class="mu">Créez votre clé : Gemini sur aistudio.google.com/apikey, Claude sur platform.claude.com/settings/keys. La clé est chiffrée et reste sur cet appareil. L'usage est facturé par le fournisseur selon votre compte.</p></section>
<section><h3>Mises à jour</h3><p>Version installée : <b>v${esc(a.version || '1.0.0')}</b></p><p id="umsg" class="mu"></p>
<div class="btns"><button class="ghost" data-act="checkupdate">Vérifier les mises à jour</button></div></section>
<section><h3>Sauvegarde des données</h3><p class="mu">Exporte équipements, interventions et notifications dans un fichier (les clés API et le code d'accès ne sont pas inclus). Fais une sauvegarde avant d'installer une nouvelle version ou de changer de téléphone.</p><p id="bmsg" class="mu"></p>
<div class="btns"><button class="ghost" data-act="importdata">Restaurer</button><button data-act="exportdata">Sauvegarder</button></div></section>
<section><h3>À propos</h3><p><b>${esc(a.author)}</b> — ${esc(a.role)}</p><p class="mu">${esc(a.bio)}</p></section>`;
  }
};
const after = {
  dash() {
    const c = [0, 0, 0]; S.equipments.forEach(e => { const r = risk(e); c[r >= 60 ? 2 : r >= 30 ? 1 : 0]++; });
    bar($('#c1'), ['Faible', 'Moyen', 'Élevé'], c, ['#6ef3c5', '#ffb454', '#ff6b6b']);
    const L = [], K = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); K.push(fmt(d).slice(0, 7)); L.push(d.toLocaleDateString('fr-FR', { month: 'short' })); }
    bar($('#c2'), L, K.map(k => S.interventions.filter(i => i.date.startsWith(k)).length), ['#3de0f5']);
  }
};
let lastUnread = 0;
function updateBadges() {
  const u = S.notifs.filter(n => !n.read), n = u.length, txt = n > 99 ? '99+' : String(n);
  const crit = u.some(x => x.level === 'crit');
  ['bellN', 'tabN'].forEach(id => {
    const b = document.getElementById(id); if (!b) return;
    b.hidden = !n; b.textContent = txt; b.classList.toggle('crit', crit);
    if (n > lastUnread) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  });
  lastUnread = n;
  api.badge?.(n);
  try { navigator.setAppBadge ? (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()) : 0; } catch { }
  document.title = n ? `(${n}) BioMaint IA` : 'BioMaint IA';
}
function render() {
  updateBadges();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#banner').hidden = navigator.onLine; $('main').innerHTML = views[tab](); after[tab]?.();
  $('#by').textContent = S.about?.author ? 'Créé par ' + S.about.author : '';
}

function form(title, fields, vals, onOk, extra = '') {
  const d = $('#dlg');
  d.innerHTML = `<form><h3>${title}</h3>${fields.map(f => `<label>${f.l}${f.t === 'select'
    ? `<select name="${f.n}">${f.o.map(o => `<option value="${esc(o[0])}" ${o[0] === vals[f.n] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
    : f.t === 'area' ? `<textarea name="${f.n}" rows="3">${esc(vals[f.n])}</textarea>`
    : `<input name="${f.n}" type="${f.t || 'text'}" value="${esc(vals[f.n])}" ${f.r ? 'required' : ''}>`}</label>`).join('')}${extra}
<div class="btns"><button type="button" class="ghost" data-act="cancel">Annuler</button><button>Enregistrer</button></div></form>`;
  d.querySelector('form').onsubmit = e => { e.preventDefault(); onOk(Object.fromEntries(new FormData(e.target))); d.close(); };
  d.showModal();
}
const EQF = [{ n: 'name', l: 'Désignation', r: 1 }, { n: 'brand', l: 'Marque', r: 1 }, { n: 'model', l: 'Modèle', r: 1 }, { n: 'serial', l: 'N° de série' }, { n: 'service', l: 'Service utilisateur' },
  { n: 'installDate', l: "Date d'installation", t: 'date' }, { n: 'status', l: 'Statut', t: 'select', o: STAT.map(s => [s, s]) },
  { n: 'freqMonths', l: 'Fréquence de maintenance (mois)', t: 'number' }, { n: 'lastMaint', l: 'Dernière maintenance', t: 'date' },
  { n: 'nextDue', l: 'Prochaine échéance (calculée si vide)', t: 'date' }, { n: 'notes', l: 'Notes et historique', t: 'area' }];
function editEq(id) {
  const e = S.equipments.find(x => x.id === id) || { status: 'Opérationnel' };
  form(id ? "Modifier l'équipement" : 'Nouvel équipement', EQF, e, v => { Object.assign(e, v); if (!id) { e.id = uid(); S.equipments.push(e); } save(); render(); },
    '<p id="sug" class="mu"></p><button type="button" class="ghost" data-act="suggest">Suggérer la fréquence (IA)</button>');
}
function newInt() {
  if (!S.equipments.length) return alert("Ajoutez d'abord un équipement.");
  const F = [{ n: 'equipmentId', l: 'Équipement', t: 'select', o: S.equipments.map(e => [e.id, e.name]) }, { n: 'date', l: 'Date', t: 'date', r: 1 },
    { n: 'type', l: 'Type', t: 'select', o: [['Préventive', 'Préventive'], ['Corrective', 'Corrective']] }, { n: 'desc', l: 'Travaux effectués', t: 'area' },
    { n: 'parts', l: 'Pièces remplacées et consommables', t: 'area' }, { n: 'finalStatus', l: "Statut final de l'équipement", t: 'select', o: STAT.map(s => [s, s]) },
    { n: 'nextDue', l: 'Prochaine échéance recommandée (calculée si vide)', t: 'date' }];
  form('Nouvelle intervention', F, { date: fmt(new Date()), type: 'Préventive', finalStatus: 'Opérationnel' }, v => {
    v.id = uid(); const e = S.equipments.find(x => x.id === v.equipmentId);
    if (e) { e.lastMaint = v.date; e.status = v.finalStatus; v.nextDue = v.nextDue || (e.freqMonths ? addM(v.date, +e.freqMonths) : ''); e.nextDue = v.nextDue; }
    S.interventions.push(v); notify('info', `✅ ${eqName(v.equipmentId)} : intervention validée, statut « ${v.finalStatus} ». Prochaine échéance ${v.nextDue || 'à définir'}.`); save(); render();
  });
}
function pdfHtml(i) {
  const e = S.equipments.find(x => x.id === i.equipmentId) || {}, r = (a, b) => `<tr><th>${a}</th><td>${esc(b).replace(/\n/g, '<br>')}</td></tr>`;
  return `<meta charset="utf-8"><style>body{font:13px Arial;margin:30px}h1{color:#0a5a73;border-bottom:2px solid #0a5a73}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}th{width:32%;background:#eef6f9}</style>
<h1>Fiche d'intervention</h1><table>${r('Équipement', e.name)}${r('Marque / Modèle', (e.brand || '') + ' ' + (e.model || ''))}${r('N° de série', e.serial)}${r('Service', e.service)}${r('Date', i.date)}${r('Type', i.type)}${r('Travaux effectués', i.desc)}${r('Pièces / consommables', i.parts)}${r('Statut final', i.finalStatus)}${r('Prochaine échéance', i.nextDue)}</table>
<p style="margin-top:40px">${esc(S.profile?.fonction || 'Technicien')} : ${esc(profName())}${S.profile?.structure ? ' — ' + esc(S.profile.structure) : ''} — Signature : ______________</p>`;
}

function pdfRows(i) {
  const e = S.equipments.find(x => x.id === i.equipmentId) || {};
  return [['Équipement', e.name], ['Marque / Modèle', (e.brand || '') + ' ' + (e.model || '')], ['N° de série', e.serial], ['Service', e.service], ['Date', i.date], ['Type', i.type],
    ['Travaux effectués', i.desc], ['Pièces / consommables', i.parts], ['Statut final', i.finalStatus], ['Prochaine échéance', i.nextDue]];
}
async function search(p) {
  const res = t => { const r = $('#res'); if (r) r.textContent = t; }, k = [p.brand, p.model, p.docType, p.lang].join('|').toLowerCase();
  if (S.manuals[k]) return res(S.manuals[k].text);
  if (!navigator.onLine) { pending.push(p); notify('mid', `📶 Hors ligne : la recherche du manuel ${p.brand} ${p.model} partira dès que le réseau revient.`); return res('Hors ligne : la recherche sera relancée à la reconnexion.'); }
  res('Recherche en cours…');
  try { const text = await api.searchManuals(p); S.manuals[k] = { text, ts: Date.now() }; save(); notify('info', `📡 Manuel ${p.brand} ${p.model} trouvé — ouvre les liens et vérifie la source.`); res(text); }
  catch (e) { notify('high', `❌ Recherche échouée pour ${p.brand} ${p.model} : ${msg(e)}`); res('Échec : ' + msg(e)); }
}

const acts = {
  'edit-profile': () => openProfile(false),
  cancel: () => $('#dlg').close(),
  goto: id => { tab = id; render(); },
  read: id => { const n = S.notifs.find(x => x.id === id); if (n && !n.read) { n.read = true; save(); render(); } },
  'add-rep': () => form('Rapport PDF', [{ n: 'period', l: 'Type de rapport', t: 'select', o: PERIODS }, { n: 'ref', l: 'Date dans la période (jour, semaine, mois… concerné)', t: 'date' },
    { n: 'from', l: 'Personnalisé : du', t: 'date' }, { n: 'to', l: 'Personnalisé : au', t: 'date' }], { period: 'month', ref: fmt(new Date()) }, async v => {
    const sp = periodSpec(v); if (!sp) return notify('high', '❌ Rapport : choisissez deux dates valides (début avant fin).');
    try { const r = await api.exportReport(periodReport(sp)); notify('info', '📊 Rapport prêt : ' + r.path); } catch (e) { notify('high', '❌ Rapport échoué : ' + msg(e)); } }),
  'add-eq': () => editEq(), 'edit-eq': id => editEq(id), 'add-int': newInt,
  'del-eq': id => { if (confirm('Supprimer cet équipement et ses interventions ?')) { S.equipments = S.equipments.filter(e => e.id !== id); S.interventions = S.interventions.filter(i => i.equipmentId !== id); save(); render(); } },
  'del-int': id => { if (confirm('Supprimer cette intervention ?')) { S.interventions = S.interventions.filter(i => i.id !== id); save(); render(); } },
  pdf: async id => { const i = S.interventions.find(x => x.id === id); if (i) { const r = await api.exportPdf({ rows: pdfRows(i), html: pdfHtml(i), name: `intervention-${i.date}-${eqName(i.equipmentId)}` }); if (!r.canceled) notify('info', '📄 Fiche PDF prête : ' + r.path); render(); } },
  readall: () => { S.notifs.forEach(n => n.read = true); save(); render(); },
  find: id => { tab = 'manuals'; render(); $('#meq').value = id; $('#meq').dispatchEvent(new Event('change')); },
  suggest: async () => {
    const f = $('#dlg form'), brand = f.brand.value, model = f.model.value, o = $('#sug');
    if (!brand || !model) return o.textContent = 'Renseignez la marque et le modèle.';
    o.textContent = 'Recherche en cours…';
    try { const r = await api.suggest({ brand, model }); f.freqMonths.value = r.months; o.textContent = `Suggestion IA : ${r.months} mois — ${r.justification} À valider ou corriger.`; }
    catch (e) { o.textContent = 'Échec : ' + msg(e); }
  },
  search: () => {
    const p = { brand: $('#mb').value.trim(), model: $('#mm').value.trim(), docType: $('#mt').value, lang: $('#ml').value };
    if (!p.brand || !p.model) return $('#res').textContent = 'Renseignez la marque et le modèle.';
    search(p);
  },
  translate: async () => {
    const o = $('#tmsg'); o.textContent = 'Traduction en cours, patientez…';
    try { const r = await api.translate({ lang: $('#tl').value }); o.textContent = r.canceled ? '' : 'Traduction enregistrée : ' + r.path; if (!r.canceled) notify('info', '🌍 Manuel traduit et prêt : ' + r.path); }
    catch (e) { o.textContent = 'Échec : ' + msg(e); notify('high', '❌ Traduction échouée : ' + msg(e)); }
  },
  savekey: async () => {
    const o = $('#kmsg'), key = $('#key').value.trim();
    try { await api.setSettings({ provider: $('#prov').value, model: $('#mdl').value }); if (key) { await api.setKey({ provider: $('#prov').value, key }); S.keys[$('#prov').value] = true; }
      S.settings = { provider: $('#prov').value, model: $('#mdl').value }; render(); $('#kmsg').textContent = 'Paramètres enregistrés.'; }
    catch (e) { o.textContent = 'Échec : ' + msg(e); }
  },
  checkupdate: async () => {
    const o = $('#umsg'); o.textContent = 'Vérification…';
    try { const u = await api.checkUpdate();
      if (!u.newer) return o.textContent = `Vous avez la dernière version (v${u.current}).`;
      o.innerHTML = `Nouvelle version <b>v${esc(u.latest)}</b> disponible. ${esc(u.notes)} `;
      if (u.url) { const b = document.createElement('button'); b.textContent = 'Télécharger'; b.dataset.act = 'openurl'; b.dataset.id = u.url; o.appendChild(b); }
    } catch (e) { o.textContent = 'Échec : ' + msg(e); }
  },
  openurl: u => api.openUrl(u),
  exportdata: async () => { const o = $('#bmsg'); try { const r = await api.exportData(); o.textContent = 'Sauvegarde créée : ' + r.path; } catch (e) { o.textContent = 'Échec : ' + msg(e); } },
  importdata: async () => {
    const o = $('#bmsg'); if (!confirm('Remplacer toutes les données actuelles par celles du fichier ?')) return;
    try { const r = await api.importData(); if (r.canceled) return;
      Object.assign(S, { equipments: r.data.equipments, interventions: r.data.interventions, notifs: r.data.notifs, manuals: r.data.manuals }); if (r.profile) S.profile = r.profile; render(); $('#bmsg').textContent = 'Données restaurées ✓'; }
    catch (e) { o.textContent = 'Échec : ' + msg(e); }
  },
  testkey: async () => { const o = $('#kmsg'); o.textContent = 'Test en cours…'; try { await api.testKey(); o.textContent = 'Clé valide ✓'; } catch (e) { o.textContent = 'Clé refusée : ' + msg(e); } }
};
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) acts[b.dataset.act]?.(b.dataset.id); });
document.addEventListener('input', e => {
  if (e.target.id !== 'eqf') return; const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('main section .row').forEach(r => { r.hidden = !!q && !r.textContent.toLowerCase().includes(q); });
});
document.addEventListener('change', async e => {
  if (e.target.id === 'meq') { const q = S.equipments.find(x => x.id === e.target.value); if (q) { $('#mb').value = q.brand; $('#mm').value = q.model; } }
  if (e.target.id === 'prov') { S.settings.provider = e.target.value; S.settings.model = ''; await api.setSettings(S.settings); render(); }
});
document.getElementById('bell').onclick = () => { tab = 'dash'; render(); document.getElementById('notifs')?.scrollIntoView({ behavior: 'smooth' }); };
document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; render(); } };
addEventListener('offline', render);
addEventListener('online', () => { render(); pending.splice(0).forEach(p => { notify('info', `🔄 Réseau de retour : recherche ${p.brand} ${p.model} relancée.`); search(p); }); });

async function autoUpdate() {
  const k = 'bm_lastupd', t = Date.now();
  try { if (!navigator.onLine || !S.about?.updateUrl || t - (+localStorage.getItem(k) || 0) < 864e5) return; localStorage.setItem(k, t);
    const u = await api.checkUpdate(); if (u.newer) notify('high', `⬆️ BioMaint IA v${u.latest} est disponible. Va dans Réglages › Mises à jour.`, `upd:${u.latest}`); } catch { }
}
async function start() {
  const d = await api.get(); Object.assign(S, { equipments: d.equipments, interventions: d.interventions, notifs: d.notifs, manuals: d.manuals, settings: d.settings, keys: d.keys });
  S.about = await api.about(); S.profile = await api.getProfile(); checkDue(); render(); autoUpdate();
  if (!profOk()) openProfile(true);
  setInterval(() => { checkDue(); if (tab === 'dash') render(); }, 36e5);
}
(async () => {
  const st = await api.authStatus();
  $('#atitle').textContent = st.hasPin ? "Code d'accès" : "Créez votre code d'accès (4 caractères minimum)";
  $('#auth form').onsubmit = async e => {
    e.preventDefault(); const pin = $('#pin').value, r = st.hasPin ? await api.login(pin) : await api.setup(pin);
    if (r.ok) { $('#auth').hidden = true; start(); } else { $('#amsg').textContent = r.error || 'Code incorrect.'; $('#pin').value = ''; }
  };
})();
