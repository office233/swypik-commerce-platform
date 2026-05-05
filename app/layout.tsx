export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body className="bg-black text-white">{children}</body>
    </html>
  );
}
