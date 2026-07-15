import { useEffect, useState } from 'react';
import { useDeviceAuth } from '@/hooks/useDeviceAuth';
import { RoleSelectScreen } from '@/components/auth/RoleSelectScreen';
import { AccessDeniedScreen } from '@/components/auth/AccessDeniedScreen';
import { DispatcherDashboard } from '@/components/dispatcher/DispatcherDashboard';
import { DriverApp } from '@/components/driver/DriverApp';
import { SalespersonApp } from '@/components/salesperson/SalespersonApp';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { loading, role, device, chooseRole, refresh } = useDeviceAuth();
  const [driverName, setDriverName] = useState<string>('');
  const [driverLookupDone, setDriverLookupDone] = useState(false);

  // For driver mode: resolve driver name from drivers table via authorized_devices.driver_id
  useEffect(() => {
    let cancel = false;
    if (role === 'driver' && device?.driver_id) {
      supabase.from('drivers').select('name').eq('id', device.driver_id).maybeSingle().then(({ data }) => {
        if (!cancel) { setDriverName((data as any)?.name || ''); setDriverLookupDone(true); }
      });
    } else {
      setDriverLookupDone(true);
    }
    return () => { cancel = true; };
  }, [role, device?.driver_id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) {
    return <RoleSelectScreen onChoose={chooseRole} />;
  }

  // device must exist after role chosen; if killed → access denied
  if (device && !device.is_active) {
    return <AccessDeniedScreen />;
  }

  if (role === 'driver') {
    if (!driverLookupDone) {
      return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    }
    if (!device?.driver_id) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-sm text-center space-y-3">
            <h1 className="text-lg font-bold">Awaiting assignment</h1>
            <p className="text-xs text-muted-foreground">
              This device is in Driver Mode but no driver is linked yet.
              Ask a dispatcher to assign you from the <strong>Devices</strong> tab.
            </p>
            <button onClick={() => { localStorage.removeItem('dispatchbuddy.deviceRole'); refresh(); }} className="text-[11px] underline text-primary">
              Switch role
            </button>
          </div>
        </div>
      );
    }
    return <DriverApp driverId={device.driver_id} driverName={driverName || 'Driver'} onRoleReset={refresh} />;
  }

  if (role === 'salesperson') {
    return <SalespersonApp onRoleReset={refresh} />;
  }

  // dispatcher
  return <DispatcherDashboard />;
};

export default Index;
