import { createFileRoute, Link } from "@tanstack/react-router";
import evLogo from "@/assets/ev-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryCharging, CalendarCheck, MapPin, ShieldCheck, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EV ChargeHub — EV Charging Website" },
      { name: "description", content: "Find stations, reserve charging slots, manage vehicles and run EV charging operations from one responsive website." },
      { property: "og:title", content: "EV ChargeHub — EV Charging Website" },
      { property: "og:description", content: "Book EV charging, discover stations and manage operations from one responsive website." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="relative overflow-hidden px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary p-2 shadow-sm">
              <img src={evLogo.url} alt="EV ChargeHub" className="h-full w-full object-contain invert" />
            </span>
            <span className="font-display text-xl font-semibold">EV ChargeHub</span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link to="/auth" className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Sign in</Link>
            <Button asChild className="rounded-full"><Link to="/auth">Start booking</Link></Button>
          </nav>
        </div>

        <div className="mx-auto grid max-w-7xl gap-8 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-16 lg:py-20">
          <div>
            <Badge className="mb-5 rounded-full bg-primary/15 text-primary hover:bg-primary/15">Live EV charging network</Badge>
            <h1 className="max-w-3xl font-display text-5xl font-semibold leading-tight text-foreground md:text-6xl lg:text-7xl">
              EV ChargeHub
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              A web-based platform to find nearby charging stations, reserve slots, track bookings, manage vehicles and operate EV charging locations across India.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full shine"><Link to="/auth">Book a charger</Link></Button>
              <Button asChild size="lg" variant="outline" className="rounded-full"><Link to="/operator/login">Station operator</Link></Button>
            </div>
          </div>

          <div className="neumorph p-4 md:p-5">
            <div className="rounded-2xl bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Available near you</p>
                  <p className="font-display text-2xl font-semibold">24 fast chargers</p>
                </div>
                <span className="live-dot" />
              </div>
              <div className="mt-5 grid gap-3">
                {[
                  ["MG Road Charging Hub", "1.8 km", "8 slots"],
                  ["Metro EV Plaza", "3.2 km", "5 slots"],
                  ["GreenVolt Highway", "6.4 km", "11 slots"],
                ].map(([name, distance, slots]) => (
                  <div key={name} className="flex items-center justify-between rounded-xl bg-secondary/70 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Zap className="h-5 w-5" /></span>
                      <div>
                        <p className="font-medium text-foreground">{name}</p>
                        <p className="text-sm text-muted-foreground">{distance} away</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-primary">{slots}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/45 px-4 py-12 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-4">
          {[
            [MapPin, "Find stations", "Discover chargers by distance, speed and availability."],
            [CalendarCheck, "Reserve slots", "Book a charging window before you arrive."],
            [BatteryCharging, "Manage vehicles", "Save EV details for faster bookings."],
            [ShieldCheck, "Admin tools", "Run stations, users, payments and support from web."],
          ].map(([Icon, title, copy]) => {
            const FeatureIcon = Icon as typeof MapPin;
            return (
              <Card key={title as string} className="border-border/70 bg-background/80 shadow-sm">
                <CardContent className="p-5">
                  <FeatureIcon className="h-6 w-6 text-primary" />
                  <h2 className="mt-4 font-display text-lg font-semibold">{title as string}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy as string}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
