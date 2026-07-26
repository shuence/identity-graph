import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const posts = [
  {
    tag: "PROBLEM",
    title: "5–8 documents per adult, almost never identical",
    date: "India identity reality",
  },
  {
    tag: "SIGNAL",
    title: "18%+ passport objections from mismatched records",
    date: "Application failures",
  },
  {
    tag: "GAP",
    title: "Enterprise KYC rejects — citizens can't diagnose",
    date: "No remediation path",
  },
];

export function Research() {
  return (
    <section id="research" className="border-b border-border py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <h2 className="mb-10 font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Why now
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {posts.map((post) => (
            <Card
              key={post.title}
              className="border-border bg-card shadow-none transition-colors hover:border-primary/30"
            >
              <CardHeader>
                <Badge variant="outline" className="w-fit text-[10px] tracking-wider">
                  {post.tag}
                </Badge>
                <CardTitle className="font-heading text-lg leading-snug">
                  {post.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{post.date}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
