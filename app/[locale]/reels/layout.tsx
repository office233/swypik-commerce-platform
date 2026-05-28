// Layout minimal pentru rutele /reels/*.
// TopBar și BottomNav sunt ascunse via hiddenPaths (vezi components/TopBar.tsx, BottomNav.tsx).
export default function ReelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="bg-black min-h-screen">{children}</div>;
}
