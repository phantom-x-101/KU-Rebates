import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { AppFrame } from "@/components/Header";
import { getCurrentUser, listUsers } from "@/lib/session";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: "PyCube — Rebate Prototype",
  description: "PyCube rebate prototype. Demo data only.",
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
      <body className={`${sourceSans.variable} min-h-screen bg-pc-bg text-[#16323c] antialiased`}>
        <AppFrame users={users} currentUser={currentUser}>
          {children}
        </AppFrame>
      </body>
    </html>
  );
}
