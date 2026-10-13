export const STATUS_BADGE = {
  AWAITING_OTP: { tone: 'warning', label: 'Waiting for parent' },
  APPROVED: { tone: 'info', label: 'Approved' },
  EXITED: { tone: 'success', label: 'Left school' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
} as const
