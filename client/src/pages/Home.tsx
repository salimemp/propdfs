import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { 
  FileText, Shield, Zap, Users, Cloud, Globe, 
  ArrowRight, CheckCircle, Upload, Download, 
  Lock, BarChart3, Sparkles, Mic
} from "lucide-react";
import { Link } from "wouter";

const features = [
  {
    icon: FileText,
    title: "Universal Format Support",
    description: "Convert between PDF, Word, Excel, PowerPoint, images, e-books, CAD files, and more with 99%+ accuracy."
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Process files in seconds with our serverless architecture. Sub-100ms response times worldwide."
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "AES-256 encryption, zero-knowledge architecture, and compliance with GDPR, HIPAA, SOC 2."
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Role-based access, shared workspaces, approval workflows, and real-time annotations."
  },
  {
    icon: Cloud,
    title: "Cloud Storage",
    description: "Up to 1TB encrypted storage with smart sync, automatic backups, and point-in-time recovery."
  },
  {
    icon: Globe,
    title: "50+ Languages",
    description: "OCR and interface support for over 50 languages with AI-powered translation."
  },
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Smart document classification, auto metadata extraction, and intelligent compression."
  },
  {
    icon: Mic,
    title: "Voice to Text",
    description: "Convert audio recordings to text documents with automatic transcription in 50+ languages."
  }
];

const conversionTypes = [
  { from: "PDF", to: "Word", icon: "📄" },
  { from: "PDF", to: "Excel", icon: "📊" },
  { from: "PDF", to: "PowerPoint", icon: "📽️" },
  { from: "Image", to: "PDF", icon: "🖼️" },
  { from: "Word", to: "PDF", icon: "📝" },
  { from: "HTML", to: "PDF", icon: "🌐" },
];

const pdfOperations = [
  { name: "Merge PDFs", icon: "🔗" },
  { name: "Split PDF", icon: "✂️" },
  { name: "Compress", icon: "📦" },
  { name: "Rotate Pages", icon: "🔄" },
  { name: "Watermark", icon: "💧" },
  { name: "Encrypt", icon: "🔐" },
];

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">ProPDFs</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/convert" className="text-slate-600 hover:text-slate-900 transition-colors">Convert</Link>
            <Link href="/pricing" className="text-slate-600 hover:text-slate-900 transition-colors">Pricing</Link>
            <a href="#features" className="text-slate-600 hover:text-slate-900 transition-colors">Features</a>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button>Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <a href={getLoginUrl()}>
                  <Button variant="ghost">Sign In</Button>
                </a>
                <a href={getLoginUrl()}>
                  <Button>Get Started Free</Button>
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              AI-Powered Document Processing
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              Professional PDF Conversion
              <span className="text-blue-600"> Made Simple</span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
              Convert, edit, and manage your documents with enterprise-grade security. 
              No registration required for basic conversions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/convert">
                <Button size="lg" className="gap-2 text-lg px-8">
                  <Upload className="h-5 w-5" />
                  Start Converting
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="gap-2 text-lg px-8">
                  View Pricing
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                No watermarks
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                10 free conversions/month
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                25MB file limit
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Conversion Cards */}
      <section className="py-16 bg-slate-50">
        <div className="container">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-8">Popular Conversions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {conversionTypes.map((type) => (
              <Link href="/convert" key={`${type.from}-${type.to}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl mb-2">{type.icon}</div>
                    <div className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                      {type.from} → {type.to}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PDF Operations */}
      <section className="py-16">
        <div className="container">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-8">PDF Operations</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {pdfOperations.map((op) => (
              <Link href="/convert" key={op.name}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl mb-2">{op.icon}</div>
                    <div className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                      {op.name}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-slate-50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Everything You Need</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From simple conversions to enterprise workflows, ProPDFs has you covered.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-600">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg text-slate-600">No hidden fees. Cancel anytime.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Tier */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <div className="text-3xl font-bold">$0</div>
                <CardDescription>Perfect for occasional use</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  10 conversions/month
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  25MB file size limit
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Basic PDF operations
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  1GB cloud storage
                </div>
                <Link href="/convert" className="block mt-6">
                  <Button variant="outline" className="w-full">Get Started</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Pro Tier */}
            <Card className="border-2 border-blue-600 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                Most Popular
              </div>
              <CardHeader>
                <CardTitle>Pro</CardTitle>
                <div className="text-3xl font-bold">$5.99<span className="text-lg font-normal text-slate-500">/mo</span></div>
                <CardDescription>For professionals and small teams</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Unlimited conversions
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  500MB file size limit
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Advanced PDF operations
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  50GB cloud storage
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  OCR & AI features
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Priority support
                </div>
                <Link href="/pricing" className="block mt-6">
                  <Button className="w-full">Upgrade to Pro</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Enterprise Tier */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <div className="text-3xl font-bold">$28.99<span className="text-lg font-normal text-slate-500">/mo</span></div>
                <CardDescription>For teams and organizations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Everything in Pro
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  2GB file size limit
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  1TB cloud storage
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Team collaboration
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Batch processing (500 files)
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  24/7 dedicated support
                </div>
                <Link href="/pricing" className="block mt-6">
                  <Button variant="outline" className="w-full">Contact Sales</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="container">
          <div className="text-center mb-12">
            <Lock className="h-12 w-12 mx-auto mb-4 text-blue-400" />
            <h2 className="text-3xl font-bold mb-4">Enterprise-Grade Security</h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Your documents are protected with military-grade encryption and zero-knowledge architecture.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-blue-400 mb-2">AES-256</div>
              <div className="text-slate-300">Encryption</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-400 mb-2">99.9%</div>
              <div className="text-slate-300">Uptime SLA</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-400 mb-2">SOC 2</div>
              <div className="text-slate-300">Type II Certified</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-400 mb-2">HIPAA</div>
              <div className="text-slate-300">Compliant</div>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-8 flex-wrap">
            <div className="px-4 py-2 bg-slate-800 rounded-lg text-sm">GDPR</div>
            <div className="px-4 py-2 bg-slate-800 rounded-lg text-sm">CCPA</div>
            <div className="px-4 py-2 bg-slate-800 rounded-lg text-sm">PIPEDA</div>
            <div className="px-4 py-2 bg-slate-800 rounded-lg text-sm">ISO 27001</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Ready to Transform Your Document Workflow?
            </h2>
            <p className="text-lg text-slate-600 mb-8">
              Join thousands of professionals who trust ProPDFs for their document needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/convert">
                <Button size="lg" className="gap-2">
                  <Upload className="h-5 w-5" />
                  Start Converting Free
                </Button>
              </Link>
              <a href={getLoginUrl()}>
                <Button size="lg" variant="outline" className="gap-2">
                  Create Account
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-slate-50">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-6 w-6 text-blue-600" />
                <span className="font-bold text-slate-900">ProPDFs</span>
              </div>
              <p className="text-sm text-slate-600">
                Professional PDF conversion and document management for everyone.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="/convert" className="hover:text-blue-600">Convert</Link></li>
                <li><Link href="/pricing" className="hover:text-blue-600">Pricing</Link></li>
                <li><a href="#features" className="hover:text-blue-600">Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><a href="#" className="hover:text-blue-600">About</a></li>
                <li><a href="#" className="hover:text-blue-600">Blog</a></li>
                <li><a href="#" className="hover:text-blue-600">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><a href="#" className="hover:text-blue-600">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-blue-600">Terms of Service</a></li>
                <li><a href="#" className="hover:text-blue-600">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} ProPDFs. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Ad Placeholder - Bottom Banner (Freemium) */}
      {!isAuthenticated && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-100 border-t p-3 text-center text-sm text-slate-500">
          <div className="container flex items-center justify-between">
            <span>Advertisement</span>
            <div className="bg-slate-200 px-4 py-2 rounded text-xs">Ad Space - 728x90</div>
            <a href={getLoginUrl()} className="text-blue-600 hover:underline">Remove ads with Pro</a>
          </div>
        </div>
      )}
    </div>
  );
}
