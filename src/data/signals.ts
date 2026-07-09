/**
 * Signal chips shown in the "Everything that decides if your domain is trusted"
 * strip. These are protocol / check names — identical across languages.
 */
export const signals = [
  'SPF',
  'DKIM',
  'DMARC',
  'BIMI',
  'MTA-STS',
  'TLS-RPT',
  'DNSBL/RBL',
  'rDNS/PTR',
] as const;
