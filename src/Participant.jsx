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

  const remaining =
    activity?.kind === "quiz" && activity.opened_at && activity.status === "open"
      ? Math.max(0, Math.round((new Date(activity.opened_at).getTime() + activity.duration_sec * 1000 - now) / 1000))
      : null;
  const locked = !activity || activity.status === "closed" || remaining === 0;

  const vote = async (option) => {
    if (answered || locked) return;
    const { error: err } = await supabase.from("responses").u
