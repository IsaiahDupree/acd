import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { WebVitalsProvider } from "../components/web-vitals-provider";
import { WebVitalsDashboard } from "../components/web-vitals-dashboard";
import { CanonicalLink } from "../components/canonical-link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Autonomous Coding Dashboard",
    template: "%s | Autonomous Coding Dashboard",
  },
  description: "A comprehensive, real-time monitoring dashboard for autonomous coding agents",
  keywords: ["autonomous coding", "AI agents", "dashboard", "monitoring"],
  authors: [{ name: "Autonomous Coding Team" }],
  openGraph: {
    title: "Autonomous Coding Dashboard",
    description: "A comprehensive, real-time monitoring dashboard for autonomous coding agents",
    type: "website",
    locale: "en_US",
    siteName: "Autonomous Coding Dashboard",
  },
  twitter: {
    card: "summary_large_image",
    title: "Autonomous Coding Dashboard",
    description: "A comprehensive, real-time monitoring dashboard for autonomous coding agents",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WebVitalsProvider />
        <CanonicalLink />
        {children}
        <WebVitalsDashboard />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#fff',
              border: '1px solid #374151',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
