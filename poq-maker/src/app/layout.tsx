import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "poq-maker — Quote & Invoice Generator",
  description: "Generate beautifully styled quotes and invoices, exported as crisp PDFs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
