import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { LogoMarquee } from "@/components/marketing/logo-marquee";
import { PlatformShowcase } from "@/components/marketing/platform-showcase";
import { ApiSection } from "@/components/marketing/api-section";
import { IndiaCan } from "@/components/marketing/india-can";
import { Pillars } from "@/components/marketing/pillars";
import { Fullstack } from "@/components/marketing/fullstack";
import { Enterprise } from "@/components/marketing/enterprise";
import { SocialProof } from "@/components/marketing/social-proof";
import { Research } from "@/components/marketing/research";
import { FinalCta } from "@/components/marketing/final-cta";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader />
      <main>
        <Hero />
        <LogoMarquee />
        <PlatformShowcase />
        <ApiSection />
        <IndiaCan />
        <Pillars />
        <Fullstack />
        <Enterprise />
        <SocialProof />
        <Research />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
