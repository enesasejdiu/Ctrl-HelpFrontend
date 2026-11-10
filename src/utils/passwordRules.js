// passwordRules.js – the password rule the backend checks (10–72 characters, a letter and a number), as a live
// checklist for the password forms, plus "both match". Used by /set-password (with a temporary password or with an
// emailed link).
export function passwordChecklist(newPassword, confirm) {
  return [
    { label: 'At least 10 characters', met: newPassword.length >= 10 && newPassword.length <= 72 },
    { label: 'A letter', met: /[A-Za-z]/.test(newPassword) },
    { label: 'A number', met: /\d/.test(newPassword) },
    { label: 'Both new passwords match', met: newPassword.length > 0 && newPassword === confirm },
  ]
}
