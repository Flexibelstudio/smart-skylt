import React, { useState } from "react";
import { runOrgCollectionsMigration } from '../services/firebaseService';
import { Card } from './Card';
import { PrimaryButton } from './Buttons';
import { StyledInput } from './Forms';
import { useToast } from '../context/ToastContext';

export default function SystemOwnerMigrationControls() {
  const [orgId, setOrgId] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [migrateChannels, setMigrateChannels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  async function runMigration(payload: any) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!payload.dryRun) {
        const msg = payload.orgId
          ? `Köra SKARPT för org "${payload.orgId}"${payload.migrateChannels ? " (inkl. kanaler)" : ""}?`
          : `Köra SKARPT för ALLA orgar${payload.migrateChannels ? " (inkl. kanaler)" : ""}?`;
        if (!window.confirm(msg)) {
          setBusy(false);
          return;
        }
      }

      const res: any = await runOrgCollectionsMigration(payload);
      setResult(res);
      showToast({ message: res.message || 'Klar!', type: 'success' });
    } catch (e: any) {
      // Firebase callable functions wrap errors, so we look for details.message
      const errorMessage = e?.details?.message || e?.message || String(e);
      setError(errorMessage);
      console.error(e);
      showToast({ message: `Fel: ${errorMessage}`, type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const handleRun = () => {
    const payload: any = { dryRun, migrateChannels };
    if (orgId.trim()) payload.orgId = orgId.trim();
    void runMigration(payload);
  };

  return (
    <Card title="Systemunderhåll: Migrering">
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Detta verktyg flyttar skärmar (`displayScreens`) från att vara ett fält på organisationsdokumentet till en egen subcollection. Detta är nödvändigt för att AI-automationen ska fungera korrekt. Kör <b>Dry-run</b> först.
        </p>
        
        <label className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={busy}
            className="h-5 w-5 rounded text-primary focus:ring-primary"
          />
          Dry-run (simulera utan att skriva till databasen)
        </label>

        <label className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={migrateChannels}
            onChange={(e) => setMigrateChannels(e.target.checked)}
            disabled={busy}
            className="h-5 w-5 rounded text-primary focus:ring-primary"
          />
          Inkludera `channels` (gammal datastruktur, troligen inte nödvändigt)
        </label>

        <div className="flex gap-2 items-center">
          <StyledInput
            placeholder="(Valfritt) Kör endast för en organisation (ange ID)"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            disabled={busy}
          />
          <PrimaryButton
            onClick={handleRun}
            disabled={busy}
            loading={busy}
            className={dryRun ? '' : 'bg-orange-500 hover:bg-orange-600'}
          >
            {dryRun ? "Kör dry-run" : "KÖR SKARPT"}
          </PrimaryButton>
        </div>

        {error && (
          <pre className="mt-4 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 p-4 rounded-lg overflow-x-auto text-sm">
            {error}
          </pre>
        )}

        {result && (
          <pre className="mt-4 bg-slate-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </Card>
  );
}