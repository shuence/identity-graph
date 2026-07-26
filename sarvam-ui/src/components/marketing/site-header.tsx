"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#desk", label: "The desk" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              IG
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight">
              IdentityGraph <span className="text-primary">India</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button render={<Link href="/app" />} nativeButton={false}>
            Open desk
          </Button>
        </div>

        <Sheet>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="md:hidden" />}
          >
            <Menu />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-heading">IdentityGraph India</SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-4 px-4">
              {links.map((link) => (
                <a key={link.href} href={link.href} className="text-base text-foreground">
                  {link.label}
                </a>
              ))}
              <Button
                render={<Link href="/app" />}
                nativeButton={false}
                className="mt-2"
              >
                Open desk
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
