import "./globals.css";

export const metadata = {
  title: "AICeVrei.ro - Shopping cu AI",
  description: "Spune-mi ce vrei si iti gasesc cea mai buna oferta.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
