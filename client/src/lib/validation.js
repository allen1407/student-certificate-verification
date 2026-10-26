import { awardDateToTimestamp } from './registry';

const STUDENT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,63}$/;
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function validateIssueForm({ studentRef, certificateType, awardDate, file }) {
  const errors = {};
  if (!STUDENT_REF_PATTERN.test(studentRef.trim())) {
    errors.studentRef = 'Use 1–64 letters, digits, spaces or . _ / - (e.g. an enrolment number).';
  }
  const type = certificateType.trim();
  if (!type) errors.certificateType = 'Enter the qualification or certificate type.';
  else if (new TextEncoder().encode(type).length > 100) errors.certificateType = 'Keep it under 100 characters.';
  const timestamp = awardDateToTimestamp(awardDate);
  if (timestamp === null) errors.awardDate = 'Enter a valid date.';
  else if (awardDate > todayIso()) errors.awardDate = 'The award date cannot be in the future.';
  if (!file) errors.file = 'Attach the final certificate file.';
  return errors;
}
