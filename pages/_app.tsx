import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";

if (typeof window !== 'undefined') {
  (global as any).Buffer = (global as any).Buffer || require('buffer').Buffer;
}

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!window.WebSocket) {
        console.error('WebSocket not supported in this browser');
      }
    }
  }, []);

  return <Component {...pageProps} />;
}