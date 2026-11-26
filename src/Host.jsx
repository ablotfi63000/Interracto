import Qr from "./Qr.jsx";
import { useCallback, useEffect, useState } from "react";
import { supabase, baseUrl } from "./lib/supabase.js";

export default function Host({ code }) {
  const [presId, setPresId] = useState(null);
  const [acts, setActs] = useState([]);
  const [current, setCurrent] = useState(null);
  const [counts, setCounts] = useState({});
  const [reactions, setReactions] = useState({});
  const [revealed, setRevealed] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(0);
  const [msg, setMsg] = useState("");
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
    const { data: act } = await supabase.from("activities").select("*").eq("id", activityId).single();
    const { data: opts } = await supabase.from("options").select("*").eq("activity_id", activityId).order("position");
    const { data: resps } = await supabase.from("responses").select("*").eq("activity_id", activityId);
    const c = {};
    (resps ?? []).forEach((r) => {
      if (r.option_ids?.length) {
        r.option_ids.forEach((oid) => {
          c[oid] = (c[oid] ?? 0) + 1;
        });
      } else {
        const key = r.option_id ?? r.word;
        c[key] = (c[key] ?? 0) + 1;
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
            } else {
              const key = r.option_id ?? r.word;
              setCounts((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
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

  async function focusActivity(a) {
    await supabase.from("presentations").update({ current_activity_id: a.id }).eq("id", presId);
    await showActivity(a.id);
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
    setForm({ ...form, question: "", options: ["", ""], corrects: [] });
    await loadSession();
    if (project) {
      await focusActivity(act);
    } else {
      setMsg("Question " + acts.length + " ajoutée à la séance.");
    }
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

  const remaining =
    current?.kind === "quiz" && current.opened_at
      ? Math.max(0, Math.round((new Date(current.opened_at).getTime() + current.duration_sec * 1000 - now) / 1000))
      : null;

  const totalVotes =
    current?.kind === "cloud"
      ? Object.values(counts).reduce((s, n) => s + n, 0)
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
            <button className="btn" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
              Copier le lien
            </button>
            <p className="muted small mt">Votes : {totalVotes}</p>
            <p className="muted small">En ligne : {online}</p>
            <p className="muted small">
              {Object.entries(reactions).map(([e, n]) => e + n + " ")}
            </p>
          </div>
        </div>
      </div>

      {msg && <p className="error">{msg}</p>}

      <div className="card screen">
        {current ? (
          <>
            <div className="row spread wrap">
              <h2>{current.question}{current.multi ? " (plusieurs réponses)" : ""}</h2>
              <span className={"badge" + (current.status === "open" ? " ok" : "")}>
                {current.status === "open" ? "Ouvert" : "Verrouillé"}
                {remaining !== null && current.status === "open" ? " - " + remaining + "s" : ""}
              </span>
            </div>

            {revealed ? (
              current.kind === "cloud" ? (
                <div className="cloud">
                  {Object.entries(counts).map(([w, n]) => (
                    <span key={w} style={{ fontSize: (0.9 + n * 0.35) + "rem" }}>{w} </span>
                  ))}
                  {totalVotes === 0 && <p className="muted">En attente des réponses...</p>}
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
          <button
            key={a.id}
            className={"btn" + (current?.id === a.id ? " primary" : "")}
            onClick={() => focusActivity(a)}
          >
            {i + 1}. {a.kind === "poll" ? "Sondage" : a.kind === "quiz" ? "Quiz" : "Nuage"} - {a.question.slice(0, 25)}
          </button>
        ))}
      </div>

      {current && (
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => toggleOpen(current)}>
            {current.status === "open" ? "Verrouiller" : "Ouvrir"}
          </button>
          <button className="btn" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Masquer" : "Afficher"}
          </button>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
        </div>
      )}

      <div className="card">
        <h3>Nouvelle activité</h3>
        <div className="row gap">
          {["poll", "quiz", "cloud"].map((k) => (
            <button
              key={k}
              className={"btn" + (form.kind === k ? " primary" : "")}
              onClick={() => setForm({ ...form, kind: k, multi: false, corrects: [] })}
            >
              {k === "poll" ? "Sondage" : k === "quiz" ? "Quiz" : "Nuage"}
            </button>
          ))}
        </div>
        {form.kind === "quiz" && (
          <button
            className={"btn slim" + (form.multi ? " good" : "")}
            onClick={() => setForm({ ...form, multi: !form.multi, corrects: [] })}
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
