import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function SocialProof() {
  return (
    <section className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="mb-10 font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          The story we tell judges in 30 seconds
        </h2>
        <Card className="border-border bg-card shadow-none">
          <CardContent className="flex flex-col gap-8 p-8 md:p-12">
            <p className="max-w-3xl text-lg leading-relaxed text-foreground md:text-xl">
              “Mohd” on PAN and “Mohammed” on Aadhaar is not fraud — it&apos;s a
              transliteration variant. A 1989 DOB on PAN when every other document says
              1988 is a blocker. IdentityGraph tells them apart, shows the scan region,
              and sends the citizen to Form 49A first.
            </p>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  IG
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">IdentityGraph India</p>
                <p className="text-sm text-muted-foreground">
                  Cross-document reconciliation · Sarvam Epoch hackathon
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
