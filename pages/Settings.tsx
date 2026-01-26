import React, { useState, useEffect } from 'react';
import { COURIER_RATES, PACKAGING_COST_AVG } from '../constants';
import { CourierName } from '../types';
import { Save, AlertCircle, Database } from 'lucide-react';
import { supabase } from '../services/supabase';

const Settings: React.FC = () => {
  const [packagingCost, setPackagingCost] = useState(PACKAGING_COST_AVG);
  const [rates, setRates] = useState(COURIER_RATES);
  const [savedMsg, setSavedMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load from Supabase
  useEffect(() => {
    const loadSettings = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('app_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (data) {
            setPackagingCost(data.packaging_cost);
            setRates(data.courier_rates);
        }
    };
    loadSettings();
  }, []);

  const handleRateChange = (courier: CourierName, type: 'forward' | 'rto', value: string) => {
    setRates(prev => ({
        ...prev,
        [courier]: {
            ...prev[courier],
            [type]: parseInt(value) || 0
        }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { error } = await supabase
            .from('app_settings')
            .upsert({
                user_id: user.id,
                packaging_cost: packagingCost,
                courier_rates: rates
            });
        
        if (!error) {
            setSavedMsg('Settings saved to database!');
            setTimeout(() => setSavedMsg(''), 3000);
        } else {
            setSavedMsg('Error saving settings');
        }
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Store Configuration</h2>
          <p className="text-slate-500 text-sm">Manage your operational costs and courier contracts</p>
        </div>
        <div className="flex items-center gap-4">
            {savedMsg && <span className="text-sm text-green-600 font-medium animate-pulse">{savedMsg}</span>}
            <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-50"
            >
                <Save size={18} />
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
      </div>

      <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-start gap-3">
        <Database className="text-green-600 shrink-0 mt-1" size={18} />
        <div>
            <h4 className="font-bold text-green-900 text-sm">Cloud Sync Active</h4>
            <p className="text-xs text-green-700 mt-1">
                Your cost configurations are securely synced to Supabase.
            </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Operational Costs</h3>
        <div className="max-w-md">
            <label className="block text-sm font-medium text-slate-700 mb-1">Average Packaging Cost (PKR)</label>
            <div className="flex items-center gap-2">
                <input 
                    type="number" 
                    value={packagingCost}
                    onChange={(e) => setPackagingCost(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" 
                />
                <span className="text-xs text-slate-500">Per Order</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Includes flyers, bubble wrap, and tape. Applied to every order.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-6">
            <h3 className="text-lg font-bold text-slate-800">Courier Rate Cards</h3>
            <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">PKR</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {(Object.entries(rates) as [string, { forward: number; rto: number }][]).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-700 w-32">{key}</span>
                    <div className="flex gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Forward Fee</label>
                            <input 
                                type="number" 
                                className="w-24 px-2 py-1 border rounded text-sm"
                                value={value.forward}
                                onChange={(e) => handleRateChange(key as CourierName, 'forward', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">RTO Penalty</label>
                            <input 
                                type="number" 
                                className="w-24 px-2 py-1 border rounded text-sm text-red-600 bg-red-50 border-red-100"
                                value={value.rto}
                                onChange={(e) => handleRateChange(key as CourierName, 'rto', e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Settings;