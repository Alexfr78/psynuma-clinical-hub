import { ReferralsSettingsSection } from '@/components/settings/ReferralsSettingsSection';

export default function Referrals() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Derivaciones</h1>
        <p className="text-muted-foreground text-sm">
          Gestiona el catálogo de profesionales para derivaciones
        </p>
      </div>
      <ReferralsSettingsSection />
    </div>
  );
}
