import type { Metadata, Viewport } from "next";
import RegisterServiceWorker from "./register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patient Monitor",
  description:
    "Bedside multi-parameter patient monitor simulator for training, demos, and prop use. Not a medical device.",
  manifest: "/manifest.webmanifest",
  applicationName: "Patient Monitor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Patient Monitor",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
