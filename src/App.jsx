import { useEffect, useState } from "react";
import Home from "./Home.jsx";
import Host from "./Host.jsx";
import Participant from "./Participant.jsx";

function useHash() {
  const [hash, setHash] = useState(window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  if (hash.startsWith("/host/")) return <Host code={hash.slice(6)} />;
  if (hash.startsWith("/j/")) return <Participant code={hash.slice(3)} />;
  return <Home />;
}
