import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Your AI-powered knowledge base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg text-text font-mono min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
