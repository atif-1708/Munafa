
import React from 'react';
import { Loader2, CheckCircle2, ArrowRight, BarChart3, Lock, Zap, TrendingUp, ShieldCheck, LayoutDashboard, Store } from 'lucide-react';

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

const Auth: React.FC<AuthProps> = ({
  authMode, setAuthMode, email, setEmail, password, setPassword,
  handleLogin, handleSignup, handleDemoMode, authMessage, loading
}) => {
  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row font-sans">
      
      {/* LEFT PANEL: Brand & Value Prop */}
      <div className="lg:w-1/2 bg-slate-900 text-white flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        {/* Abstract Background Pattern */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

        {/* Logo Area */}
        <div className="relative z-10 flex items-center gap-3">
             <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-900/50">
                <LayoutDashboard className="text-white" size={20} />
             </div>
             <div>
                <h1 className="text-xl font-bold tracking-tight leading-none">MunafaBakhsh <span className="text-brand-400">Karobaar</span></h1>
                <p className="text-xs text-slate-400 tracking-wide uppercase mt-0.5">Profit Intelligence Platform</p>
             </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 my-12 lg:my-0 max-w-md mx-auto lg:mx-0">
             <h2 className="text-3xl lg:text-5xl font-extrabold tracking-tight leading-tight mb-6">
                 Stop Guessing. <br/>
                 <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-emerald-300">Start Scaling.</span>
             </h2>
             <p className="text-lg text-slate-300 mb-8 leading-relaxed">
                 The first automated profit analysis tool for Pakistani eCommerce sellers. Sync Shopify, Courier COD, and Ad Spend in one dashboard.
             </p>
             
             <div className="space-y-4">
                 <FeatureItem icon={TrendingUp} text="Automated Net Profit Calculation (Cash Basis)" />
                 <FeatureItem icon={ShieldCheck} text="RTO & Courier Loss Reconciliation" />
                 <FeatureItem icon={BarChart3} text="Real-time Marketing Attribution (CPR)" />
             </div>
        </div>

        {/* Footer / Trust Signals */}
        <div className="relative z-10">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Integrated With</p>
            <div className="flex flex-wrap gap-4 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                {/* Simple text representations for logos to avoid external image dependencies */}
                <span className="text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">Shopify</span>
                <span className="text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">TCS</span>
                <span className="text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">PostEx</span>
                <span className="text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">Meta Ads</span>
                <span className="text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">TikTok</span>
            </div>
        </div>
      </div>

      {/* RIGHT PANEL: Login Form */}
      <div className="lg:w-1/2 flex flex-col justify-center items-center p-6 bg-slate-50 lg:bg-white">
          <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 lg:border-none lg:shadow-none lg:p-0">
              
              <div className="text-center lg:text-left">
                  <h3 className="text-2xl font-bold text-slate-900">
                      {authMode === 'login' ? 'Welcome back' : 'Create an account'}
                  </h3>
                  <p className="text-slate-500 text-sm mt-2">
                      {authMode === 'login' 
                        ? 'Enter your credentials to access your dashboard.' 
                        : 'Start your 14-day free trial. No credit card required.'}
                  </p>
              </div>

              {/* Tabs */}
              <div className="flex p-1 bg-slate-100 rounded-lg">
                  <button 
                    onClick={() => setAuthMode('login')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      Log In
                  </button>
                  <button 
                    onClick={() => setAuthMode('signup')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${authMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      Sign Up
                  </button>
              </div>

              <form className="space-y-5" onSubmit={authMode === 'login' ? handleLogin : handleSignup}>
                  <div className="space-y-1">
                      <label className="text-sm font-bold text-slate-700 block">Email Address</label>
                      <input 
                        type="email" 
                        required 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all"
                        placeholder="you@store.com"
                      />
                  </div>

                  <div className="space-y-1">
                      <label className="text-sm font-bold text-slate-700 block">Password</label>
                      <input 
                        type="password" 
                        required 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all"
                        placeholder="••••••••"
                      />
                  </div>

                  {authMessage && (
                      <div className={`text-sm p-3 rounded-lg flex items-start gap-2 ${authMessage.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                          {authMessage.type === 'error' ? <Lock size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
                          {authMessage.text}
                      </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                      {loading && <Loader2 size={18} className="animate-spin" />}
                      {authMode === 'login' ? 'Sign In to Dashboard' : 'Get Started Free'}
                      {!loading && <ArrowRight size={18} />}
                  </button>
              </form>
              
              <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center text-xs"><span className="px-4 bg-white text-slate-400">or explore without account</span></div>
              </div>

              <button 
                onClick={handleDemoMode} 
                className="w-full bg-white text-slate-600 border border-slate-200 py-3 rounded-xl font-bold text-sm hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center justify-center gap-2"
              >
                  <Zap size={18} className="text-brand-500 fill-brand-100" /> View Live Demo Store
              </button>

              <p className="text-center text-xs text-slate-400 mt-6">
                  By continuing, you agree to our Terms of Service and Privacy Policy.
                  <br/>© 2024 MunafaBakhsh Karobaar.
              </p>
          </div>
      </div>
    </div>
  );
};

const FeatureItem = ({ icon: Icon, text }: { icon: any, text: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-sm">
        <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400">
            <Icon size={20} />
        </div>
        <span className="font-medium text-sm">{text}</span>
    </div>
);

export default Auth;
