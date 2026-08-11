/**
 * Signal chips shown in the "Everything that decides if your domain is trusted"
 * strip. These are protocol / check names — identical across languages.
 *
 * MX and NS are watched for changes only: they never feed the protection score,
 * which the strip's sub-heading says out loud so the chips can't imply it.
 */
export const signals = [
  'SPF',
  'DKIM',
  'DMARC',
  'BIMI',
  'MTA-STS',
  'TLS-RPT',
  'MX',
  'NS',
  'DNSBL/RBL',
  'rDNS/PTR',
] as const;
