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

// Registry of all pre-extracted project bundles
const PROJECT_BUNDLES: Record<string, ProjectSourceBundle> = {
  'eb365d77-280e-413a-ac01-0dbd5bf741fc': WOVEN_WAVES_LANDING,
};

export function getProjectBundle(projectId: string): ProjectSourceBundle | null {
  return PROJECT_BUNDLES[projectId] || null;
}

export function hasProjectBundle(projectId: string): boolean {
  return projectId in PROJECT_BUNDLES;
}
