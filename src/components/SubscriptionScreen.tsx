import { useState } from "react";
import { motion } from "framer-motion";
import { X, Zap, Calendar, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type PricingOption = {
  id: string;
  price: string;
  period: string;
  badge?: string;
};

export type Feature = {
  icon: React.ReactNode;
  text: string;
};

export type SubscriptionScreenProps = {
  backgroundImageSrc?: string;
  headerImageSrc?: string;
  appName?: string;
  planType?: string;
  features?: Feature[];
  pricingOptions: PricingOption[];
  defaultPlanId?: string;
  subscribeButtonText?: string;
  footerText?: string;
  busy?: boolean;
  onClose?: () => void;
  onSubscribe: (planId: string) => void;
};

const defaultFeatures: Feature[] = [
  { icon: <Calendar className="h-5 w-5 text-primary" />, text: "Book charging slots at any station" },
  { icon: <Zap className="h-5 w-5 text-primary" />, text: "Priority access during peak hours" },
  { icon: <MapPin className="h-5 w-5 text-primary" />, text: "Real-time availability & alerts" },
  { icon: <Star className="h-5 w-5 text-primary" />, text: "Save favorite stations & vehicles" },
];

export function SubscriptionScreen({
  backgroundImageSrc = "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?q=80&w=2072&auto=format&fit=crop",
  headerImageSrc,
  appName = "EV ChargeHub",
  planType = "Premium",
  features = defaultFeatures,
  pricingOptions,
  defaultPlanId,
  subscribeButtonText = "Subscribe now",
  footerText = "Cancel anytime. Includes 18% GST.",
  busy,
  onClose,
  onSubscribe,
}: SubscriptionScreenProps) {
  const [selected, setSelected] = useState(
    defaultPlanId ?? (pricingOptions[0]?.id || ""),
  );

  const selectedOption = pricingOptions.find((p) => p.id === selected) ?? pricingOptions[0];

  return (
    <div className="relative flex min-h-[600px] w-full max-w-md flex-col items-center justify-end overflow-hidden rounded-3xl bg-background shadow-2xl">
      {/* Background */}
      <img
        alt="EV charging station at night"
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src={backgroundImageSrc}
      />
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Close */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center absolute top-4 right-4 z-20 rounded-full bg-black/30 text-white hover:bg-black/50 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Bottom panel */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex w-full flex-col items-center rounded-t-3xl bg-background/85 px-6 pt-8 pb-6 backdrop-blur-xl"
      >
        {/* Header graphic */}
        {headerImageSrc ? (
          <motion.img
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            alt="Header Graphic"
            className="absolute -top-20 h-32 w-32 object-contain drop-shadow-lg"
            src={headerImageSrc}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="absolute -top-20 flex h-28 w-28 items-center justify-center rounded-full bg-primary/10 shadow-lg ring-1 ring-primary/20"
          >
            <Zap className="h-14 w-14 text-primary" />
          </motion.div>
        )}

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-16 text-center"
        >
          <h1 className="font-display text-2xl font-bold text-foreground">
            {appName} <span className="font-medium text-primary">{planType}</span>
          </h1>
        </motion.div>

        {/* Features */}
        <ul className="mt-6 w-full space-y-3 self-start">
          {features.map((feature, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.08, duration: 0.4 }}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              {feature.icon}
              <span>{feature.text}</span>
            </motion.li>
          ))}
        </ul>

        {/* Pricing options */}
        <div
          role="radiogroup"
          aria-required="false"
          dir="ltr"
          className="mt-8 grid w-full gap-3"
          tabIndex={0}
        >
          {pricingOptions.map((option, i) => {
            const checked = selected === option.id;
            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 + i * 0.08, duration: 0.4 }}
                className="relative"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  id={option.id}
                  value={option.id}
                  onClick={() => setSelected(option.id)}
                  className="peer sr-only"
                  tabIndex={-1}
                />
                <label
                  htmlFor={option.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all hover:bg-muted",
                    checked
                      ? "border-primary bg-primary/10"
                      : "border-transparent bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                        checked ? "border-primary" : "border-muted-foreground",
                      )}
                    >
                      {checked && <div className="h-3 w-3 rounded-full bg-primary" />}
                    </div>
                    <span className="font-semibold text-foreground">{option.price}</span>
                    <span className="text-sm text-muted-foreground">{option.period}</span>
                  </div>
                  {option.badge && (
                    <div className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      {option.badge}
                    </div>
                  )}
                </label>
              </motion.div>
            );
          })}
        </div>

        {/* Subscribe button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.4 }}
          type="button"
          disabled={busy || !selectedOption}
          onClick={() => selectedOption && onSubscribe(selectedOption.id)}
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-8 text-lg font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? "Opening Razorpay…" : subscribeButtonText}
        </motion.button>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.4 }}
          className="mt-4 text-center text-xs text-muted-foreground"
        >
          {footerText}
        </motion.p>
      </motion.div>
    </div>
  );
}
