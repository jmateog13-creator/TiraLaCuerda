'use strict';
/* =========================================================================
   PONT AULATECH · contracte v1 — compartit pels standalones
   -------------------------------------------------------------------------
   S'inclou amb un <script> normal (aquests jocs no són mòduls ES) i deixa
   `AulaTechBridge` global:

       <script src="../_bridge.js"></script>
       AulaTechBridge.send('id-del-joc', { completat: true, tempsMs: ... });

   El joc envia FETS. Mai XP: l'autoritat econòmica és submit_game_result()
   al backend, que pot canviar les recompenses sense tocar cap joc. La
   dificultat tampoc la diu el joc — viu al catàleg (★5 per als standalones).

   Sense host (joc obert sol) el postMessage no arriba enlloc i no passa res.
   ========================================================================= */
const AulaTechBridge = (function (w) {
  const clamp01 = (v) => { v = Number(v); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; };
  const int = (v) => { v = Math.round(Number(v)); return Number.isFinite(v) && v > 0 ? v : 0; };
  let cb = null;
  // Un joc pot reportar més d'un id (trilogies, súper-recompenses per completar-ho
  // tot): per això el bloqueig de duplicats és PER ID, no per sessió.
  const sent = new Set();

  w.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.source === 'aulatech-host' && d.action === 'GAME_RESULT' && cb) cb(d.data || {});
  });

  return {
    /** Rellotge de la partida: el joc el pot reiniciar quan comença de debò. */
    t0: Date.now(),
    startClock() { this.t0 = Date.now(); sent.clear(); },

    send(gameId, f) {
      f = f || {};
      const data = {
        p_juego_id: String(gameId || 'standalone'),
        p_bloque: 'general',            // els standalones barregen cualitats
        p_tema: null,
        p_completado: !!f.completat,
        p_precision: clamp01(f.precisio),
        p_errores: int(f.errors),
        p_racha_max: int(f.rachaMax),
        p_tiempo_ms: int(f.tempsMs === undefined ? Date.now() - this.t0 : f.tempsMs),
        p_perfecto: !!f.perfecte,
      };
      try { w.parent.postMessage({ source: 'aulatech', action: 'GAME_END', v: 1, data }, '*'); }
      catch (e) { /* standalone: sense host */ }
      return data;
    },

    /** Per a jocs on el final es pot re-renderitzar: cada id només reporta un cop. */
    sendOnce(gameId, f) {
      const k = String(gameId);
      if (sent.has(k)) return null;
      sent.add(k);
      return this.send(k, f);
    },

    onResult(f) { cb = f; },
  };
})(window);

// Exposat a window perquè els jocs que SÍ són mòduls ES el puguin fer servir:
// un `const` de dalt de tot d'un script clàssic no arriba a l'àmbit del mòdul.
window.AulaTechBridge = AulaTechBridge;

/* ── Sortida directa quan el joc s'obre en pestanya pròpia ───────────────────
   Dins de l'app el joc viu en un iframe i el pare (Viewer) recull el missatge.
   Però el Gimnàs obre els jocs amb target="_blank": allà `parent` és un mateix,
   el postMessage s'envia a si mateix i no arriba enlloc.
   Com que tot es serveix des del mateix origen, la sessió de l'alumne ja és al
   localStorage. Fem servir fetch contra l'API REST i NO el client del CDN:
   així no hi ha llibreria externa que carregui tard ni cursa amb la sessió.
   La clau és la publicable (ja viatja al bundle de l'app); qui protegeix les
   dades és l'RLS i que submit_game_result() decideix el pagament al servidor. */
(function () {
  if (window.parent !== window) return;   // dins de l'app: ja ho recull el pare
  if (window.__atDirecte) return;         // ja escoltat: mai dues vegades
  window.__atDirecte = true;
  var SB = 'https://dxpdciplsxjmtfhnbqao.supabase.co';
  var AK = 'sb_publishable_nOg_fx9ai3hbMOD4-ZI-Sg_V9i9VZhW';
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.source !== 'aulatech' || d.action !== 'GAME_END' || !d.data) return;
    var raw = localStorage.getItem('sb-dxpdciplsxjmtfhnbqao-auth-token');
    if (!raw) return;                     // ningú connectat: no hi ha res a reportar
    var tok; try { tok = JSON.parse(raw).access_token; } catch (_) { return; }
    if (!tok) return;
    fetch(SB + '/rest/v1/rpc/submit_game_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: AK, Authorization: 'Bearer ' + tok },
      body: JSON.stringify(d.data),
    }).catch(function () { /* sense xarxa: es perd la partida, però el joc no es trenca */ });
  });
})();
