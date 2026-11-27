import Qr from "./Qr.jsx";
import { useCallback, useEffect, useState } from "react";
import { supabase, baseUrl } from "./lib/supabase.js";

const norm = (w) =>
  (w ?? "").toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

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
  const [board, setBoard] = useState(null);
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
