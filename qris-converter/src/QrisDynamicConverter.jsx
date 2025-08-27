import React, { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import jsQR from "jsqr";

// ====== Utils TLV & CRC ======
function parseTLV(payload) {
  let res = [], i = 0;
  while (i < payload.length) {
    const tag = payload.substring(i, i + 2);
    const len = parseInt(payload.substring(i + 2, i + 4), 10);
    const value = payload.substring(i + 4, i + 4 + len);
    res.push({ tag, length: len, value });
    i += 4 + len;
  }
  return res;
}
function buildTLV(tag, value) {
  const len = value.length.toString().padStart(2, "0");
  return tag + len + value;
}
function setOrReplaceTag(tlv, tag, value) {
  let found = false;
  let newTlv = tlv.map((t) => {
    if (t.tag === tag) {
      found = true;
      return { ...t, value, length: value.length };
    }
    return t;
  });
  if (!found) newTlv.push({ tag, length: value.length, value });
  return newTlv;
}
function findTag(tlv, tag) {
  return tlv.find((t) => t.tag === tag);
}
function buildTemplate(tlvList) {
  return tlvList.map((t) => buildTLV(t.tag, t.value)).join("");
}
function toPayload(tlv) {
  return buildTemplate(tlv);
}
function crc16CCITTFalse(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc;
}
function makeDynamicFromStatic(staticPayload, amount, billNumber, allowOpenAmount = false) {
  let tlv = parseTLV(staticPayload);

  if (amount && !allowOpenAmount) {
    tlv = setOrReplaceTag(tlv, "54", amount.toString());
  }

  if (billNumber) {
    let tag62 = findTag(tlv, "62") || { tag: "62", value: "" };
    let children = tag62.value ? parseTLV(tag62.value) : [];
    children = setOrReplaceTag(children, "01", billNumber);
    tag62.value = buildTemplate(children);
    tag62.length = tag62.value.length;
    tlv = setOrReplaceTag(tlv, "62", tag62.value);
  }

  tlv = tlv.filter((t) => t.tag !== "63");

  let payload = toPayload(tlv);
  let crc = crc16CCITTFalse(payload + "6304")
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  payload += "6304" + crc;

  return payload;
}
async function readFileAsImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function decodeQRFromImageFile(file) {
  const img = await readFileAsImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, canvas.width, canvas.height);
  if (code) return code.data;
  throw new Error("QR tidak terbaca");
}

// ====== Main Component ======
export default function QrisDynamicConverter() {
  const [sourcePayload, setSourcePayload] = useState("");
  const [amount, setAmount] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [allowOpenAmount, setAllowOpenAmount] = useState(false);
  const [dynamicPayload, setDynamicPayload] = useState("");
  const [showPayload, setShowPayload] = useState(false);
  const qrCanvasRef = useRef(null);

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const payload = await decodeQRFromImageFile(file);
      setSourcePayload(payload);
    } catch (err) {
      alert("Gagal membaca QR: " + err.message);
    }
  }

  function generateDynamic() {
    if (!sourcePayload) return alert("Upload QRIS statis dulu!");
    const dyn = makeDynamicFromStatic(sourcePayload, amount, billNumber, allowOpenAmount);
    setDynamicPayload(dyn);
    setShowPayload(false); // reset toggle setiap kali generate
  }

  function downloadPNG() {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "qris-dinamis.png";
    a.click();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center p-6 text-white">
      <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-lg p-8 w-full max-w-3xl space-y-6">

        {/* Upload Gambar */}
        <div>
          <label className="block text-sm font-medium mb-2">Upload Gambar QRIS Statis (.png/.jpg)</label>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-black" />
        </div>

        {/* Amount & Bill */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Amount (IDR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="cth: 15000"
              className="w-full p-2 rounded text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Bill Number (opsional)</label>
            <input
              type="text"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              placeholder="cth: INV-2025-0001"
              className="w-full p-2 rounded text-black"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="openamount"
            type="checkbox"
            checked={allowOpenAmount}
            onChange={(e) => setAllowOpenAmount(e.target.checked)}
          />
          <label htmlFor="openamount" className="text-sm">
            Izinkan <b>open amount</b>
          </label>
        </div>

        <button
          onClick={generateDynamic}
          className="w-full py-3 rounded bg-gradient-to-r from-sky-400 to-blue-500 font-bold hover:opacity-90 transition"
        >
          Convert
        </button>

        {/* Hasil */}
        {dynamicPayload && (
          <div className="mt-6 space-y-4 text-center">
            <h3 className="text-lg font-semibold">QR Dinamis</h3>
            <QRCodeCanvas ref={qrCanvasRef} value={dynamicPayload} size={220} includeMargin={true} />

            <button
              onClick={downloadPNG}
              className="mt-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg"
            >
              Download PNG
            </button>

            {/* Toggle payload */}
            <button
              onClick={() => setShowPayload(!showPayload)}
              className="mt-4 w-full py-2 rounded bg-gradient-to-r from-indigo-400 to-indigo-600 font-semibold hover:opacity-90 transition"
            >
              {showPayload ? "Sembunyikan Payload Dinamis" : "Lihat Payload Dinamis"}
            </button>

            {showPayload && (
              <textarea
                value={dynamicPayload}
                readOnly
                rows={6}
                className="w-full p-2 rounded text-black mt-2"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
