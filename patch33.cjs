const fs = require("fs");
const R = process.env.APPDIR || "/app";
const hf = R + "/src/Host.jsx";
let h = fs.readFileSync(hf, "utf8");
if (h.includes("showStats")) { console.log("DEJA APPLIQUE"); process.exit(0); }
function rep(txt, A, B, n) {
  const c = txt.split(A).length - 1;
  if (c !== n) { console.log("BLOC INTROUVABLE (" + c + ") : " + A.slice(0, 40)); process.exit(1); }
  return txt.split(A).join(B);
}
// 1. etat du rapport
h = rep(h, "  const [board, setBoard] = useState(null);", "  const [board, setBoard] = useState(null);\n  const [stats, setStats] = useState(null);", 1);
// 2. fonction showStats
h = rep(h, "  async function showBoard() {", '  async function showStats() {\n    if (!acts.length) { setMsg("Aucune question dans la seance."); return; }\n    const ids = acts.map((a) => a.id);\n    const quizzes = acts.filter((a) => a.kind === "quiz");\n    const quizIds = quizzes.map((a) => a.id);\n    const { data: allOpts } = await supabase.from("options").select("*").in("activity_id", quizIds);\n    const { data: resps } = await supabase.from("responses").select("*").in("activity_id", ids);\n    const actById = new Map(acts.map((a) => [a.id, a]));\n    const map = new Map();\n    const seen = new Set();\n    (resps ?? []).forEach((r) => {\n      const a = actById.get(r.activity_id);\n      if (!a) return;\n      const key = r.participant_key || r.id;\n      const dedup = key + "|" + r.activity_id;\n      if (seen.has(dedup)) return;\n      seen.add(dedup);\n      const name = r.nickname || "Anonyme";\n      const p = map.get(key) || { name, answered: 0, correct: 0 };\n      p.answered++;\n      if (a.kind === "quiz") {\n        let ok = false;\n        if (a.multi) {\n          const correctSet = new Set((allOpts ?? []).filter((o) => o.activity_id === a.id && o.is_correct).map((o) => o.id));\n          ok = r.option_ids?.length === correctSet.size && r.option_ids.every((x) => correctSet.has(x));\n        } else {\n          ok = r.option_id === a.correct_id;\n        }\n        if (ok) p.correct++;\n      }\n      map.set(key, p);\n    });\n    const tot = quizzes.length;\n    setStats(\n      [...map.values()]\n        .sort((x, y) => y.correct - x.correct || y.answered - x.answered)\n        .slice(0, 20)\n        .map((p) => [p.name, p.answered, p.correct, tot])\n    );\n  }\n\n  async function showBoard() {', 1);
// 3. bouton
h = rep(h, '          <button className="btn" onClick={showBoard}>Classement</button>', '          <button className="btn" onClick={showBoard}>Classement</button>\n          <button className="btn" onClick={showStats}>Stats eleves</button>', 1);
// 4. affichage du rapport
h = rep(h, '      <div className="card">\n        <h3>Import en masse</h3>', '      {stats && (\n        <div className="card">\n          <h3>Stats eleves</h3>\n          {stats.length === 0 ? (\n            <p className="muted">Aucune reponse pour l instant.</p>\n          ) : (\n            stats.map(([name, answered, correct, tot], i) => (\n              <div key={i} className="row spread">\n                <span>{i + 1}. {name}</span>\n                <b>{answered}/{acts.length} questions - {correct}/{tot} quiz OK</b>\n              </div>\n            ))\n          )}\n        </div>\n      )}\n\n      <div className="card">\n        <h3>Import en masse</h3>', 1);
fs.writeFileSync(hf, h);
console.log("PATCH OK");
