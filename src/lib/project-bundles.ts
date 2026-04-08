// Pre-extracted source project data from cross-project tools
// This serves as the bridge between Lovable cross-project tools (server-side)
// and the browser-side extraction pipeline

import type { SourceProjectFiles } from '@/lib/source-extractor';

export interface ProjectSourceBundle {
  projectId: string;
  projectName: string;
  files: SourceProjectFiles;
}

// Woven Waves Landing — extracted via cross-project tools
const WOVEN_WAVES_LANDING: ProjectSourceBundle = {
  projectId: 'eb365d77-280e-413a-ac01-0dbd5bf741fc',
  projectName: 'Woven Waves Landing',
  files: {
    indexCss: `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@400;500;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 195 30% 6%;
    --foreground: 180 20% 92%;
    --card: 195 25% 10%;
    --card-foreground: 180 20% 92%;
    --popover: 195 25% 10%;
    --popover-foreground: 180 20% 92%;
    --primary: 170 60% 45%;
    --primary-foreground: 195 30% 6%;
    --secondary: 195 20% 16%;
    --secondary-foreground: 180 20% 85%;
    --muted: 195 15% 14%;
    --muted-foreground: 195 15% 55%;
    --accent: 16 80% 58%;
    --accent-foreground: 195 30% 6%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 195 20% 18%;
    --input: 195 20% 18%;
    --ring: 170 60% 45%;
    --radius: 0.75rem;
  }
}`,

    tailwindConfig: `export default {
  theme: {
    extend: {
      fontFamily: {
        display: ["Playfair Display", "serif"],
        body: ["DM Sans", "sans-serif"],
      },
    },
  },
}`,

    appTsx: `import { BrowserRouter, Route, Routes } from "react-router-dom";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);`,

    indexPage: `import HeroSection from "@/components/HeroSection";
import CoursesSection from "@/components/CoursesSection";
import StatsSection from "@/components/StatsSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const Index = () => (
  <main className="min-h-screen bg-background">
    <HeroSection />
    <StatsSection />
    <CoursesSection />
    <TestimonialsSection />
    <CTASection />
    <Footer />
  </main>
);`,

    components: {
      'src/components/HeroSection.tsx': `import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-underwater.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <img src={heroImage} alt="Scuba diver weaving a basket underwater among coral reefs" className="absolute inset-0 w-full h-full object-cover" />
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <p className="text-primary font-body text-sm tracking-[0.3em] uppercase mb-6">Est. 1997 · The Original & The Best</p>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.95] mb-6">
          Master the Art of Underwater Basketweaving
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 font-body">
          Dive deep into the world's most exclusive craft. Certified instructors, pristine reefs, and the finest seagrass materials — all 30 feet below the surface.
        </p>
        <Button size="lg">Book Your First Dive</Button>
        <Button variant="outline" size="lg">Watch Trailer</Button>
      </div>
    </section>
  );
};`,

      'src/components/StatsSection.tsx': `const stats = [
  { value: "2,400+", label: "Graduates Certified" },
  { value: "27", label: "Years Teaching" },
  { value: "12", label: "Reef Locations" },
  { value: "98%", label: "Would Dive Again" },
];

const StatsSection = () => (
  <section className="py-20 px-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <p className="font-display text-4xl md:text-5xl font-bold text-primary mb-2">{stat.value}</p>
          <p className="text-muted-foreground font-body text-sm">{stat.label}</p>
        </div>
      ))}
    </div>
  </section>
);`,

      'src/components/CoursesSection.tsx': `import classSession from "@/assets/class-session.jpg";
import basketProduct from "@/assets/basket-product.jpg";

const courses = [
  {
    title: "Beginner Weave",
    meta: "10ft · 2 Days",
    description: "Learn the fundamentals of underwater reed selection, basic weave patterns, and breath-synchronized crafting.",
    price: "$349",
    image: classSession,
    badge: "Most Popular",
  },
  {
    title: "Advanced Patterns",
    meta: "30ft · 5 Days",
    description: "Master complex herringbone and spiral techniques while navigating coral formations. Includes night-weave session.",
    price: "$899",
    image: basketProduct,
  },
  {
    title: "Master Artisan",
    meta: "60ft · 2 Weeks",
    description: "The ultimate certification. Deep-water weaving with kelp, pearl inlay, and a final exhibition piece judged by our panel.",
    price: "$2,400",
    image: classSession,
    badge: "Limited Spots",
  },
];

const CoursesSection = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-primary font-body text-sm tracking-[0.25em] uppercase mb-3">Our Programs</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">Choose Your Depth</h2>
          <p className="text-muted-foreground max-w-xl mx-auto font-body">
            From shallow-water fundamentals to deep-sea mastery — every course includes equipment, materials, and marine biologist supervision.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card key={course.title} className="overflow-hidden bg-card border-border/40">
              <img src={course.image} alt={course.title} className="w-full h-48 object-cover" />
              <CardContent className="p-6">
                <h3 className="font-display text-2xl font-bold mb-3">{course.title}</h3>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">{course.meta}</p>
                <p className="text-muted-foreground font-body mb-6">{course.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-primary font-display text-2xl font-bold">{course.price}</span>
                  <span className="text-primary text-sm">Learn more →</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};`,
 
      'src/components/TestimonialsSection.tsx': `const testimonials = [
  {
    name: "Jordan Reed",
    role: "Master Artisan Graduate, 2024",
    quote: "I never thought I'd find my calling at 40 feet below sea level. Now I sell my baskets at galleries in Maui.",
  },
  {
    name: "Priya Nair",
    role: "Beginner Weave, Bali Campus",
    quote: "The instructors are incredibly patient — even when a curious sea turtle unraveled my entire second basket.",
  },
  {
    name: "Marcus Holm",
    role: "Advanced Patterns, Maldives",
    quote: "Worth every penny. The bioluminescent night-weave session alone changed my entire perspective on craft.",
  },
];

const TestimonialsSection = () => (
  <section className="py-24 px-6">
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <p className="text-primary font-body text-sm tracking-[0.25em] uppercase mb-3">Testimonials</p>
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">What Our Divers Say</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((testimonial) => (
          <Card key={testimonial.name} className="bg-card border-border/40 p-6">
            <p className="text-secondary-foreground italic font-body mb-6">“{testimonial.quote}”</p>
            <div>
              <p className="font-display text-lg font-bold">{testimonial.name}</p>
              <p className="text-muted-foreground text-sm">{testimonial.role}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  </section>
);`,

      'src/components/CTASection.tsx': `const CTASection = () => (
  <section className="py-24 px-6">
    <div className="max-w-3xl mx-auto text-center bg-secondary rounded-2xl p-12 md:p-16">
      <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">Ready to Take the Plunge?</h2>
      <p className="text-muted-foreground font-body max-w-lg mx-auto mb-8">
        Next cohort starts June 15th in Bali. Limited to 8 students per instructor for personalized, one-on-one reef time.
      </p>
      <Button size="lg">Reserve Your Spot</Button>
    </div>
  </section>
);`,

      'src/components/Footer.tsx': `const Footer = () => (
  <footer className="border-t border-border/30 py-12 px-6">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div>
        <p className="font-display text-xl font-bold text-foreground">DeepWeave Academy</p>
        <p className="text-muted-foreground text-sm font-body">The world's premier underwater basketweaving school.</p>
      </div>
      <div className="flex gap-8 text-sm text-muted-foreground font-body">
        <a href="#">Courses</a>
        <a href="#">Locations</a>
        <a href="#">FAQ</a>
        <a href="#">Contact</a>
      </div>
      <p className="text-muted-foreground text-xs font-body">© 2026 DeepWeave Academy</p>
    </div>
  </footer>
);`,
    },

    assets: [
      'src/assets/hero-underwater.jpg',
      'src/assets/basket-product.jpg',
      'src/assets/class-session.jpg',
    ],

    imageUrls: {
      'src/assets/hero-underwater.jpg': 'https://qvkqcrjykswbiqvrxhks.supabase.co/storage/v1/object/public/theme-assets/woven-waves/hero-underwater.jpg',
      'src/assets/basket-product.jpg': 'https://qvkqcrjykswbiqvrxhks.supabase.co/storage/v1/object/public/theme-assets/woven-waves/basket-product.jpg',
      'src/assets/class-session.jpg': 'https://qvkqcrjykswbiqvrxhks.supabase.co/storage/v1/object/public/theme-assets/woven-waves/class-session.jpg',
    },

    pages: {
      'src/pages/Index.tsx': `import HeroSection from "@/components/HeroSection";
import CoursesSection from "@/components/CoursesSection";
import StatsSection from "@/components/StatsSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

const Index = () => (
  <main className="min-h-screen bg-background">
    <HeroSection />
    <StatsSection />
    <CoursesSection />
    <TestimonialsSection />
    <CTASection />
    <Footer />
  </main>
);`,
    },
  },
};

// Brand Brilliance Studio (Pixel Perfect Design Co)
const BRAND_BRILLIANCE_STUDIO: ProjectSourceBundle = {
  projectId: '4c253e87-cce3-43ef-baf0-8d07dea63406',
  projectName: 'Brand Brilliance Studio',
  files: {
    indexCss: `@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Work+Sans:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 210 20% 98%;
    --foreground: 213 52% 15%;
    --card: 0 0% 100%;
    --card-foreground: 213 52% 15%;
    --popover: 0 0% 100%;
    --popover-foreground: 213 52% 15%;
    --primary: 213 52% 24%;
    --primary-foreground: 42 30% 95%;
    --secondary: 213 30% 92%;
    --secondary-foreground: 213 52% 24%;
    --muted: 210 20% 94%;
    --muted-foreground: 213 30% 45%;
    --accent: 42 76% 60%;
    --accent-foreground: 213 52% 15%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 213 20% 88%;
    --input: 213 20% 88%;
    --ring: 42 76% 60%;
    --radius: 0.5rem;
    --gold: 42 76% 60%;
    --gold-light: 42 70% 75%;
    --gold-dark: 42 80% 45%;
    --navy: 213 52% 24%;
    --navy-light: 213 40% 35%;
    --navy-dark: 213 60% 15%;
    --gradient-hero: linear-gradient(135deg, hsl(213 52% 24%) 0%, hsl(213 60% 15%) 100%);
    --gradient-gold: linear-gradient(135deg, hsl(42 76% 60%) 0%, hsl(42 80% 50%) 100%);
    --gradient-subtle: linear-gradient(180deg, hsl(210 20% 98%) 0%, hsl(213 30% 92%) 100%);
    --shadow-soft: 0 4px 20px -4px hsl(213 52% 24% / 0.08);
    --shadow-medium: 0 8px 30px -8px hsl(213 52% 24% / 0.12);
    --shadow-elevated: 0 20px 50px -15px hsl(213 52% 24% / 0.15);
    --shadow-gold: 0 4px 25px -5px hsl(42 76% 60% / 0.35);
  }
}`,

    tailwindConfig: `export default {
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Libre Baskerville"', 'Georgia', 'serif'],
        body: ['"Work Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        gold: {
          DEFAULT: "hsl(var(--gold))",
          light: "hsl(var(--gold-light))",
          dark: "hsl(var(--gold-dark))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy))",
          light: "hsl(var(--navy-light))",
          dark: "hsl(var(--navy-dark))",
        },
      },
    },
  },
}`,

    appTsx: `import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Services from "@/pages/Services";
import WorkWithMe from "@/pages/WorkWithMe";
import Blog from "@/pages/Blog";
import Contact from "@/pages/Contact";
import LeadMagnet from "@/pages/LeadMagnet";
import NotFound from "@/pages/NotFound";

const App = () => (
  <BrowserRouter>
    <Header />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/services" element={<Services />} />
      <Route path="/work-with-me" element={<WorkWithMe />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/lead-magnet" element={<LeadMagnet />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    <Footer />
  </BrowserRouter>
);`,

    indexPage: `import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Target, Zap, Users, Star, CheckCircle } from "lucide-react";

const Home = () => {
  const testimonials = [
    { quote: "Pixel Perfect transformed our brand from forgettable to unforgettable. The ROI has been incredible.", author: "Sarah Chen", role: "Founder, TechFlow", rating: 5 },
    { quote: "Working with them was a joy. They truly understood our vision and brought it to life beautifully.", author: "Marcus Williams", role: "CEO, Elevate Coaching", rating: 5 },
    { quote: "Our rebrand resulted in a 3x increase in qualified leads. Worth every penny.", author: "Emma Rodriguez", role: "Founder, Bloom Wellness", rating: 5 },
  ];

  const problems = [
    { icon: Target, title: "Blending Into the Crowd", description: "Your brand looks like everyone else's. Potential customers scroll right past without a second glance." },
    { icon: Zap, title: "Inconsistent Presence", description: "Different colors, fonts, and messaging across platforms create confusion and erode trust." },
    { icon: Users, title: "Attracting the Wrong Clients", description: "Without clear brand positioning, you end up with price-focused clients instead of value-aligned ones." },
  ];

  const solutions = [
    "Strategic brand positioning that sets you apart",
    "Cohesive visual identity across all touchpoints",
    "Premium brand assets that attract ideal clients",
    "Clear brand guidelines for consistent execution",
  ];

  return (
    <main>
      {/* Hero Section */}
      <section className="relative gradient-hero overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent rounded-full blur-3xl" />
        </div>
        <div className="container relative section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 mb-8">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-primary-foreground/80">Premium Brand Design Agency</span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-primary-foreground mb-6 leading-tight">
              Brands That Get <span className="text-gradient-gold">Noticed</span>
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/70 mb-10 max-w-2xl mx-auto leading-relaxed">
              We create distinctive visual identities for ambitious founders who want to stand out in crowded markets.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/contact"><Button variant="hero">Book a Discovery Call<ArrowRight className="h-5 w-5 ml-2" /></Button></Link>
              <Link to="/services"><Button variant="hero-outline">View Our Work</Button></Link>
            </div>
            <div className="mt-16 flex items-center justify-center gap-8 text-primary-foreground/60">
              <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-accent" /><span className="text-sm">50+ Brands Launched</span></div>
              <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-accent" /><span className="text-sm">5-Star Reviews</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="section-padding gradient-subtle">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl mb-6">Is Your Brand Holding You Back?</h2>
            <p className="text-lg text-muted-foreground">Many talented founders struggle to attract their ideal clients because their brand doesn't reflect their true value.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {problems.map((problem, index) => (
              <div key={index} className="card-elevated p-8 hover:border-accent/30 transition-all duration-300">
                <div className="w-14 h-14 rounded-xl gradient-gold flex items-center justify-center mb-6">
                  <problem.icon className="h-7 w-7 text-accent-foreground" />
                </div>
                <h3 className="font-heading text-xl mb-4">{problem.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{problem.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="section-padding">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl mb-6">Your Brand, <span className="text-gradient-gold">Elevated</span></h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">We partner with ambitious founders to create brand identities that command attention, build trust, and attract premium clients.</p>
              <ul className="space-y-4 mb-10">
                {solutions.map((solution, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle className="h-6 w-6 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{solution}</span>
                  </li>
                ))}
              </ul>
              <Link to="/services"><Button variant="default" size="lg">Explore Our Services<ArrowRight className="h-5 w-5 ml-2" /></Button></Link>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-2xl gradient-hero shadow-elevated flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="w-24 h-24 mx-auto rounded-2xl gradient-gold flex items-center justify-center mb-6 shadow-gold">
                    <span className="font-heading text-4xl font-bold text-accent-foreground">P</span>
                  </div>
                  <p className="text-primary-foreground/80 font-heading text-xl">Premium Brand Design</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="section-padding bg-secondary">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl mb-6">Loved by Founders</h2>
            <p className="text-lg text-muted-foreground">Don't just take our word for it—hear from the entrepreneurs who've transformed their brands with us.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-card p-8 rounded-xl shadow-soft border border-border/50">
                <div className="flex gap-1 mb-6">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-accent text-accent" />
                  ))}
                </div>
                <blockquote className="text-foreground mb-6 leading-relaxed">"{testimonial.quote}"</blockquote>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.author}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding gradient-hero">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl text-primary-foreground mb-6">Ready to Stand Out?</h2>
            <p className="text-xl text-primary-foreground/70 mb-10">Let's discuss how we can transform your brand into an unforgettable experience for your ideal clients.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/contact"><Button variant="hero">Book a Discovery Call<ArrowRight className="h-5 w-5 ml-2" /></Button></Link>
              <Link to="/lead-magnet"><Button variant="hero-outline">Get Free Branding Guide</Button></Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};`,

    components: {
      'src/components/Header.tsx': `import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Services", path: "/services" },
    { name: "Work With Me", path: "/work-with-me" },
    { name: "Blog", path: "/blog" },
    { name: "Contact", path: "/contact" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur">
      <div className="container flex h-20 items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg gradient-gold flex items-center justify-center">
            <span className="font-heading font-bold text-accent-foreground text-lg">P</span>
          </div>
          <span className="font-heading font-bold text-xl text-foreground hidden sm:block">Pixel Perfect</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link key={link.path} to={link.path} className={\`px-4 py-2 rounded-md text-sm font-medium transition-colors \${isActive(link.path) ? "text-accent bg-accent/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}\`}>
              {link.name}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-4">
          <Link to="/lead-magnet"><Button variant="outline" size="sm">Free Guide</Button></Link>
          <Link to="/contact"><Button size="sm">Book a Call</Button></Link>
        </div>
        <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
    </header>
  );
};`,

      'src/components/Footer.tsx': `import { Link } from "react-router-dom";
import { Instagram, Linkedin, Mail } from "lucide-react";

const Footer = () => {
  const footerLinks = {
    company: [
      { name: "About", path: "/about" },
      { name: "Services", path: "/services" },
      { name: "Blog", path: "/blog" },
      { name: "Contact", path: "/contact" },
    ],
    resources: [
      { name: "Free Branding Guide", path: "/lead-magnet" },
      { name: "Case Studies", path: "/services#portfolio" },
    ],
  };

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container section-padding">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-lg gradient-gold flex items-center justify-center">
                <span className="font-heading font-bold text-accent-foreground text-xl">P</span>
              </div>
              <span className="font-heading font-bold text-2xl">Pixel Perfect</span>
            </Link>
            <p className="text-primary-foreground/70 max-w-md mb-6 leading-relaxed">
              A premium brand design agency specializing in visual identities for ambitious startups and personal brands.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://instagram.com" className="p-3 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20"><Instagram className="h-5 w-5" /></a>
              <a href="https://linkedin.com" className="p-3 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20"><Linkedin className="h-5 w-5" /></a>
              <a href="mailto:hello@pixelperfect.com" className="p-3 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20"><Mail className="h-5 w-5" /></a>
            </div>
          </div>
          <div>
            <h4 className="font-heading font-bold text-lg mb-6">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.path}><Link to={link.path} className="text-primary-foreground/70 hover:text-accent">{link.name}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-heading font-bold text-lg mb-6">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.path}><Link to={link.path} className="text-primary-foreground/70 hover:text-accent">{link.name}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-primary-foreground/10 mt-16 pt-8 text-center text-primary-foreground/50 text-sm">
          © 2026 Pixel Perfect Design Co. All rights reserved.
        </div>
      </div>
    </footer>
  );
};`,
    },

    assets: [],
    imageUrls: {},

    pages: {
      'src/pages/Home.tsx': `/* same as indexPage above */`,
    },
  },
};

// Registry of all pre-extracted project bundles
const PROJECT_BUNDLES: Record<string, ProjectSourceBundle> = {
  'eb365d77-280e-413a-ac01-0dbd5bf741fc': WOVEN_WAVES_LANDING,
  '4c253e87-cce3-43ef-baf0-8d07dea63406': BRAND_BRILLIANCE_STUDIO,
};

export function getProjectBundle(projectId: string): ProjectSourceBundle | null {
  return PROJECT_BUNDLES[projectId] || null;
}

export function hasProjectBundle(projectId: string): boolean {
  return projectId in PROJECT_BUNDLES;
}
