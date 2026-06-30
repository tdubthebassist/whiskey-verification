import { useState } from 'react';
import PinGate from './components/PinGate';
import Dashboard from './components/Dashboard';
import AddBottle from './components/AddBottle';
import Settings from './components/Settings';
import PricingSettings from './components/PricingSettings';
import type { Whiskey } from './types';

type View = 'pin' | 'dashboard' | 'add' | 'edit' | 'settings' | 'pricing';

function App() {
  const [view, setView] = useState<View>('pin');
  const [pin, setPin] = useState('');
  const [editingWhiskey, setEditingWhiskey] = useState<Whiskey | null>(null);

  const handlePinSuccess = (validPin: string) => {
    setPin(validPin);
    setView('dashboard');
  };

  const handleLogout = () => {
    setPin('');
    setView('pin');
  };

  switch (view) {
    case 'pin':
      return <PinGate onSuccess={handlePinSuccess} />;

    case 'dashboard':
      return (
        <Dashboard
          pin={pin}
          onAdd={() => { setEditingWhiskey(null); setView('add'); }}
          onEdit={(w) => { setEditingWhiskey(w); setView('edit'); }}
          onSettings={() => setView('settings')}
          onPricing={() => setView('pricing')}
          onLogout={handleLogout}
        />
      );

    case 'add':
      return (
        <AddBottle
          pin={pin}
          onDone={() => setView('dashboard')}
          onCancel={() => setView('dashboard')}
        />
      );

    case 'edit':
      return (
        <AddBottle
          pin={pin}
          editing={editingWhiskey}
          onDone={() => setView('dashboard')}
          onCancel={() => setView('dashboard')}
        />
      );

    case 'settings':
      return (
        <Settings
          pin={pin}
          onBack={() => setView('dashboard')}
        />
      );

    case 'pricing':
      return (
        <PricingSettings
          pin={pin}
          onBack={() => setView('dashboard')}
        />
      );
  }
}

export default App;
