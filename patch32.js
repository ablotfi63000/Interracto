const fs = require("fs");
const R = "/app";
const hf = R + "/src/Host.jsx";
const cf = R + "/src/styles.css";
let h = fs.readFileSync(hf, "utf8");
if (h.includes("importBulk")) { console.log("DEJA APPLIQUE"); process.exit(0); }
function rep(txt, A, B, n) {
  const c = txt.split(A).length - 1;
  if (c !== n) { console.log("BLOC INTROUVABLE (" + c + ") : " + A.slice(0, 40)); process.exit(1); }
  return txt.split(A).join(B);
}
// 1. etat du texte d import
h = rep(h, "  const joinUrl = baseUrl()", '  const [importTxt, setImportTxt] = useState("");\n\n  const joinUrl = baseUrl()', 1);
// 2. fonction d import en masse
h = rep(h, "  async function createActivity(project) {", '  async function importBulk() {\n    const lines = (importTxt || "").split("\\n").map((l) => l.trim()).filter(Boolean);\n    if (!lines.length) { setMsg("Aucune ligne a importer."); return; }\n    let ok = 0;\n    let ko = 0;\n    for (const line of lines) {\n      try {\n        const f = line.split(";").map((s) => s.trim());\n        let type = (f[0] || "").toLowerCase();\n        const multi = type === "quizm";\n        if (type === "vf") type = "quiz";\n        if (type === "quizm") type = "quiz";\n        if (!["poll", "quiz", "cloud", "rank"].includes(type)) { ko++; continue; }\n        const question = (f[1] || "").trim();\n        if (!question) { ko++; continue; }\n        let img = null;\n        let exp = null;\n        const rest = [];\n        for (const part of f.slice(2)) {\n          if (/^img=.+/i.test(part)) img = part.slice(4);\n          else if (/^exp=.+/i.test(part)) exp = part.slice(4);\n          else rest.push(part);\n        }\n        const isCloud = type === "cloud";\n        if (!isCloud && rest.length < 2) { ko++; continue; }\n        const { data: act } = await supabase.from("activities").insert({\n          presentation_id: presId,\n          kind: type,\n          question,\n          category: null,\n          multi: type === "quiz" && multi,\n          duration_sec: type === "quiz" ? 30 : null,\n          position: acts.length + ok,\n          status: "closed",\n          image_url: img,\n          explanation: exp || null,\n        }).select().single();\n        if (!isCloud) {\n          const { data: opts } = await supabase.from("options").insert(\n            rest.map((label, i) => ({ activity_id: act.id, label: label.replace(/^\\*/, ""), position: i, is_correct: type === "quiz" && label.startsWith("*") }))\n          ).select();\n          if (type === "quiz" && !multi) {\n            const ci = rest.findIndex((l) => l.startsWith("*"));\n            if (ci >= 0 && opts && opts[ci]) {\n              await supabase.from("activities").update({ correct_id: opts[ci].id }).eq("id", act.id);\n            }\n          }\n        }\n        ok++;\n      } catch (e) { ko++; }\n    }\n    setImportTxt("");\n    await loadSession();\n    setMsg(ok + " question(s) importee(s)" + (ko ? ", " + ko + " ignoree(s) (format)." : "."));\n  }\n\n  async function createActivity(project) {', 1);
// 3. carte Import en masse avant la carte Nouvelle activite
h = rep(h, '      <div className="card">\n        <h3>Nouvelle activité</h3>', '      <div className="card">\n        <h3>Import en masse</h3>\n        <p className="muted small">Une question par ligne : type;question;reponse A;*bonne reponse;C. Types : poll, quiz (asterisque = bonne reponse), quizm (plusieurs bonnes reponses), vf, cloud, rank. Optionnel en fin de ligne : img=URL;exp=explication.</p>\n        <textarea\n          className="input"\n          rows="4"\n          placeholder="quiz;Capitale de la France ?;Lyon;*Paris;Marseille"\n          value={importTxt}\n          onChange={(e) => setImportTxt(e.target.value)}\n        />\n        <button className="btn primary" onClick={importBulk}>Importer</button>\n      </div>\n\n      <div className="card">\n        <h3>Nouvelle activité</h3>', 1);
fs.writeFileSync(hf, h);
let c = fs.readFileSync(cf, "utf8");
if (!c.includes("textarea.input")) {
  c = c + "\ntextarea.input { resize: vertical; font-family: inherit; }\n";
  fs.writeFileSync(cf, c);
}
console.log("PATCH OK");
