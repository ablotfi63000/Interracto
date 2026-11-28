const fs = require("fs");
const R = "/app";
const hf = R + "/src/Host.jsx";
let h = fs.readFileSync(hf, "utf8");
if (h.includes("Defile :")) { console.log("DEJA APPLIQUE"); process.exit(0); }
function rep(txt, A, B, n) {
  const c = txt.split(A).length - 1;
  if (c !== n) { console.log("BLOC INTROUVABLE (" + c + ") : " + A.slice(0, 40)); process.exit(1); }
  return txt.split(A).join(B);
}
// 1. ouverture de la question : attendre + afficher l erreur + retenter en version simple
h = rep(h, '      supabase.from("activities").update({ status: "open", revealed: false, opened_at: new Date().toISOString() }).eq("id", a.id);',
  '      const oup = await supabase.from("activities").update({ status: "open", revealed: false, opened_at: new Date().toISOString() }).eq("id", a.id);\n      if (oup.error) {\n        setMsg("Defile : ouverture KO : " + oup.error.message);\n        const oup2 = await supabase.from("activities").update({ status: "open", opened_at: new Date().toISOString() }).eq("id", a.id);\n        if (oup2.error) { setMsg("Defile : " + oup2.error.message); stopRun(); return; }\n        setMsg("Defile : ouverture OK en version simple (" + oup.error.message + " sur revealed)");\n      }', 1);
// 2. fermeture de la question : attendre + retenter en version simple
h = rep(h, '        supabase.from("activities").update({ status: "closed", revealed: true }).eq("id", a.id);',
  '        const clp = await supabase.from("activities").update({ status: "closed", revealed: true }).eq("id", a.id);\n        if (clp.error) await supabase.from("activities").update({ status: "closed" }).eq("id", a.id);', 1);
fs.writeFileSync(hf, h);
console.log("PATCH OK");
