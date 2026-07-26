import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Separator } from "@/components/ui/separator";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur-md print:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="truncate font-heading text-sm font-semibold text-foreground">
            Suvidha Desk
          </span>
        </header>
        <div className="desk-shell flex flex-1 flex-col gap-5 bg-background p-4 md:p-6 print:bg-white print:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
