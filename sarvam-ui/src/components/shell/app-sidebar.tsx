"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompare, Home, LayoutDashboard } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

const nav = [
  { title: "Operator desk", href: "/app", icon: LayoutDashboard },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/app" />}
              tooltip="IdentityGraph India"
            >
              <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <GitCompare className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-heading font-semibold">
                  IdentityGraph
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Suvidha Desk
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Desk</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                    }
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />} tooltip="Product site">
              <Home />
              <span>Product site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
