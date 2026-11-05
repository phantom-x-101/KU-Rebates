import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { Header } from "@/components/Header";
import { getCurrentUser, listUsers } from "@/lib/session";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: "KU Rebate — Consignment prototype",
  description: "Pycube consignment prototype alongside KU workflows. Demo data only.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let currentUser: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    users = await listUsers();
    currentUser = await getCurrentUser();
  } catch {
    // DB may not be seeded yet
  }

  return (
    <html lang="en">
      <body className={`${sourceSans.variable} min-h-screen bg-slate-100 text-slate-900 antialiased`}>
        <Header users={users} currentUser={currentUser} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-slate-500">
          Demo data. Vendor X and Vendor C are placeholders.
        </footer>
      </body>
    </html>
  );
}
