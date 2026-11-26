import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function Qr({ url }) {
  const [small, setSmall] = useState("");
  const [big, setBig] = useState("");
  const [full, setFull] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 200, margin: 1 })
      .then(setSmall)
      .catch(() => setSmall(""));
    QRCode.toDataURL(url, { width: 600, margin: 2 })
      .then(setBig)
      .catch(() => setBig(""));
  }, [url]);

  if (!small) return null;

  return (
    <>
      <img
        src={small}
        alt="QR code de session"
        style={{
          width: 140,
          height: 140,
          borderRadius: 12,
          background: "#fff",
          padding: 6,
          cursor: "pointer",
        }}
        onClick={() => setFull(true)}
      />
      {full && (
        <div
          onClick={() => setFull(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(2, 6, 23, 0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            zIndex: 50,
          }}
        >
          <img
            src={big}
            alt="QR code agrandi"
            style={{
              width: "80vw",
              maxWidth: 480,
              height: "auto",
              background: "#fff",
              padding: 16,
              borderRadius: 20,
            }}
          />
          <p className="muted">Touchez le QR pour fermer</p>
        </div>
      )}
    </>
  );
}
