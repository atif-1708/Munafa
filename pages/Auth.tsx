
import React, { useState, useEffect } from 'react';
import { 
    Loader2, CheckCircle2, ArrowRight, BarChart3, Lock, Zap, 
    TrendingUp, ShieldCheck, LayoutDashboard, Store, Truck, 
    MousePointer2, X, ChevronRight, PlayCircle 
} from 'lucide-react';

interface AuthProps {
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  handleLogin: (e: React.FormEvent) => void;
  handleSignup: (e: React.FormEvent) => void;
  handleDemoMode: () => void;
  authMessage: { type: 'error' | 'success'; text: string } | null;
  loading: boolean;
}

const Auth: React.FC<AuthProps> = (props) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Scroll effect for Navbar
  useEffect(() => {
      const handleScroll = () => setScrolled(window.scrollY > 20);
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openLogin = () => {
      props.setAuthMode('login');
      setIsModalOpen(true);
  };

  const openSignup = () => {
      props.setAuthMode('signup');
      setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-brand-100 selection:text-brand-900">
      
      {/* --- NAVBAR --- */}
      <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-md border-b border-slate-200 py-3' : 'bg-transparent py-6'}`}>
          <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-lg shadow-brand-500/30">
                      <LayoutDashboard className="text-white" size={18} />
                  </div>
                  <span className={`font-bold text-lg tracking-tight ${scrolled ? 'text-slate-900' : 'text-slate-900'}`}>
                      MunafaBakhsh <span className="text-brand-600">Karobaar</span>
                  </span>
              </div>
              <div className="flex items-center gap-4">
                  <button onClick={openLogin} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Log In</button>
                  <button onClick={openSignup} className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20">
                      Get Started
                  </button>
              </div>
          </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <header className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
          {/* Background Gradients */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-brand-100/50 rounded-full blur-3xl opacity-50 -z-10"></div>
          <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl opacity-50 -z-10"></div>

          <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
              <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-1.5 shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <span className="flex h-2 w-2 rounded-full bg-brand-500"></span>
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">New: TCS & PostEx Integration Live</span>
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 tracking-tight mb-6 leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                  Profit Intelligence for <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-emerald-500">Pakistan eCommerce</span>
              </h1>
              
              <p className="text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                  Stop manually calculating profit on spreadsheets. Automatically sync Shopify orders, Courier COD, and Ad Spend to see your <strong>Real Net Profit</strong> in seconds.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                  <button onClick={openSignup} className="w-full sm:w-auto bg-brand-600 text-white px-8 py-4 rounded-xl text-base font-bold hover:bg-brand-700 transition-all shadow-xl shadow-brand-600/30 flex items-center justify-center gap-2 group">
                      Start Free Trial <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>
                  </button>
                  <button onClick={props.handleDemoMode} className="w-full sm:w-auto bg-white text-slate-700 border border-slate-200 px-8 py-4 rounded-xl text-base font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                      <PlayCircle size={18} className="text-slate-400" /> View Live Demo
                  </button>
              </div>

              {/* --- 3D DASHBOARD PREVIEW (CSS ONLY) --- */}
              <div className="relative mx-auto max-w-5xl perspective-1000 animate-in fade-in zoom-in-95 duration-1000 delay-500">
                  {/* The Screen Container */}
                  <div className="relative bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 p-2 transform rotate-x-12 hover:rotate-x-0 transition-transform duration-700 ease-out origin-center">
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent rounded-2xl pointer-events-none"></div>
                      
                      {/* Window Header */}
                      <div className="h-8 bg-slate-800 rounded-t-xl flex items-center px-4 gap-2 border-b border-slate-700">
                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      </div>

                      {/* Window Body */}
                      <div className="bg-slate-50 rounded-b-xl overflow-hidden flex h-[400px] lg:h-[500px]">
                          {/* Sidebar Mock */}
                          <div className="w-48 bg-slate-900 hidden md:flex flex-col p-4 gap-4 border-r border-slate-800">
                              <div className="h-8 w-24 bg-white/10 rounded mb-4"></div>
                              {[1,2,3,4,5].map(i => <div key={i} className="h-6 w-full bg-white/5 rounded"></div>)}
                          </div>
                          
                          {/* Content Mock */}
                          <div className="flex-1 p-6 bg-slate-50 flex flex-col gap-6">
                              {/* Header */}
                              <div className="flex justify-between">
                                  <div className="h-8 w-32 bg-slate-200 rounded"></div>
                                  <div className="h-8 w-24 bg-slate-200 rounded"></div>
                              </div>
                              
                              {/* KPI Grid */}
                              <div className="grid grid-cols-4 gap-4">
                                  {[
                                      { l: 'Revenue', v: 'Rs 1.2M', c: 'bg-blue-100' }, 
                                      { l: 'Net Profit', v: 'Rs 240k', c: 'bg-emerald-100' }, 
                                      { l: 'Orders', v: '450', c: 'bg-slate-100' }, 
                                      { l: 'RTO Rate', v: '12%', c: 'bg-red-100' }
                                  ].map((k, i) => (
                                      <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                          <div className={`w-8 h-8 rounded-lg ${k.c}`}></div>
                                          <div className="h-4 w-16 bg-slate-100 rounded"></div>
                                          <div className="h-6 w-24 bg-slate-800 rounded opacity-80"></div>
                                      </div>
                                  ))}
                              </div>

                              {/* Chart Area */}
                              <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
                                  <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-brand-50 to-transparent"></div>
                                  <div className="flex items-end justify-between h-full px-4 pb-4 gap-2">
                                      {[40, 60, 45, 70, 80, 60, 90, 75, 50, 60, 80, 95].map((h, i) => (
                                          <div key={i} className="w-full bg-brand-500 rounded-t-sm opacity-80" style={{ height: `${h}%` }}></div>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  {/* Decorative Glow */}
                  <div className="absolute -inset-4 bg-brand-500/20 blur-3xl -z-10 rounded-[3rem]"></div>
              </div>
          </div>
      </header>

      {/* --- INTEGRATIONS BAR --- */}
      <section className="bg-white py-10 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-6 text-center">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Trusted by Sellers using</p>
              <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                  <span className="text-xl font-bold text-slate-800">Shopify</span>
                  <span className="text-xl font-bold text-red-600">TCS</span>
                  <span className="text-xl font-bold text-yellow-600">PostEx</span>
                  <span className="text-xl font-bold text-blue-600">Meta Ads</span>
                  <span className="text-xl font-bold text-slate-900">TikTok</span>
              </div>
          </div>
      </section>

      {/* --- FEATURES GRID --- */}
      <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-6">
              <div className="text-center max-w-3xl mx-auto mb-16">
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">Everything you need to know your numbers</h2>
                  <p className="text-slate-600">We connect the dots between your store, your courier, and your marketing to give you the one number that matters: <strong>Net Profit</strong>.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <FeatureCard 
                      icon={Truck} 
                      title="Courier Reconciliation" 
                      desc="Automatically track delivery statuses from TCS, PostEx, Trax and match them with payments." 
                  />
                  <FeatureCard 
                      icon={ShieldCheck} 
                      title="RTO Tracking" 
                      desc="Identify high-RTO products and cities instantly. See exactly how much return shipping is costing you." 
                  />
                  <FeatureCard 
                      icon={BarChart3} 
                      title="Ad Spend Attribution" 
                      desc="Sync Facebook & TikTok ad spend daily. Calculate precise CPA and ROI per product." 
                  />
                  <FeatureCard 
                      icon={LayoutDashboard} 
                      title="Real-time Dashboard" 
                      desc="No more spreadsheets. Get a live P&L statement that updates as orders are delivered." 
                  />
                  <FeatureCard 
                      icon={Store} 
                      title="Shopify Sync" 
                      desc="Seamless integration with your Shopify store to pull product costs and order details." 
                  />
                  <FeatureCard 
                      icon={TrendingUp} 
                      title="Profit Scaling" 
                      desc="Know exactly which products are profitable so you can scale your ads with confidence." 
                  />
              </div>
          </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                  <span className="text-white font-bold text-lg">MunafaBakhsh Karobaar</span>
                  <p className="text-xs mt-1">Built for Pakistan 🇵🇰</p>
              </div>
              <div className="flex gap-6 text-sm">
                  <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                  <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                  <a href="#" className="hover:text-white transition-colors">Contact Support</a>
              </div>
          </div>
      </footer>

      {/* --- LOGIN / SIGNUP MODAL --- */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-lg text-slate-900">
                          {props.authMode === 'login' ? 'Welcome Back' : 'Create Account'}
                      </h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-6">
                      <form className="space-y-4" onSubmit={props.authMode === 'login' ? props.handleLogin : props.handleSignup}>
                          <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                              <input 
                                  type="email" 
                                  required 
                                  autoFocus
                                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                  value={props.email}
                                  onChange={e => props.setEmail(e.target.value)}
                                  placeholder="you@store.com"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                              <input 
                                  type="password" 
                                  required 
                                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                  value={props.password}
                                  onChange={e => props.setPassword(e.target.value)}
                                  placeholder="••••••••"
                              />
                          </div>

                          {props.authMessage && (
                              <div className={`text-sm p-3 rounded-lg flex items-start gap-2 ${props.authMessage.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                                  {props.authMessage.type === 'error' ? <Lock size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
                                  {props.authMessage.text}
                              </div>
                          )}

                          <button 
                              type="submit" 
                              disabled={props.loading}
                              className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                          >
                              {props.loading && <Loader2 size={18} className="animate-spin" />}
                              {props.authMode === 'login' ? 'Log In' : 'Sign Up Free'}
                          </button>
                      </form>

                      <div className="mt-6 text-center text-xs text-slate-500">
                          {props.authMode === 'login' ? (
                              <>
                                  Don't have an account? <button onClick={() => props.setAuthMode('signup')} className="text-brand-600 font-bold hover:underline">Sign up</button>
                              </>
                          ) : (
                              <>
                                  Already have an account? <button onClick={() => props.setAuthMode('login')} className="text-brand-600 font-bold hover:underline">Log in</button>
                              </>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
        <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600 mb-4">
            <Icon size={24} />
        </div>
        <h3 className="font-bold text-lg text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
);

export default Auth;
