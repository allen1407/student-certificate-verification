import { useEffect, useState } from 'react';

// Minimal hash router: "#/verify/0xabc" -> { page: 'verify', param: '0xabc' }.
// Hash routes work on any static host, so QR links need no server rewrites.
export function parseHash(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  return { page: parts[0] || 'home', param: parts[1] ? decodeURIComponent(parts[1]) : null };
}

export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo?.(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
