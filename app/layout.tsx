import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resolvable Assess",
  referrer: "no-referrer",
  description: "Practical customer-service work samples, transparent scoring and evidence-based human review.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
