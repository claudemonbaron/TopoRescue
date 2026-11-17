/*
 * TopoRescue – controllo dell'accesso per le pagine di lavoro (Carica Mappe, Estrazione)   (16 novembre 2026)
 *
 * Si mette nell'<head> di ogni pagina di lavoro, DOPO supabase-js:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="/TopoRescue/accesso.js" data-app="carica_web"></script>
 *
 * - La pagina resta nascosta finche' il controllo non e' fatto (al massimo pochi secondi).
 * - Login fatto in TopoRescue: le pagine stanno sullo stesso sito (claudemonbaron.github.io), quindi lo vedono da sole.
 * - Senza login, o con l'account sospeso: si va a TopoRescue, che dopo il login riporta qui (?torna=...).
 * - Con login: una riga nel registro accessi (app = data-app) e, in alto a destra, nome e "Esci".
 * - Dichiarazione di responsabilita' non accettata (17 nov): si va a TopoRescue ad accettarla, poi si torna qui.
 * - Se Supabase non risponde (rete assente, servizio fermo) la pagina si apre comunque: per il soccorso il lavoro
 *   non si blocca mai per colpa del controllo.
 */
(function () {
  "use strict";
  var SUPA_URL = "https://xorshypftmrbtyhrchwy.supabase.co";
  var SUPA_KEY = "sb_publishable_SghE7Wz8rNWEUVVhSpmFew_IBDCCqvk";
  var INGRESSO = "/TopoRescue/";
  var ATTESA_MAX = 8000;                       // ms: oltre, la pagina si apre comunque
  var DICHIARAZIONE = "2026-11-17";            // 17 nov: versione della dichiarazione da accettare (come index.html)
  var me = document.currentScript;
  var APP = (me && me.getAttribute("data-app")) || "pagina_web";

  var stile = document.createElement("style");
  stile.id = "tr-nascondi";
  stile.textContent = "html{visibility:hidden}";
  document.head.appendChild(stile);
  var aperta = false;
  function apri() { if (aperta) return; aperta = true; var s = document.getElementById("tr-nascondi"); if (s) s.remove(); }
  setTimeout(apri, ATTESA_MAX);

  function vaiIngresso() {
    location.replace(INGRESSO + "?torna=" + encodeURIComponent(location.pathname + location.search + location.hash));
  }
  function testo(it, en) { var l = ""; try { l = localStorage.getItem("lingua_mappe") || ""; } catch (e) {} return l && l !== "it" ? en : it; }

  function barra(sb, nome) {
    var b = document.createElement("div");
    b.style.cssText = "position:fixed;top:6px;right:8px;z-index:9999;display:flex;gap:8px;align-items:center;" +
      "font:13px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;background:rgba(127,127,127,.15);" +
      "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:4px 8px;border-radius:7px;color:inherit";
    var a = document.createElement("a");
    a.href = INGRESSO; a.textContent = nome; a.title = "TopoRescue"; a.style.cssText = "color:inherit;text-decoration:none;font-weight:600";
    var x = document.createElement("button");
    x.type = "button"; x.textContent = testo("Esci", "Sign out");
    x.style.cssText = "font:inherit;border:0;background:none;color:#e2620c;cursor:pointer;padding:0;text-decoration:underline";
    x.onclick = function () { sb.auth.signOut().finally(function () { location.replace(INGRESSO); }); };
    b.appendChild(a); b.appendChild(x);
    (document.body ? Promise.resolve() : new Promise(function (ok) { document.addEventListener("DOMContentLoaded", ok); }))
      .then(function () { document.body.appendChild(b); });
  }

  if (!window.supabase || !window.supabase.createClient) { apri(); return; }   // libreria non caricata: non si blocca
  var sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  window.TopoRescue = { client: sb };

  sb.auth.getSession().then(function (r) {
    var s = r && r.data && r.data.session;
    if (!s) { vaiIngresso(); return; }
    return sb.rpc("mio_stato").then(function (st) {
      if (st.error) { apri(); return; }                          // Supabase non risponde: si lavora lo stesso
      var d = (st.data && st.data[0]) || {};
      if (d.bloccato) { sb.auth.signOut().finally(vaiIngresso); return; }
      // 17 nov: dichiarazione di responsabilita' non ancora accettata -> la si accetta su TopoRescue, che poi riporta qui
      if ("dichiarazione" in d && d.dichiarazione !== DICHIARAZIONE) { vaiIngresso(); return; }
      var u = navigator.userAgent;
      var sis = (/Windows/.test(u) ? "Windows" : /iPhone|iPad/.test(u) ? "iOS" : /Mac/.test(u) ? "Mac" : /Android/.test(u) ? "Android" : "altro") + " / browser";
      sb.from("accessi").insert({ app: APP, versione: "web", sistema: sis }).then(function () {}, function () {});
      var md = s.user.user_metadata || {};
      window.TopoRescue.utente = { email: s.user.email, autorizzato: !!d.autorizzato };
      barra(sb, [d.nome || md.nome, md.cognome].filter(Boolean).join(" ") || s.user.email);
      apri();
    });
  }).catch(function () { apri(); });
})();
