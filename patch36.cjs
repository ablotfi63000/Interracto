const fs = require(String.fromCharCode(102,115));
const Q = String.fromCharCode(34);
const hf = String.fromCharCode(47,97,112,112,47,115,114,99,47,72,111,115,116,46,106,115,120);
let h = fs.readFileSync(hf, String.fromCharCode(117,116,102,56));
const S = `  async function startRun() {`;
const E = `\n  async function focusActivity(a) {`;
const si = h.indexOf(S);
const ei = h.indexOf(E, si);
if (si < 0) { console.log(`START INTROUVABLE`); process.exit(1); }
if (ei < 0) { console.log(`FIN INTROUVABLE`); process.exit(1); }
const clean = `  async function startRun() {
    if (!acts.length) { setMsg(${Q}Aucune question dans la seance.${Q}); return; }
    stopRun();
    setPlaying(true);
    let i = 0;
    const step = async () => {
      if (i >= acts.length) { stopRun(); return; }
      const a = acts[i];
      await focusActivity(a);
      const oup = await supabase.from(${Q}activities${Q}).update({ status: ${Q}open${Q}, revealed: false, opened_at: new Date().toISOString() }).eq(${Q}id${Q}, a.id);
      if (oup.error) {
        const oup2 = await supabase.from(${Q}activities${Q}).update({ status: ${Q}open${Q}, opened_at: new Date().toISOString() }).eq(${Q}id${Q}, a.id);
        if (oup2.error) { setMsg(${Q}Defile : ${Q} + oup2.error.message); stopRun(); return; }
        setMsg(${Q}Defile : ouverture en version simple (${Q} + oup.error.message + ${Q})${Q});
      }
      const dur = Math.max(10, a.duration_sec || 30);
      playTimer.current = setTimeout(() => {
        setRevealed(true);
        supabase.from(${Q}activities${Q}).update({ status: ${Q}closed${Q}, revealed: true }).eq(${Q}id${Q}, a.id);
        i++;
        playGap.current = setTimeout(step, 7000);
      }, dur * 1000);
    };
    step();
  }

`;
h = h.slice(0, si) + clean + h.slice(ei);
const bad = h.match(/[«»]/g);
if (bad) { console.log(`GUILLEMETS FRANCAIS RESTANTS : ` + bad.length + ` (fichier non modifie)`); process.exit(1); }
fs.writeFileSync(hf, h);
console.log(`PATCH OK`);
