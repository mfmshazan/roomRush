import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoomRush",
  description: "Party football in your browser",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
