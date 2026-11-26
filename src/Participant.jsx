import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const REACTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F525}"];

export default function Participant({ code }) {
  const [pres, setPres] = useState(null);
  const [activity, setActivity] = useState(null);
  const [options, setOptions] = useState([]);
  const [nickname, setNickname] = useState(() => localStorage.getItem("interacto_name") ?? "");
  const [joined, setJoined] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [word, setWord] = useState("");
  const [picked, setPicked] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const participantKey = useMemo(() => {
    let k = localStorage.getItem("interacto_key");
    if (!k) {
      k = Math.random().toString(36).slice(2, 11);
      localStorage.setItem("interacto_key", k);
    }
    return k;
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!joined) return;
    let alive = true;

    async function load() {
      const { data: p } = await supabase
        .from("presentations")
        .select("id, current_activity_id")
        .eq("code", code)
        .single();
      if (!alive) return;
      if (!p) {
        setError("Session introuvable.");
        return;
      }
      setPres(p);
      setAnswered(false);
      setPicked([]);
      setWord("");
      if (!p.current_activity_id) {
        setActivity(null);
        return;
      }
      const { data: act } = await supabase
        .from("activities")
        .select("*")
        .eq("id", p.current_activity_id)
        .single();
      const { data: opts } = await supabase
        .from("options")
        .select("*")
        .eq("activity_id", p.current_activity_id)
        .order("position");
      if (!alive) return;
      setActivity(act);
      setOptions(opts ?? []);
    }

    load();
    const channel = supabase
      .channel("participant-" + code)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "presentations" },
        (payload) => {
          if (payload.new.code === code) load();
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [joined, code]);

  useEffect(() => {
    if (!joined) return;
    const ch = supabase.channel("presence-" + code, {
      config: { presence: { key: participantKey } },
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ role: "participant" });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [joined, code, participantKey]);
    const remaining =
    activity?.kind === "quiz" && activity.opened_at && activity.status === "open"
      ? Math.max(0, Math.round((new Date(activity.opened_at).getTime() + activity.duration_sec * 1000 - now) / 1000))
      : null;
  const locked = !activity || activity.status === "closed" || remaining === 0;

  const vote = async (option) => {
    if (answered || locked) return;
    const { error: err } = await supabase.from("responses").upsert(
      { activity_id: activity.id, option_id: option.id, participant_key: participantKey },
      { onConflict: "activity_id,participant_key" }
    );
    if (err) {
      setError("Envoi impossible : " + err.message);
      return;
    }
    setAnswered(true);
  };

  const togglePick = (o) => {
    if (answered || locked) return;
    setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]));
  };

  const sendMulti = async () => {
    if (!picked.length || answered || locked) return;
    const { error: err } = await supabase.from("responses").upsert(
      { activity_id: activity.id, option_ids: picked, participant_key: participantKey },
      { onConflict: "activity_id,participant_key" }
    );
    if (err) {
      setError("Envoi impossible : " + err.message);
      return;
    }
    setAnswered(true);
  };

  const sendWord = async () => {
    const w = word.trim().toLowerCase();
    if (!w || answered || locked) return;
    const { error: err } = await supabase.from("responses").upsert(
      { activity_id: activity.id, word: w, participant_key: participantKey },
      { onConflict: "activity_id,participant_key" }
    );
    if (err) {
      setError("Envoi impossible : " + err.message);
      return;
    }
    setAnswered(true);
    setWord("");
  };

  const react = async (emoji) => {
    if (!pres) return;
    await supabase.from("reactions").insert({ presentation_id: pres.id, emoji });
  };

  if (!joined) {
    return (
      <div className="wrap center">
        <div className="card narrow">
          <h1>Rejoindre</h1>
          <p className="muted small">Session {code}</p>
          <input
            className="input"
            placeholder="Votre pseudo (facultatif)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <button
            className="btn primary full"
            onClick={() => {
              localStorage.setItem("interacto_name", nickname);
              setJoined(true);
            }}
          >
            Rejoindre
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap mobile">
      <p className="muted small">
        {code.slice(0, 3)} {code.slice(3)} {nickname ? "- " + nickname : ""}
      </p>
      {error && <p className="error">{error}</p>}

      {!activity && <p className="muted big">En attente du présentateur...</p>}

      {activity && (
        <>
          <h2>{activity.question}{activity.multi ? " (plusieurs réponses)" : ""}</h2>
          {activity.status === "closed" ? (
            <p className="muted big">Réponses verrouillées</p>
          ) : activity.kind === "cloud" ? (
            answered ? (
              <p className="ok-msg">Mot envoyé !</p>
            ) : (
              <div className="row gap">
                <input
                  className="input"
                  placeholder="Votre mot..."
                  maxLength="25"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                />
                <button className="btn primary" onClick={sendWord}>Envoyer</button>
              </div>
            )
          ) : (
            <>
              {remaining !== null && (
                <p className={"timer" + (remaining <= 5 ? " hot" : "")}>{remaining}s</p>
              )}
              {answered ? (
                <p className="ok-msg">Réponse envoyée !</p>
              ) : activity.multi ? (
                <>
                  {options.map((o, i) => (
                    <button
                      key={o.id}
                      className={"option" + (picked.includes(o.id) ? " picked" : "")}
                      disabled={locked}
                      onClick={() => togglePick(o)}
                    >
                      {String.fromCharCode(65 + i)}. {o.label}
                    </button>
                  ))}
                  <button
                    className="btn primary full"
                    disabled={!picked.length || locked}
                    onClick={sendMulti}
                  >
                    Valider ({picked.length})
                  </button>
                </>
              ) : (
                options.map((o, i) => (
                  <button
                    key={o.id}
                    className="option"
                    disabled={locked}
                    onClick={() => vote(o)}
                  >
                    {String.fromCharCode(65 + i)}. {o.label}
                  </button>
                ))
              )}
            </>
          )}
        </>
      )}

      <div className="reaction-bar">
        {REACTIONS.map((e) => (
          <button key={e} className="reaction" onClick={() => react(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
