import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { 
  Check, X, FileText, Zap, Shield, Users, Cloud, 
  Globe, Sparkles, ArrowRight, HelpCircle
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for occasional use",
    features: [
      { name: "10 conversions/month", included: true },
      { name: "25MB file size limit", included: true },
      { name: "Basic PDF operations", included: true },
      { name: "1GB cloud storage", included: true },
      { name: "Standard processing speed", included: true },
      { name: "Email support", included: true },
      { name: "OCR (5 pages/month)", included: true },
      { name: "Batch processing", included: false },
      { name: "Team collaboration", included: false },
      { name: "API access", included: false },
      { name: "Priority support", included: false },
      { name: "Custom watermarks", included: false },
    ],
    cta: "Get Started Free",
    popular: false,
    tier: "free",
  },
  {
    name: "Pro",
    price: "$5.99",
    period: "/month",
    description: "For professionals and small teams",
    features: [
      { name: "Unlimited conversions", included: true },
      { name: "500MB file size limit", included: true },
      { name: "Advanced PDF operations", included: true },
      { name: "50GB cloud storage", included: true },
      { name: "Priority processing speed", included: true },
      { name: "Priority email support", included: true },
      { name: "Unlimited OCR", included: true },
      { name: "Batch processing (100 files)", included: true },
      { name: "Team collaboration", included: false },
      { name: "API access", included: true },
      { name: "Priority support", included: true },
      { name: "Custom watermarks", included: true },
    ],
    cta: "Upgrade to Pro",
    popular: true,
    tier: "pro",
  },
  {
    name: "Enterprise",
    price: "$28.99",
    period: "/month",
    description: "For teams and organizations",
    features: [
      { name: "Unlimited conversions", included: true },
      { name: "2GB file size limit", included: true },
      { name: "All PDF operations", included: true },
      { name: "1TB cloud storage", included: true },
      { name: "Fastest processing speed", included: true },
      { name: "24/7 dedicated support", included: true },
      { name: "Unlimited OCR", included: true },
      { name: "Batch processing (500 files)", included: true },
      { name: "Team collaboration", included: true },
      { name: "Full API access", included: true },
      { name: "Dedicated account manager", included: true },
      { name: "Custom branding", included: true },
    ],
    cta: "Contact Sales",
    popular: false,
    tier: "enterprise",
  },
];

const faqs = [
  {
    question: "Can I change my plan at any time?",
    answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate any charges."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, MasterCard, American Express), PayPal, and bank transfers for Enterprise plans."
  },
  {
    question: "Is there a free trial for paid plans?",
    answer: "Yes! All paid plans come with a 14-day free trial. No credit card required to start."
  },
  {
    question: "What happens to my files if I downgrade?",
    answer: "Your files remain safe. If you exceed the storage limit of your new plan, you won't be able to upload new files until you free up space."
  },
  {
    question: "Do you offer refunds?",
    answer: "Yes, we offer a 30-day money-back guarantee for all paid plans. No questions asked."
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We use AES-256 encryption, zero-knowledge architecture, and are compliant with GDPR, HIPAA, and SOC 2 Type II."
  },
];

export default function Pricing() {
  const { user, isAuthenticated } = useAuth();
  const { data: usageStats } = trpc.user.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const handleSelectPlan = (tier: string) => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    
    if (tier === usageStats?.tier) {
      toast.info("You're already on this plan");
      return;
    }

    if (tier === "enterprise") {
      toast.info("Please contact sales for Enterprise plans");
      return;
    }

    toast.info("Subscription management coming soon!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">ProPDFs</span>
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button variant="outline">Go to Dashboard</Button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Sign In</Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 text-center">
        <div className="container">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include our core features.
            No hidden fees, cancel anytime.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16">
        <div className="container">
          <Tabs defaultValue="monthly" className="w-full">
            <div className="flex justify-center mb-8">
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="annual">
                  Annual
                  <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                    Save 20%
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="monthly">
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans.map((plan) => (
                  <Card 
                    key={plan.name}
                    className={`relative ${plan.popular ? 'border-2 border-blue-600 shadow-lg' : ''}`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                        Most Popular
                      </div>
                    )}
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-2xl">{plan.name}</CardTitle>
                      <div className="mt-4">
                        <span className="text-4xl font-bold">{plan.price}</span>
                        <span className="text-slate-500">{plan.period}</span>
                      </div>
                      <CardDescription className="mt-2">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <Button 
                        className={`w-full ${plan.popular ? '' : 'bg-slate-900 hover:bg-slate-800'}`}
                        variant={plan.popular ? "default" : "secondary"}
                        onClick={() => handleSelectPlan(plan.tier)}
                        disabled={usageStats?.tier === plan.tier}
                      >
                        {usageStats?.tier === plan.tier ? 'Current Plan' : plan.cta}
                        {usageStats?.tier !== plan.tier && <ArrowRight className="h-4 w-4 ml-2" />}
                      </Button>
                      
                      <div className="space-y-3">
                        {plan.features.map((feature) => (
                          <div key={feature.name} className="flex items-center gap-3">
                            {feature.included ? (
                              <Check className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                              <X className="h-5 w-5 text-slate-300 shrink-0" />
                            )}
                            <span className={feature.included ? 'text-slate-700' : 'text-slate-400'}>
                              {feature.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="annual">
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans.map((plan) => {
                  const annualPrice = plan.price === "$0" 
                    ? "$0" 
                    : `$${(parseFloat(plan.price.replace('$', '')) * 12 * 0.8).toFixed(0)}`;
                  return (
                    <Card 
                      key={plan.name}
                      className={`relative ${plan.popular ? 'border-2 border-blue-600 shadow-lg' : ''}`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                          Most Popular
                        </div>
                      )}
                      <CardHeader className="text-center pb-2">
                        <CardTitle className="text-2xl">{plan.name}</CardTitle>
                        <div className="mt-4">
                          <span className="text-4xl font-bold">{annualPrice}</span>
                          <span className="text-slate-500">{plan.price === "$0" ? "/forever" : "/year"}</span>
                        </div>
                        <CardDescription className="mt-2">{plan.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <Button 
                          className={`w-full ${plan.popular ? '' : 'bg-slate-900 hover:bg-slate-800'}`}
                          variant={plan.popular ? "default" : "secondary"}
                          onClick={() => handleSelectPlan(plan.tier)}
                          disabled={usageStats?.tier === plan.tier}
                        >
                          {usageStats?.tier === plan.tier ? 'Current Plan' : plan.cta}
                          {usageStats?.tier !== plan.tier && <ArrowRight className="h-4 w-4 ml-2" />}
                        </Button>
                        
                        <div className="space-y-3">
                          {plan.features.map((feature) => (
                            <div key={feature.name} className="flex items-center gap-3">
                              {feature.included ? (
                                <Check className="h-5 w-5 text-green-500 shrink-0" />
                              ) : (
                                <X className="h-5 w-5 text-slate-300 shrink-0" />
                              )}
                              <span className={feature.included ? 'text-slate-700' : 'text-slate-400'}>
                                {feature.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-16 bg-slate-50">
        <div className="container">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Why Choose ProPDFs?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Lightning Fast</h3>
                <p className="text-sm text-slate-600">
                  Sub-100ms response times with our global CDN
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Enterprise Security</h3>
                <p className="text-sm text-slate-600">
                  AES-256 encryption, SOC 2, HIPAA compliant
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Team Ready</h3>
                <p className="text-sm text-slate-600">
                  Collaborate with role-based access control
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center mx-auto mb-4">
                  <Globe className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">50+ Languages</h3>
                <p className="text-sm text-slate-600">
                  OCR and interface in over 50 languages
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16">
        <div className="container">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Frequently Asked Questions
          </h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {faqs.map((faq, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-start gap-3">
                    <HelpCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    {faq.question}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals who trust ProPDFs for their document needs.
            Start with our free plan today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/convert">
              <Button size="lg" variant="secondary" className="gap-2">
                <Sparkles className="h-5 w-5" />
                Try Free Now
              </Button>
            </Link>
            <a href={getLoginUrl()}>
              <Button size="lg" variant="outline" className="gap-2 border-white text-white hover:bg-white hover:text-slate-900">
                Create Account
                <ArrowRight className="h-5 w-5" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-white">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              <span className="font-bold text-slate-900">ProPDFs</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-600">
              <a href="#" className="hover:text-blue-600">Privacy Policy</a>
              <a href="#" className="hover:text-blue-600">Terms of Service</a>
              <a href="#" className="hover:text-blue-600">Contact</a>
            </div>
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} ProPDFs. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
