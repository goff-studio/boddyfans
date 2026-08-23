/**
 * Bank details for the manual booking flow. Verified against the IBAN mod-97
 * checksum and the Italian 27-character layout before being entered here —
 * re-run that check if either account is ever edited.
 *
 * The 1-on-1 track is paid to the Revolut account; everything else goes to the
 * main practice account.
 */
export type Account = {
  label: string
  holder?: string
  iban: string
  bic: string
  /** Extra rows shown under the IBAN, in display order. */
  extra?: { label: string; value: string }[]
  bank?: string
  note?: string
}

const PRACTICE: Account = {
  label: 'Bank transfer',
  iban: 'IT69H0538702401000003783853',
  bic: 'BPMOIT22XXX',
  extra: [
    { label: 'ABI', value: '05387' },
    { label: 'CAB', value: '02401' },
    { label: 'Account', value: '000003783853' },
  ],
}

const REVOLUT: Account = {
  label: 'Revolut',
  holder: 'ANNA NEFEDOVA',
  iban: 'IT14M0366901600067012549680',
  bic: 'REVOITM2',
  bank: 'Revolut Bank UAB · Via Dante 7, 20123 Milano (MI), Italy',
  extra: [
    { label: 'Revolut', value: '@anefedovafisio' },
    { label: 'Correspondent BIC', value: 'CHASDEFX' },
  ],
  note: 'Sending from Revolut? Paying the @anefedovafisio tag is instant and free.',
}

/** The 1-on-1 chat is billed through Revolut; the rest through the practice account. */
export function accountFor(slug: string): Account {
  return slug === 'connect' ? REVOLUT : PRACTICE
}

/** IBANs are read aloud and typed by hand, so display them in groups of four. */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * What the payer should put in the transfer description. Manual reconciliation
 * lives or dies on this — without it Anna is matching amounts to names by eye.
 */
export function paymentReference(word: string, name: string): string {
  const who = name.trim().replace(/\s+/g, ' ').toUpperCase() || 'YOUR NAME'
  return `${word} · ${who}`
}
