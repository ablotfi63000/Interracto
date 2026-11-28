const fs = require("fs");
const R = "/app";
const pf = R + "/src/Participant.jsx";
let p = fs.readFileSync(pf, "utf8");
if (p.includes("activity.revealed")) { console.log("DEJA APPLIQUE"); process.exit(0); }
const A = "{activity.explanation && (activity.status === \"closed\" || answered) && (";
const B = "{activity.explanation && (answered || (activity.status === \"closed\" && activity.revealed)) && (";
const n = p.split(A).length - 1;
if (n !== 1) { console.log("BLOC INTROUVABLE (" + n + ")"); process.exit(1); }
p = p.split(A).join(B);
fs.writeFileSync(pf, p);
console.log("PATCH OK");
