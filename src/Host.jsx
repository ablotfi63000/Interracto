import Qr from "./Qr.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, baseUrl } from "./lib/supabase.js";

const norm = (w) =>
  (w ?? "").toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export default function Host({ code }) {
  const [presId, setPresId] = useState(null);
  const [acts, setActs] = useState([]);
  const [current, setCurrent] = useState(null);
  const [counts, setCounts] = useState({});
  const [reactions, setReactions] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef(null);
  const playGap = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(0);
  const [msg, setMsg] = useState("");
  const [board, setBoard] = useState(null);
  const [rankData, setRankData] = useState(null);
  const [form, setForm] = useState({
    kind: "poll",
    question: "",
    options: ["", ""],
    correct: 0,
    multi: false,
    corrects: [],
    duration: 30,
  });

  const joinUrl = baseUrl() + "#/j/" + code;

  async function showActivity(activityId) {
    if (!activityId) {
      setCurrent(null);
      return;
    }
    setRevealed(false);
    supabase.from("activities").update({ revealed: false }).eq("id", activityId);
    const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
    const { data: opts } = await supabase.from("options").select("*").eq("activity_id", activityId).order("position");
    const { data: resps } = await supabase.from("responses").select("*").eq("activity_id", activityId);
    const c = {};
    (resps ?? []).forEach((r) => {
      if (r.option_ids?.length) {
        r.option_ids.forEach((oid) => {
          c[oid] = (c[oid] ?? 0) + 1;
        });
      } else if (r.option_id) {
        c[r.option_id] = (c[r.option_id] ?? 0) + 1;
      } else {
        const k = norm(r.word);
        c[k] = (c[k] ?? 0) + 1;
      }
    });
    setCounts(c);
    setCurrent({ ...act, options: opts ?? [] });
  }

  const loadSession = useCallback(async () => {
    const { data: pres } = await supabase
      .from("presentations")
      .select("id, current_activity_id")
      .eq("code", code)
      .single();
    if (!pres) {
      setMsg("Session introuvable. Créez-en une depuis l'accueil.");
      return;
    }
    setPresId(pres.id);
    const { data } = await supabase
      .from("activities")
      .select("*")
      .eq("presentation_id", pres.id)
      .order("position");
    setActs(data ?? []);
    await showActivity(pres.current_activity_id);
  }, [code]);

  useEffect(() => {
    loadSession();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadSession]);

  useEffect(() => {
    if (!revealed || current?.kind !== "rank") {
      setRankData(null);
      return;
    }
    let alive = true;
    const compute = async () => {
      const { data: resps } = await supabase.from("responses").select("option_ids").eq("activity_id", current.id);
      if (!alive) return;
      const sums = {};
      const nums = {};
      (resps ?? []).forEach((r) => {
        (r.option_ids ?? []).forEach((oid, i) => {
          sums[oid] = (sums[oid] ?? 0) + i + 1;
          nums[oid] = (nums[oid] ?? 0) + 1;
        });
      });
      setRankData(
        (current.options ?? [])
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((o, oi) => ({ label: o.label, ideal: oi, avg: nums[o.id] ? sums[o.id] / nums[o.id] : null }))
          .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99))
      );
    };
    compute();
    const t = setInterval(compute, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [revealed, current?.id, current?.kind]);

  useEffect(() => {
    const ch = supabase.channel("presence-" + code, {
      config: { presence: { key: "host" } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setOnline(Object.keys(ch.presenceState()).filter((k) => k !== "host").length);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ role: "host" });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [code]);

  useEffect(() => {
    if (!presId) return;
    const channel = supabase
      .channel("host-" + code)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "responses" },
        (p) => {
          const r = p.new;
          if (current && r.activity_id === current.id) {
            if (r.option_ids?.length) {
              setCounts((c0) => {
                const c = { ...c0 };
                r.option_ids.forEach((oid) => {
                  c[oid] = (c[oid] ?? 0) + 1;
                });
                return c;
              });
            } else if (r.option_id) {
              setCounts((c) => ({ ...c, [r.option_id]: (c[r.option_id] ?? 0) + 1 }));
            } else {
              const k = norm(r.word);
              setCounts((c) => ({ ...c, [k]: (c[k] ?? 0) + 1 }));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (p) => {
          if (p.new.presentation_id === presId) {
            setReactions((r) => ({ ...r, [p.new.emoji]: (r[p.new.emoji] ?? 0) + 1 }));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "presentations" },
        (p) => {
          if (p.new.id === presId && p.new.current_activity_id !== (current?.id ?? null)) {
            showActivity(p.new.current_activity_id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [presId, code, current?.id]);

  function stopRun() {
    setPlaying(false);
    if (playTimer.current) { clearTimeout(playTimer.current); playTimer.current = null; }
    if (playGap.current) { clearTimeout(playGap.current); playGap.current = null; }
  }

  async function startRun() {
    if (!acts.length) { setMsg("Aucune question dans la seance."); return; }
    stopRun();
    setPlaying(true);
    let i = 0;
    const step = async () => {
      if (i >= acts.length) { stopRun(); return; }
      const a = acts[i];
      await focusActivity(a);
      supabase.from("activities").update({ status: "open", revealed: false, opened_at: new Date().toISOString() }).eq("id", a.id);
      const dur = Math.max(10, a.duration_sec || 30);
      playTimer.current = setTimeout(() => {
        setRevealed(true);
        supabase.from("activities").update({ status: "closed", revealed: true }).eq("id", a.id);
        i++;
        playGap.current = setTimeout(step, 7000);
      }, dur * 1000);
    };
    step();
  }

  async function focusActivity(a) {
    await supabase.from("presentations").update({ current_activity_id: a.id }).eq("id", presId);
    await showActivity(a.id);
  }

  async function reuse(a) {
    const { data: opts } = await supabase.from("options").select("*").eq("activity_id", a.id).order("position");
    const os = opts ?? [];
    setForm({
      vf: false,
      kind: a.kind,
      question: a.question,
      image_url: a.image_url,
      explanation: a.explanation,
      options: a.kind === "cloud" ? ["", ""] : os.length ? os.map((o) => o.label) : ["", ""],
      correct: a.multi ? 0 : Math.max(0, os.findIndex((o) => o.id === a.correct_id)),
      corrects: os.map((o, i) => (o.is_correct ? i : -1)).filter((i) => i >= 0),
      multi: a.multi,
      duration: a.duration_sec ?? 30,
      category: a.category ?? "",
    });
    setMsg("Question reprise dans le formulaire : ajustez puis validez.");
  }

  async function reprogram(a) {
    const { data: act } = await supabase
      .from("activities")
      .insert({
        presentation_id: presId,
        kind: a.kind,
        question: a.question,
      image_url: a.image_url,
      explanation: a.explanation,
        multi: a.multi,
        duration_sec: a.duration_sec,
        category: a.category ?? null,
        position: acts.length,
        status: "closed",
      })
      .select()
      .single();
    const { data: opts } = await supabase
      .from("options")
      .select("*")
      .eq("activity_id", a.id)
      .order("position");
    const os = opts ?? [];
    if (os.length) {
      const { data: newOpts } = await supabase
        .from("options")
        .insert(os.map((o) => ({ activity_id: act.id, label: o.label, position: o.position, is_correct: a.multi ? o.is_correct : false })))
        .select();
      if (!a.multi && a.correct_id) {
        const src = os.find((x) => x.id === a.correct_id)?.label ?? "";
        const good = newOpts?.find((o) => o.label === src);
        if (good) await supabase.from("activities").update({ correct_id: good.id }).eq("id", act.id);
      }
    }
    await loadSession();
    setMsg("Question reprogrammee en fin de seance.");
  }

  async function toggleOpen(a) {
    const status = a.status === "open" ? "closed" : "open";
    const patch = { status };
    if (status === "open" && !a.opened_at) patch.opened_at = new Date().toISOString();
    await supabase.from("activities").update(patch).eq("id", a.id);
    setActs((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    if (current?.id === a.id) setCurrent((c) => ({ ...c, ...patch }));
  }
    async function createActivity(project) {
    const labels = form.options.map((o) => o.trim()).filter(Boolean);
    if (!form.question.trim()) return setMsg("Question vide.");
    if (form.kind !== "cloud" && labels.length < 2) return setMsg("Au moins 2 options.");
    if (form.kind === "quiz" && form.multi && !form.corrects.length) {
      return setMsg("Cochez au moins une bonne réponse (boutons OK).");
    }
    setMsg("");
    const isMulti = form.kind === "quiz" && form.multi;
    const { data: act } = await supabase
      .from("activities")
      .insert({
        presentation_id: presId,
        kind: form.kind,
        question: form.question.trim(),
        category: form.category?.trim() || null,
        image_url: form.image_url || null,
        explanation: form.explanation?.trim() || null,
        multi: isMulti,
        duration_sec: form.kind === "quiz" ? Number(form.duration) : null,
        position: acts.length,
        status: "closed",
      })
      .select()
      .single();
    if (form.kind !== "cloud") {
      const { data: opts } = await supabase
        .from("options")
        .insert(
          labels.map((label, i) => ({
            activity_id: act.id,
            label,
            position: i,
            is_correct: isMulti && form.corrects.includes(i),
          }))
        )
        .select();
      if (form.kind === "quiz" && !isMulti && opts?.[form.correct]) {
        await supabase.from("activities").update({ correct_id: opts[form.correct].id }).eq("id", act.id);
      }
    }
    setForm({ ...form, question: "", options: ["", ""], corrects: [], vf: false, image_url: null, explanation: "" });
    await loadSession();
    if (project) {
      await focusActivity(act);
    } else {
      setMsg("Question " + acts.length + " ajoutée à la séance.");
    }
  }

  async function upImg(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setMsg("Image trop lourde (max 4 Mo)."); return; }
    const name = code + "_" + Date.now() + "_" + f.name.replace(/\s+/g, "_");
    const { error } = await supabase.storage.from("images").upload(name, f, { upsert: true });
    if (error) { setMsg("Image : " + error.message); return; }
    const url = supabase.storage.from("images").getPublicUrl(name).data.publicUrl;
    setForm((prev) => ({ ...prev, image_url: url }));
    setMsg("");
  }

  async function exportCSV() {
    const ids = acts.map((a) => a.id);
    if (!ids.length) return;
    const { data: allOpts } = await supabase.from("options").select("*").in("activity_id", ids);
    const { data: resps } = await supabase.from("responses").select("*").in("activity_id", ids);
    const optById = new Map((allOpts ?? []).map((o) => [o.id, o.label]));
    const actById = new Map(acts.map((a) => [a.id, a]));
    const map = new Map();
    (resps ?? []).forEach((r) => {
      const label = r.option_ids?.length
        ? r.option_ids.map((oid) => optById.get(oid) ?? "?").join(" + ")
        : r.option_id
        ? optById.get(r.option_id) ?? "?"
        : r.word;
      const key = (actById.get(r.activity_id)?.question ?? "?") + "||" + label;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    const rows = [["Question", "Réponse", "Occurrences"], ...[...map].map(([k, n]) => [...k.split("||"), n])];
    const csv = rows.map((r) => r.map((c) => '"' + String(c).split('"').join('""') + '"').join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "interacto-" + code + ".csv";
    a.click();
  }

  async function exportPDF() {
    const ids = acts.map((a) => a.id);
    if (!ids.length) return setMsg("Aucune activité à exporter.");
    const { data: allOpts } = await supabase.from("options").select("*").in("activity_id", ids);
    const { data: resps } = await supabase.from("responses").select("*").in("activity_id", ids);
    const lines = [];
    acts.forEach((a) => {
      lines.push("<h2>" + a.question + "</h2>");
      const rs = (resps ?? []).filter((r) => r.activity_id === a.id);
      if (a.kind === "cloud") {
        const c = {};
        rs.forEach((r) => {
          const k = norm(r.word);
          c[k] = (c[k] ?? 0) + 1;
        });
        const items = Object.entries(c).sort((x, y) => y[1] - x[1]);
        lines.push("<p>" + items.map(([w, n]) => w + " (" + n + ")").join(" - ") + "</p>");
      } else {
        const opts = (allOpts ?? []).filter((o) => o.activity_id === a.id).sort((x, y) => x.position - y.position);
        const c = {};
        rs.forEach((r) => {
          if (r.option_ids?.length) r.option_ids.forEach((oid) => { c[oid] = (c[oid] ?? 0) + 1; });
          else if (r.option_id) c[r.option_id] = (c[r.option_id] ?? 0) + 1;
        });
        opts.forEach((o) => {
          const n = c[o.id] ?? 0;
          const pct = rs.length ? Math.round((n / rs.length) * 100) : 0;
          lines.push("<p>" + o.label + " : " + n + " (" + pct + "%)</p>");
        });
      }
    });
    const w = window.open("", "_blank");
    if (!w) {
      setMsg("Autorisez les fenêtres surgissantes pour l'export PDF.");
      return;
    }
    w.document.write(
      "<html><head><title>Rapport Interacto " + code + "</title>" +
      "<style>body{font-family:-apple-system,Arial,sans-serif;max-width:700px;margin:24px auto;padding:0 16px;color:#0f172a}h1{font-size:22px}h2{font-size:17px;margin-top:20px}p{margin:4px 0}</style>" +
      "</head><body><h1>Rapport de session " + code.slice(0, 3) + " " + code.slice(3) + "</h1>" +
      lines.join("") + "</body></html>"
    );
    w.document.close();
  }

  async function showBoard() {
    const quizzes = acts.filter((a) => a.kind === "quiz");
    if (!quizzes.length) return setMsg("Aucun quiz dans la séance.");
    const ids = quizzes.map((a) => a.id);
    const { data: allOpts } = await supabase.from("options").select("*").in("activity_id", ids);
    const { data: resps } = await supabase.from("responses").select("*").in("activity_id", ids);
    const actById = new Map(quizzes.map((a) => [a.id, a]));
    const scores = new Map();
    (resps ?? []).forEach((r) => {
      const a = actById.get(r.activity_id);
      if (!a) return;
      let ok = false;
      if (a.multi) {
        const correctSet = new Set(
          (allOpts ?? []).filter((o) => o.activity_id === a.id && o.is_correct).map((o) => o.id)
        );
        ok = r.option_ids?.length === correctSet.size && r.option_ids.every((x) => correctSet.has(x));
      } else {
        ok = r.option_id === a.correct_id;
      }
      if (!ok) return;
      const name = (r.nickname || r.participant_key).slice(0, 20);
      scores.set(name, (scores.get(name) ?? 0) + 1);
    });
    setBoard([...scores.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10));
  }

  const remaining =
    current?.kind === "quiz" && current.opened_at
      ? Math.max(0, Math.round((new Date(current.opened_at).getTime() + current.duration_sec * 1000 - now) / 1000))
      : null;

  const totalVotes =
    current?.kind === "cloud"
      ? Object.values(counts).reduce((s, n) => s + n, 0)
      : current?.kind === "rank"
      ? counts[current.options?.[0]?.id] ?? 0
      : current
      ? current.options.reduce((s, o) => s + (counts[o.id] ?? 0), 0)
      : 0;

  return (
    <div className="wrap">
      <div className="card">
        <div className="row spread wrap">
          <div>
            <p className="muted small">Rejoignez sur votre téléphone :</p>
            <p className="code">{code.slice(0, 3)} {code.slice(3)}</p>
            <p className="muted small">{joinUrl}</p>
            <Qr url={joinUrl} />
          </div>
          <div className="right">
                        <div className="row gap">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
                Copier le lien
              </button>
              <button className="btn" onClick={() => { window.location.hash = "#/"; }}>
                Terminer la séance
              </button>
            </div>
              
            
            <p className="muted small mt">Votes : {totalVotes}</p>
            <p className="muted small">En ligne : {online}</p>
            <p className="muted small">
              {Object.entries(reactions).map(([e, n]) => e + n + " ")}
            </p>
          </div>
        </div>
      </div>

      {msg && <p className="error">{msg}</p>}

      <div className="card screen" onDoubleClick={(e) => e.currentTarget.classList.toggle("fs")}><div className="credit">Conçu par Dr A. BELHAKEM</div>
        {current ? (
          <>
            <div className="row spread wrap">
              <h2>{current.question}{current.multi ? " (plusieurs réponses)" : ""}</h2>
              <span className={"badge" + (current.status === "open" ? " ok" : "")}>
                {current.status === "open" ? "Ouvert" : "Verrouillé"}
              </span>
            </div>
            {revealed && current.explanation && (
              <p className="expl">{current.explanation}</p>
            )}
            {current.image_url && (
              <img src={current.image_url} className="qimg" alt="" />
            )}
            {online > 0 && (
              <div>
                <p className="muted small">Réponses : {totalVotes} / {online} connecté(s)</p>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: Math.min(100, Math.round((totalVotes / online) * 100)) + "%" }}
                  ></div>
                </div>
              </div>
            )}

            {remaining !== null && current.status === "open" && (
              <p className={"timer" + (remaining <= 5 ? " hot" : "")}>{remaining}s</p>
            )}

            {revealed ? (
              current.kind === "cloud" ? (
                <div className="cloud">
                  {Object.entries(counts).map(([w, n]) => (
                    <span key={w} style={{ fontSize: (0.9 + n * 0.35) + "rem" }}>{w} </span>
                  ))}
                  {totalVotes === 0 && <p className="muted">En attente des réponses...</p>}
                </div>
              ) : current.kind === "rank" ? (
                <div className="bars">
                  {(rankData ?? []).map((r, i) => (
                    <div key={i} className="bar-row">
                      <span className="bar-label">{i + 1}. {r.label}{r.avg ? " (moy. " + r.avg.toFixed(1) + ")" : ""}{i === r.ideal ? " [ordre correct]" : ""}</span>
                    </div>
                  ))}
                  {!rankData?.length && <p className="muted">En attente des réponses...</p>}
                </div>
              ) : (
                <div className="bars">
                  {current.options.map((o) => {
                    const n = counts[o.id] ?? 0;
                    const pct = totalVotes ? Math.round((n / totalVotes) * 100) : 0;
                    const good =
                      current.kind === "quiz" &&
                      (current.multi ? o.is_correct : current.correct_id === o.id);
                    return (
                      <div key={o.id} className="bar-row">
                        <span className="bar-label">{o.label}</span>
                        <div className="bar-track">
                          <div className={"bar-fill" + (good ? " good" : "")} style={{ width: pct + "%" }} />
                        </div>
                        <span className="bar-n">{n} ({pct}%)</span>
                      </div>
                    );
                  })}
                  {totalVotes === 0 && <p className="muted">En attente des réponses...</p>}
                </div>
              )
            ) : (
              <p className="muted big">Résultats masqués</p>
            )}
          </>
        ) : (
          <p className="muted big">Créez ou sélectionnez une activité ci-dessous.</p>
        )}
      </div>

      <div className="row gap wrap">
        {acts.map((a, i) => (
          <span key={a.id} className="row gap">
            <button
              className={"btn" + (current?.id === a.id ? " primary" : "")}
              onClick={() => focusActivity(a)}
            >
              {i + 1}. {a.kind === "poll" ? "Sondage" : a.kind === "quiz" ? "Quiz" : a.kind === "cloud" ? "Nuage" : "Classement"} - {a.question.slice(0, 25)}
            </button>
            <button className="btn slim" onClick={() => reuse(a)}>
              Réutiliser
            </button>
          </span>
        ))}
      </div>

      {current && (
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => toggleOpen(current)}>
            {current.status === "open" ? "Verrouiller" : "Ouvrir"}
          </button>
          <button
            className="btn"
            onClick={async () => {
              const v = !revealed;
              setRevealed(v);
              const { data: upd, error: rerr } = await supabase.from("activities").update({ revealed: v }).eq("id", current.id).select();
              setMsg(rerr ? "Erreur Afficher : " + rerr.message : upd && upd.length ? "Revele OK" : "Aucune ligne mise a jour");
            }}
          >
            {revealed ? "Masquer" : "Afficher"}
          </button>
          {!playing ? (
            <button className="btn primary" onClick={startRun}>Defiler</button>
          ) : (
            <button className="btn primary" onClick={stopRun}>Stop defilement</button>
           )}
          <button className="btn" onClick={showBoard}>Classement</button>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
          <button className="btn" onClick={exportPDF}>Rapport PDF</button>
          {current.kind === "quiz" && revealed && totalVotes > 0 && (() => {
            const opts = current.options ?? [];
            const nbGood = current.multi ? opts.filter((o) => o.is_correct).length : 1;
            const okCount = current.multi
              ? opts.reduce((s, o) => s + (o.is_correct ? (counts[o.id] ?? 0) : 0), 0)
              : counts[current.correct_id] ?? 0;
            const pct = Math.round((okCount / (totalVotes * nbGood || 1)) * 100);
            return pct < 50 ? (
              <button className="btn" onClick={() => reprogram(current)}>
                Reviser cette question ({pct}% de reussite)
              </button>
            ) : null;
          })()}
        </div>
      )}

      {board && (
        <div className="card">
          <h3>Classement (bonnes réponses aux quiz)</h3>
          {board.length === 0 ? (
            <p className="muted">Aucune bonne réponse pour l'instant.</p>
          ) : (
            board.map(([name, s], i) => (
              <div key={name} className="row spread">
                <span>{i + 1}. {name}</span>
                <b>{s}</b>
              </div>
            ))
          )}
        </div>
      )}

      <div className="card">
        <h3>Nouvelle activité</h3>
        <div className="row gap">
          {["poll", "quiz", "cloud", "rank"].map((k) => (
            <button
              key={k}
              className={"btn" + (form.kind === k ? " primary" : "")}
              onClick={() => setForm({ ...form, kind: k, multi: false, corrects: [], vf: false })}
            >
              {k === "poll" ? "Sondage" : k === "quiz" ? "Quiz" : k === "cloud" ? "Nuage" : "Classement"}
            </button>
          ))}
        </div>
        <button
          className={"btn slim" + (form.vf ? " good" : "")}
          onClick={() => setForm({ ...form, kind: "quiz", multi: false, corrects: [], options: ["Vrai", "Faux"], correct: 0, question: "", vf: true })}
        >
          Vrai/Faux éclair
        </button>
        {form.kind === "rank" && (
          <p className="muted">Saisissez les elements dans l ordre correct : le 1er saisi = priorite 1.</p>
        )}
        {form.kind === "quiz" && (
          <button
            className={"btn slim" + (form.multi ? " good" : "")}
            onClick={() => setForm({ ...form, multi: !form.multi, corrects: [], vf: false })}
          >
            {form.multi ? "Réponses multiples : ON" : "Réponses multiples : OFF"}
          </button>
        )}
        <input
          className="input"
          placeholder="Votre question..."
          value={form.question}
          onChange={(e) => setForm({ ...form, question: e.target.value })}
        />
        <input
          className="input"
          placeholder="Catégorie (facultatif)"
          value={form.category ?? ""}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <div className="row gap">
          <label className="btn slim">+ Image
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={upImg} />
          </label>
          {form.image_url && <img src={form.image_url} className="imgthumb" alt="" />}
          {form.image_url && <button className="btn slim" onClick={() => setForm({ ...form, image_url: null })}>Retirer image</button>}
        </div>
        <textarea
          className="input"
          rows="2"
          placeholder="Explication (affichee avec le corrige)"
          value={form.explanation ?? ""}
          onChange={(e) => setForm({ ...form, explanation: e.target.value })}
        />
        {form.kind !== "cloud" &&
          form.options.map((opt, i) => (
            <div key={i} className="row gap">
              {form.kind === "quiz" && (
                <button
                  className={
                    "btn slim" +
                    ((form.multi ? form.corrects.includes(i) : form.correct === i) ? " good" : "")
                  }
                  onClick={() => {
                    if (form.multi) {
                      setForm({
                        ...form,
                        corrects: form.corrects.includes(i)
                          ? form.corrects.filter((x) => x !== i)
                          : [...form.corrects, i],
                      });
                    } else {
                      setForm({ ...form, correct: i });
                    }
                  }}
                >
                  OK
                </button>
              )}
              <input
                className="input"
                placeholder={"Option " + (i + 1)}
                value={opt}
                onChange={(e) =>
                  setForm({ ...form, options: form.options.map((o, j) => (j === i ? e.target.value : o)) })
                }
              />
            </div>
          ))}
        {form.kind !== "cloud" && form.options.length < 6 && (
          <button className="btn slim" onClick={() => setForm({ ...form, options: [...form.options, ""] })}>
            + Option
          </button>
        )}
        {form.kind === "quiz" && (
          <input
            className="input narrow"
            type="number"
            min="5"
            max="300"
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value })}
          />
        )}
        <button className="btn full" onClick={() => createActivity(false)}>Ajouter à la séance</button>
        <button className="btn primary full" onClick={() => createActivity(true)}>Créer et projeter</button>
      </div>
    </div>
  );
}

