'use client';

import * as React from 'react';
import QRCode from 'qrcode';

export interface QrCodeProps {
  value?: string;
  data?: string;
  size?: number;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export function QrCode({
  value,
  data,
  size = 200,
  className,
  darkColor = '#059669',
  lightColor = '#ffffff',
}: QrCodeProps) {
  const qrValue = value || data || '';
  const [dataUrl, setDataUrl] = React.useState<string>('');

  React.useEffect(() => {
    if (!qrValue) return;
    QRCode.toDataURL(qrValue, {
      width: size,
      margin: 1,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    })
      .then(setDataUrl)
      .catch((err) => console.error('QR Code error:', err));
  }, [qrValue, size, darkColor, lightColor]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse"
      >
        <span className="text-xs text-slate-400">Loading QR...</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code"
      width={size}
      height={size}
      className={className}
    />
  );
}
