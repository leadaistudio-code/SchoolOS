/** A head with no window is always billable; otherwise `on` must sit inside it. */
export function feeHeadActiveOn(head: { startsOn?: Date | null; endsOn?: Date | null }, on: Date) {
  return (!head.startsOn || on >= head.startsOn) && (!head.endsOn || on <= head.endsOn)
}
