import { NavBar } from "./NavBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      <NavBar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
