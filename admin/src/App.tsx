import { useEffect, useState } from 'react';
import LoginScreen from './components/LoginScreen';
import OwnerDashboard from './components/OwnerDashboard';
import Dashboard from './components/Dashboard';
import AddBottle from './components/AddBottle';
import Settings from './components/Settings';
import PricingSettings from './components/PricingSettings';
import InventoryPage from './components/InventoryPage';
import BulkUpload from './components/BulkUpload';
import {
  getActiveBarId,
  getPersistedToken,
  logout as sessionLogout,
  restore,
  setActiveBarId as persistActiveBarId,
} from './lib/session';
import type { BarSummary, Session, Whiskey } from './types';

type View =
  | 'dashboard'
  | 'add'
  | 'edit'
  | 'settings'
  | 'pricing'
  | 'inventory'
  | 'bulk-upload';

function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  // Owner drill-in target; for a bar account this is always its own barId.
  const [activeBarId, setActiveBarIdState] = useState<string | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [editingWhiskey, setEditingWhiskey] = useState<Whiskey | null>(null);

  // Restore session on load via the `session` function before any tenant read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getPersistedToken()) {
        if (!cancelled) setBooting(false);
        return;
      }
      const restored = await restore();
      if (cancelled) return;
      if (restored) {
        applySession(restored);
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = (s: Session) => {
    setSession(s);
    if (s.role === 'owner') {
      setActiveBarIdState(null);
      persistActiveBarId(null);
    } else {
      setActiveBarIdState(s.barId);
      persistActiveBarId(s.barId);
      setView('dashboard');
    }
  };

  const handleLoginSuccess = (s: Session) => {
    setBooting(false);
    applySession(s);
  };

  const handleLogout = async () => {
    await sessionLogout();
    setSession(null);
    setActiveBarIdState(null);
    setView('dashboard');
    setEditingWhiskey(null);
  };

  const handleSelectBar = (bar: BarSummary) => {
    setActiveBarIdState(bar.bar_id);
    persistActiveBarId(bar.bar_id);
    setView('dashboard');
  };

  const handleBackToBars = () => {
    setActiveBarIdState(null);
    persistActiveBarId(null);
    setView('dashboard');
    setEditingWhiskey(null);
  };

  // Exit affordance from a bar's Dashboard: owners return to the bar list,
  // bar accounts log out.
  const handleDashboardExit =
    session?.role === 'owner' ? handleBackToBars : handleLogout;

  const barId = (activeBarId ?? getActiveBarId()) ?? undefined;

  if (booting) {
    return <div style={styles.booting}>불러오는 중...</div>;
  }

  if (!session) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  if (session.role === 'owner' && activeBarId === null) {
    return (
      <OwnerDashboard
        barName={session.barName}
        onSelectBar={handleSelectBar}
        onLogout={handleLogout}
      />
    );
  }

  switch (view) {
    case 'dashboard':
      return (
        <Dashboard
          activeBarId={barId}
          onAdd={() => { setEditingWhiskey(null); setView('add'); }}
          onEdit={(w) => { setEditingWhiskey(w); setView('edit'); }}
          onSettings={() => setView('settings')}
          onPricing={() => setView('pricing')}
          onInventory={() => setView('inventory')}
          onBulkUpload={() => setView('bulk-upload')}
          onLogout={handleDashboardExit}
        />
      );

    case 'add':
      return (
        <AddBottle
          activeBarId={barId}
          onDone={() => setView('dashboard')}
          onCancel={() => setView('dashboard')}
        />
      );

    case 'edit':
      return (
        <AddBottle
          activeBarId={barId}
          editing={editingWhiskey}
          onDone={() => setView('dashboard')}
          onCancel={() => setView('dashboard')}
        />
      );

    case 'settings':
      return (
        <Settings
          activeBarId={barId}
          onBack={() => setView('dashboard')}
        />
      );

    case 'pricing':
      return (
        <PricingSettings
          activeBarId={barId}
          onBack={() => setView('dashboard')}
        />
      );

    case 'inventory':
      return (
        <InventoryPage
          activeBarId={barId}
          onBack={() => setView('dashboard')}
        />
      );

    case 'bulk-upload':
      return (
        <BulkUpload
          activeBarId={barId}
          onDone={() => setView('dashboard')}
          onCancel={() => setView('dashboard')}
        />
      );
  }
}

const styles: Record<string, React.CSSProperties> = {
  booting: {
    position: 'fixed',
    inset: 0,
    background: '#17130f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#837763',
    fontSize: 16,
    fontFamily: '"Nanum Myeongjo", serif',
  },
};

export default App;
