import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
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
  title: "Phone Booth",
  description: "Book the booth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-amber-50 font-sans">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              fontFamily: "var(--font-geist-mono)",
              fontSize: "13px",
              borderRadius: "0",
              padding: "12px 16px",
              border: "2px solid black",
              background: "white",
              color: "black",
            },
            success: { style: { borderColor: "#16a34a" } },
            error: { style: { borderColor: "#dc2626" } },
          }}
        />
      </body>
    </html>
  );
}
