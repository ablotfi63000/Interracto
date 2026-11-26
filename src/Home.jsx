import { useState } from "react";
import { supabase } from "./lib/supabase.js";

export default function Home() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const goTo = (prefix) => {
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) {
      setError("Entrez un code à 6 chiffres");
      return;
    }
    window.location.hash = "#/" + prefix + "/" + c;
  };

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
          <button className="btn full" onClick={() => goTo("host")}>Ouvrir la session</button>
          <button className="btn primary full" onClick={() => goTo("j")}>Rejoindre</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
