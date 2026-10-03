import { useEffect, useState } from "react";

export default function NetworkStatus() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offlineHandler); };
  }, []);
  if (!offline) return null;
  return <div className="phase47-network-banner" role="status">You're offline. Browsing cached pages may work, but cart and checkout updates need an internet connection.</div>;
}
