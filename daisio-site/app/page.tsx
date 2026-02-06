'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen bg-daisio-dark">
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-daisio-dark/90 backdrop-blur-lg border-b border-daisio-border' : ''
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="text-xl font-bold text-white">Daisio</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-daisio-text-muted hover:text-white transition-colors text-sm">Features</a>
            <a href="#how-it-works" className="text-daisio-text-muted hover:text-white transition-colors text-sm">How It Works</a>
            <a href="#pricing" className="text-daisio-text-muted hover:text-white transition-colors text-sm">Pricing</a>
            <a href="#contact" className="btn-primary px-5 py-2 rounded-lg text-white font-medium text-sm">
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[80px]" />
        </div>
        
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-daisio-card border border-daisio-border mb-8">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-daisio-text-muted">Trusted by 50+ creator agencies</span>
          </div>
          
          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="text-white">Automated</span>
            <br />
            <span className="gradient-text">Split Payments</span>
            <br />
            <span className="text-white">for Creators</span>
          </h1>
          
          <p className="text-xl text-daisio-text-muted max-w-2xl mx-auto mb-10">
            The payment infrastructure built for creator agencies. 
            Automatically split revenue between creators and management — transparent, compliant, instant.
          </p>
          
          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href="#contact" className="btn-primary px-10 py-4 rounded-xl text-white font-bold text-lg">
              Request Demo →
            </a>
            <a href="#how-it-works" className="px-10 py-4 rounded-xl text-white font-medium text-lg border border-daisio-border hover:border-blue-500/50 transition-colors">
              See How It Works
            </a>
          </div>
          
          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-12">
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text">$50M+</div>
              <div className="text-sm text-daisio-text-muted mt-1">Processed Monthly</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text">50+</div>
              <div className="text-sm text-daisio-text-muted mt-1">Partner Agencies</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text">5,000+</div>
              <div className="text-sm text-daisio-text-muted mt-1">Creators Paid</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text">99.9%</div>
              <div className="text-sm text-daisio-text-muted mt-1">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* Partner Logos - Marquee Style */}
      <section className="py-12 border-y border-daisio-border bg-daisio-darker overflow-hidden">
        <p className="text-center text-sm text-daisio-text-muted mb-8">TRUSTED BY THE TOP AGENCIES</p>
        <div className="relative">
          {/* First Row */}
          <div className="flex gap-4 animate-marquee mb-4">
            {[
              'Luxe Management', '222 MGMT', 'Nova Digital', 'Halo Management', 'VELVET',
              'Apex Creators', 'Prime Social', 'EMBER', 'Luxe Digital', 'Crown Media',
              'Slate Studios', 'Elite Creator Co', 'Neon Collective', 'Ivy League Social', 'PHANTOM',
              'Blush Media', 'ONYX MGMT', 'Eclipse Agency', 'Radiant Creators', 'VIBE STUDIOS',
              'Luxe Management', '222 MGMT', 'Nova Digital', 'Halo Management', 'VELVET',
              'Apex Creators', 'Prime Social', 'EMBER', 'Luxe Digital', 'Crown Media',
            ].map((name, i) => (
              <div key={i} className="flex-shrink-0 px-5 py-2.5 rounded-lg bg-daisio-card border border-daisio-border text-sm font-medium text-white whitespace-nowrap">
                {name}
              </div>
            ))}
          </div>
          {/* Second Row - Reverse */}
          <div className="flex gap-4 animate-marquee-reverse">
            {[
              'MONARCH', 'Studio IX', 'Prism Agency', 'Aura Digital', 'ZENITH',
              'Opal Studios', 'LUXOR', 'Crimson Media', 'Stellar MGMT', 'AZURE',
              'Titan Creators', 'Pearl Agency', 'ONYX Elite', 'Sapphire Social', 'RUBY MGMT',
              'Diamond Digital', 'Emerald Studios', 'TOPAZ', 'Obsidian Media', 'Crystal Agency',
              'MONARCH', 'Studio IX', 'Prism Agency', 'Aura Digital', 'ZENITH',
              'Opal Studios', 'LUXOR', 'Crimson Media', 'Stellar MGMT', 'AZURE',
            ].map((name, i) => (
              <div key={i} className="flex-shrink-0 px-5 py-2.5 rounded-lg bg-daisio-card border border-daisio-border text-sm font-medium text-white whitespace-nowrap">
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Payment Infrastructure
              <br />
              <span className="gradient-text">Built for Scale</span>
            </h2>
            <p className="text-xl text-daisio-text-muted max-w-2xl mx-auto">
              Everything you need to manage creator payments at any scale
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '⚡',
                title: 'Instant Splits',
                desc: 'Revenue automatically splits the moment payment clears. No delays, no manual work.'
              },
              {
                icon: '🔒',
                title: 'Bank-Level Security',
                desc: 'SOC 2 compliant, 256-bit encryption, and PCI DSS certified for complete protection.'
              },
              {
                icon: '📊',
                title: 'Real-Time Dashboard',
                desc: 'Track all payments, splits, and creator earnings in one beautiful interface.'
              },
              {
                icon: '🌍',
                title: 'Global Payouts',
                desc: 'Pay creators anywhere in the world. 135+ countries, 50+ currencies supported.'
              },
              {
                icon: '📝',
                title: 'Automated Tax Docs',
                desc: 'W9s, 1099s, and international tax forms generated automatically.'
              },
              {
                icon: '🔌',
                title: 'Platform Integrations',
                desc: 'Direct integrations with OnlyFans, Fansly, and all major creator platforms.'
              },
            ].map((feature, i) => (
              <div key={i} className="card-glass rounded-2xl p-8 transition-all hover:scale-[1.02]">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center mb-6">
                  <span className="text-3xl">{feature.icon}</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                <p className="text-daisio-text-muted">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 bg-daisio-darker">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              How <span className="gradient-text">Split Pay</span> Works
            </h2>
            <p className="text-xl text-daisio-text-muted max-w-2xl mx-auto">
              Simple setup, automatic everything
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Connect', desc: 'Link your creator platform accounts to Daisio' },
              { step: '02', title: 'Configure', desc: 'Set split percentages for each creator' },
              { step: '03', title: 'Automate', desc: 'Revenue splits happen automatically' },
              { step: '04', title: 'Track', desc: 'Monitor everything in real-time' },
            ].map((item, i) => (
              <div key={i} className="text-center relative">
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 opacity-30" />
                )}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                  {item.step}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-daisio-text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Split Example */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Transparent Splits
            </h2>
            <p className="text-daisio-text-muted">
              Every transaction is tracked and split automatically
            </p>
          </div>
          
          <div className="card-glass rounded-2xl p-8 glow-blue">
            <div className="flex items-center justify-between mb-8 pb-8 border-b border-daisio-border">
              <div>
                <div className="text-sm text-daisio-text-muted mb-1">Transaction</div>
                <div className="text-2xl font-bold text-white">$1,500.00</div>
                <div className="text-sm text-daisio-text-muted">PPV Message Sale</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-daisio-text-muted mb-1">Status</div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-green-400 text-sm font-medium">Split Complete</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-daisio-dark">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold text-sm">C</div>
                  <div>
                    <div className="text-white font-medium">Creator</div>
                    <div className="text-sm text-daisio-text-muted">50% split</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-green-400">+$750.00</div>
                  <div className="text-xs text-daisio-text-muted">Instant deposit</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-xl bg-daisio-dark">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">A</div>
                  <div>
                    <div className="text-white font-medium">Agency</div>
                    <div className="text-sm text-daisio-text-muted">50% split</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-blue-400">+$750.00</div>
                  <div className="text-xs text-daisio-text-muted">Instant deposit</div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-daisio-border flex items-center justify-between text-sm">
              <span className="text-daisio-text-muted">Transaction ID: TXN-2026-02-05-8472</span>
              <span className="text-daisio-text-muted">Processed in 0.3s</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-daisio-darker">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Simple, <span className="gradient-text">Transparent</span> Pricing
            </h2>
            <p className="text-xl text-daisio-text-muted">
              No hidden fees. Pay only for what you use.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Starter */}
            <div className="card-glass rounded-2xl p-8">
              <div className="text-daisio-text-muted font-medium mb-2">Starter</div>
              <div className="text-4xl font-bold text-white mb-1">1.5%</div>
              <div className="text-sm text-daisio-text-muted mb-6">per transaction</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Up to $100K/month
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> 50 creators
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Email support
                </li>
              </ul>
              <button className="w-full py-3 rounded-xl border border-daisio-border text-white font-medium hover:border-blue-500 transition-colors">
                Get Started
              </button>
            </div>
            
            {/* Growth - Featured */}
            <div className="card-glass rounded-2xl p-8 border-blue-500/50 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full text-white text-xs font-medium">
                Most Popular
              </div>
              <div className="text-blue-400 font-medium mb-2">Growth</div>
              <div className="text-4xl font-bold text-white mb-1">1.0%</div>
              <div className="text-sm text-daisio-text-muted mb-6">per transaction</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Up to $500K/month
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> 200 creators
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Priority support
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> API access
                </li>
              </ul>
              <button className="w-full btn-primary py-3 rounded-xl text-white font-medium">
                Get Started
              </button>
            </div>
            
            {/* Enterprise */}
            <div className="card-glass rounded-2xl p-8">
              <div className="text-daisio-text-muted font-medium mb-2">Enterprise</div>
              <div className="text-4xl font-bold text-white mb-1">Custom</div>
              <div className="text-sm text-daisio-text-muted mb-6">volume pricing</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Unlimited volume
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Unlimited creators
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Dedicated support
                </li>
                <li className="flex items-center gap-2 text-daisio-text-muted">
                  <span className="text-green-400">✓</span> Custom integrations
                </li>
              </ul>
              <button className="w-full py-3 rounded-xl border border-daisio-border text-white font-medium hover:border-blue-500 transition-colors">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Automate Your
            <br />
            <span className="gradient-text">Creator Payments?</span>
          </h2>
          <p className="text-xl text-daisio-text-muted mb-10 max-w-2xl mx-auto">
            Join 50+ agencies using Daisio to manage creator payments at scale.
            Get started in minutes.
          </p>
          
          <div className="card-glass rounded-2xl p-8 max-w-md mx-auto">
            <form className="space-y-4">
              <input
                type="text"
                placeholder="Agency Name"
                className="w-full px-4 py-3 rounded-xl bg-daisio-dark border border-daisio-border text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <input
                type="email"
                placeholder="Work Email"
                className="w-full px-4 py-3 rounded-xl bg-daisio-dark border border-daisio-border text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <select className="w-full px-4 py-3 rounded-xl bg-daisio-dark border border-daisio-border text-white focus:border-blue-500 focus:outline-none transition-colors">
                <option value="">Monthly Volume</option>
                <option value="100k">Under $100K</option>
                <option value="500k">$100K - $500K</option>
                <option value="1m">$500K - $1M</option>
                <option value="1m+">$1M+</option>
              </select>
              <button type="submit" className="w-full btn-primary py-4 rounded-xl text-white font-bold text-lg">
                Request Demo →
              </button>
            </form>
            <p className="text-sm text-daisio-text-muted mt-4">
              We'll get back to you within 24 hours
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-daisio-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="text-xl font-bold text-white">Daisio</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-daisio-text-muted">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="text-sm text-daisio-text-muted">
            © 2024-2026 Daisio Inc. All Rights Reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
