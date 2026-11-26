import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function Qr({ url }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 200, margin: 1 })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [url]);
  if (!src) return null;
  return (
    <img
      src={src}
      alt="QR code de session"
      style={{ width: 140, height: 140, borderRadius: 12, background: "#fff", padding: 6 }}
    />
  );
}
