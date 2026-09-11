import { Organization } from '../types';

// SÅLD-stämpeln är förvald på för verksamheter som säljer objekt, av för övriga.
// Ett uttryckligt val i inställningarna vinner alltid över branschgissningen.
export const isSoldStampEnabled = (organization?: Organization | null): boolean => {
    if (!organization) return false;
    if (typeof organization.enableSoldStamp === 'boolean') return organization.enableSoldStamp;
    const types = organization.businessType || [];
    return types.includes('Mäklare') || types.includes('Bilhandlare');
};
