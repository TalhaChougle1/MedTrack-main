/**
 * Professional Email Validation System for MedTrack
 * Includes RFC syntax validation, TLD check, disposable domain blocking, fake domain prevention, and domain typo detection.
 */

// Known disposable / temporary email service domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "dispostable.com",
  "trashmail.com",
  "yopmail.com",
  "sharklasers.com",
  "getnada.com",
  "fakeinbox.com",
  "throwawaymail.com",
  "temp-mail.org",
  "maildrop.cc",
  "crazymailing.com",
  "getairmail.com",
  "mytemp.email",
  "mohmal.com",
  "dropmail.me",
  "emailondeck.com",
  "inboxalias.com",
  "disposablemail.com",
]);

// Generic test / fake non-functional domains
const FAKE_NON_FUNCTIONAL_DOMAINS = new Set([
  "test.com",
  "example.com",
  "foo.com",
  "asdf.com",
  "fake.com",
  "invalid.domain",
  "sample.com",
  "demo.com",
  "testing.com",
  "abc.com",
  "xyz.com",
  "temp.com",
  "dummy.com",
]);

// Common domain typos mapping -> suggestion
const DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmai.co": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "icoud.com": "icloud.com",
  "protonmaill.com": "protonmail.com",
  "protonmial.com": "protonmail.com",
};

export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
  domain?: string;
}

/**
 * Validates an email address against professional standards.
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || typeof email !== "string") {
    return { isValid: false, error: "Email address is required." };
  }

  const cleaned = email.trim().toLowerCase();

  if (cleaned.length > 254) {
    return { isValid: false, error: "Email address exceeds maximum length of 254 characters." };
  }

  // Strict RFC 5322 pattern regex check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(cleaned)) {
    return {
      isValid: false,
      error: "Please enter a valid email format (e.g. name@pharmacy.com).",
    };
  }

  // Split into username and domain
  const parts = cleaned.split("@");
  if (parts.length !== 2) {
    return { isValid: false, error: "Email must contain exactly one '@' symbol." };
  }

  const [username, domain] = parts;

  if (!username || username.length < 1) {
    return { isValid: false, error: "Email username section cannot be empty." };
  }

  if (!domain || !domain.includes(".")) {
    return { isValid: false, error: "Email domain must contain a valid domain suffix (e.g. .com)." };
  }

  // Check top-level domain (TLD) length and letters
  const domainParts = domain.split(".");
  const tld = domainParts[domainParts.length - 1];

  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { isValid: false, error: "Email domain must end with a valid extension (e.g., .com, .org, .net, .pharmacy)." };
  }

  // Check for consecutive dots
  if (cleaned.includes("..")) {
    return { isValid: false, error: "Email address cannot contain consecutive dots (..)." };
  }

  // Check for typo suggestions
  if (DOMAIN_TYPOS[domain]) {
    const suggestedDomain = DOMAIN_TYPOS[domain];
    const suggestedEmail = `${username}@${suggestedDomain}`;
    return {
      isValid: true,
      domain,
      suggestion: suggestedEmail,
    };
  }

  // Check disposable domains
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      isValid: false,
      domain,
      error: `Disposable email address (@${domain}) is not allowed. Please use a valid pharmacy or personal email.`,
    };
  }

  // Check fake/non-functional domains
  if (FAKE_NON_FUNCTIONAL_DOMAINS.has(domain)) {
    return {
      isValid: false,
      domain,
      error: `The email domain (@${domain}) is restricted. Please provide a valid active business or personal email.`,
    };
  }

  return {
    isValid: true,
    domain,
  };
}
