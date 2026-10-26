import React, { useRef } from 'react';
import QRCode from 'react-qr-code';
import { verificationUrl } from '../config';

/** QR code of the public verification link. Contains only the random certificate ID. */
const CertificateQR = ({ certificateId, size = 168 }) => {
  const wrapper = useRef(null);
  const url = verificationUrl(certificateId);

  const download = () => {
    const svg = wrapper.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `certificate-${certificateId.slice(2, 10)}-qr.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={wrapper} className="bg-white p-3 rounded-xl border border-slate-200" data-testid="certificate-qr" data-url={url}>
        <QRCode value={url} size={size} level="M" title="Certificate verification QR code" />
      </div>
      <button type="button" onClick={download} className="text-xs font-bold text-cyan-700 hover:text-cyan-900">
        Download QR (SVG)
      </button>
    </div>
  );
};

export default CertificateQR;
