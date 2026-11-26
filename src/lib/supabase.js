import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const baseUrl = () => {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, "");
};
