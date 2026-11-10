// en.js – the English messages. Keys are grouped by screen; {name} is filled in by t(), and keys ending in _one /
// _other are the singular and plural forms of the same message (picked by the `count` parameter).
const en = {
  // Login: notices shown above the form
  'login.sessionExpired': 'Your session has expired. Please log in again.',
  'login.wrongCredentials': 'Incorrect email or password.',
  'login.unreachable': "Couldn't reach the server. Please try again.",
  'login.locked': 'Too many failed attempts. Your account is locked. Try again in {time}.',
  'login.lockedNoTime': 'Your account is temporarily locked. Try again later or contact your administrator or HR.',
  'login.lockedHelp': 'Need to get in sooner? An administrator or HR can reset your password.',
  'login.lockEnded': 'The lock has ended. You can try signing in again.',
  'login.rateLimited': 'Too many attempts. Please wait {time} and try again.',
  'login.rateLimitedNoTime': 'Too many attempts. Please wait a few minutes and try again.',
  'login.rateLimitEnded': 'You can try signing in again now.',
  'login.passwordSet': 'Password set, please log in.',

  // Login: form validation (the same rules the backend checks)
  'login.emailRequired': 'Email is required',
  'login.emailInvalid': 'Enter a valid email',
  'login.passwordRequired': 'Password is required',

  // Login: the link to "Forgot password"
  'login.forgotPassword': 'Forgot password?',

  // Forgot password (pages/ForgotPassword.jsx)
  'forgot.title': 'Forgot your password?',
  'forgot.subtitle': "Enter your work email. If it has an account, we'll send it a link to choose a new password.",
  'forgot.emailLabel': 'Work email',
  'forgot.submit': 'Send reset link',
  'forgot.sending': 'Sending…',
  'forgot.sentTitle': 'Check your email',
  'forgot.sent': "If there's an active account for that email, we've sent it a link to choose a new password.",
  'forgot.sentHelp': 'Your current password keeps working until you use the link. No email? Check the spam folder, or ask your administrator or HR.',
  'forgot.notAvailable': "Password reset by email isn't available. Ask your administrator or HR to reset your password.",
  'forgot.rateLimited': 'Too many requests. Wait a few minutes and try again.',
  'forgot.backToSignIn': 'Back to sign in',

  // Login: the submit button
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.tryAgainIn': 'Try again in {time}',

  // Error screens (errors/messages.js has the same texts as defaults, in case i18n is what broke)
  'error.title': 'Something went wrong',
  'error.text': 'An unexpected error occurred. You can try again, or go back to the home page.',
  'error.tryAgain': 'Try again',
  'error.home': 'Go to home page',
  'error.reload': 'Reload page',
  'error.reference': 'Error reference:',
  'error.details': 'Error details (development only)',
  'error.componentStack': 'Component stack',
  'error.reloading': 'Loading the latest version…',

  // "Page not found" (components/NotFound.jsx)
  'notFound.title': 'Page not found',
  'notFound.text': "The page you're looking for doesn't exist or may have been moved.",
  'notFound.path': "We couldn't find {path}",
  'notFound.home': 'Go to home page',
  'notFound.back': 'Go back',
  'notFound.documentTitle': 'Page not found – {app}',
  'notFound.logoLabel': 'TicketFlow – sign in',
  'notFound.ticket': "This ticket doesn't exist or has been removed.",

  // The app's name, e.g. in tab titles
  'app.name': 'TicketFlow',

  // Durations
  'time.aboutMinutes_one': 'about 1 minute',
  'time.aboutMinutes_other': 'about {count} minutes',
}

export default en
