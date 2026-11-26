import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

export default function Home() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    supabase
      .from("presentations")
      .select("code, created_at")
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data, error }) => {
        if (!error) setRecent(data ?? []);
      });
  }, []);

  const createSession = async () => {
    setBusy(true);
    setError("");
    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    const { error: err } = await supabase
      .from("presentations")
      .insert({ code: newCode });
    setBusy(false);
    if (err) {
      setError("Création impossible : " + err.message);
      return;
    }
    window.location.hash = "#/host/" + newCode;
  };

  const goTo = (prefix, c) => {
    window.location.hash = "#/" + prefix + "/" + c;
  };

  const typed = code.replace(/\D/g, "");

  return (
    <div className="wrap center">
      <div className="card narrow">
        <h1>Interacto</h1>
        <p className="muted">Sondages, quiz et nuages de mots en direct. Gratuit, sans compte.</p>

        <button className="btn primary full" onClick={createSession} disabled={busy}>
          {busy ? "Création..." : "Créer une session présentateur"}
        </button>

        <div className="sep">ou</div>

        <input
          className="input"
          placeholder="Code à 6 chiffres"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <div className="row gap">
          <button
            className="btn full"
            onClick={() => (typed.length === 6 ? goTo("host", typed) : setError("Entrez un code à 6 chiffres"))}
          >
            Ouvrir la session
          </button>
          <button
            className="btn primary full"
            onClick={() => (typed.length === 6 ? goTo("j", typed) : setError("Entrez un code à 6 chiffres"))}
          >
            Rejoindre
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {recent.length > 0 && (
        <div className="card">
          <h3>Sessions récentes</h3>
          {recent.map((s) => (
            <div key={s.code} className="row spread wrap">
              <div>
                <span className="recent-code">{s.code.slice(0, 3)} {s.code.slice(3)}</span>
                {s.created_at && <p className="muted small">{fmtDate(s.created_at)}</p>}
              </div>
              <div className="row">
                <button className="btn slim" onClick={() => goTo("host", s.code)}>Présentateur</button>
                <button className="btn slim" onClick={() => goTo("j", s.code)}>Rejoindre</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
